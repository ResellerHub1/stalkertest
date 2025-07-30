/**
 * Keepa-Based Product Tracker
 * 
 * Since Keepa doesn't provide seller inventory endpoints, this approach:
 * 1. Uses Keepa API to track individual ASINs we already know about
 * 2. Monitors price changes and seller information through Keepa
 * 3. Builds inventory incrementally as we discover new ASINs
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Get product data from Keepa API for known ASINs
 * @param {Array} asinList - List of ASINs to check
 * @param {string} marketplace - Amazon marketplace
 * @returns {Promise<Array>} - Products with Keepa data
 */
async function getKeepaProductData(asinList, marketplace = 'co.uk') {
    const apiKey = process.env.KEEPA_API_KEY;
    if (!apiKey) {
        console.log('⚠️ No Keepa API key found');
        return [];
    }

    const domainMap = {
        'com': 1, 'co.uk': 3, 'de': 4, 'fr': 5, 'co.jp': 6, 'ca': 7, 'it': 8, 'es': 9, 'in': 10, 'com.mx': 11
    };
    const domain = domainMap[marketplace] || 3;

    if (!asinList || asinList.length === 0) {
        return [];
    }

    console.log(`🔍 Getting Keepa data for ${asinList.length} ASINs...`);

    try {
        // Process ASINs in batches of 100 (Keepa limit)
        const batches = [];
        for (let i = 0; i < asinList.length; i += 100) {
            batches.push(asinList.slice(i, i + 100));
        }

        const allProducts = [];
        
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} ASINs)`);

            const response = await axios.get('https://api.keepa.com/product', {
                params: {
                    key: apiKey,
                    domain: domain,
                    asin: batch.join(','),
                    stats: 1,
                    offers: 20, // Get seller offers
                    update: 0,  // Don't update, use cached data
                    history: 0  // Don't need price history
                },
                timeout: 60000
            });

            if (response.data && response.data.products) {
                const batchProducts = response.data.products.map(product => ({
                    asin: product.asin,
                    title: product.title || 'Unknown Title',
                    link: `https://www.amazon.${domain === 3 ? 'co.uk' : 'com'}/dp/${product.asin}`,
                    marketplace: domain === 3 ? 'UK' : 'US',
                    seller_offers: extractSellerOffers(product),
                    current_price: formatPrice(product.stats?.current?.[0], domain),
                    amazon_price: formatPrice(product.stats?.current?.[18], domain), // Amazon's price
                    keepa_data: {
                        salesRank: product.stats?.current?.[3],
                        rating: product.stats?.current?.[16],
                        reviewCount: product.stats?.current?.[17],
                        lastUpdate: new Date().toISOString()
                    },
                    source: 'keepa_api'
                }));

                allProducts.push(...batchProducts);
                console.log(`✅ Processed ${batchProducts.length} products from batch ${i + 1}`);
            }

            // Add delay between batches to respect rate limits
            if (i < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log(`✅ Retrieved Keepa data for ${allProducts.length} products`);
        return allProducts;

    } catch (error) {
        console.error(`❌ Keepa API error:`, error.response?.data || error.message);
        return [];
    }
}

/**
 * Extract seller offers from Keepa product data
 * @param {Object} product - Keepa product object
 * @returns {Array} - Array of seller offers
 */
function extractSellerOffers(product) {
    if (!product.offers || !Array.isArray(product.offers)) {
        return [];
    }

    return product.offers.map(offer => ({
        sellerId: offer.sellerId,
        sellerName: offer.sellerName || 'Unknown Seller',
        price: offer.price,
        condition: offer.condition,
        fulfillment: offer.fulfillment,
        lastSeen: offer.lastSeen
    }));
}

/**
 * Format price from Keepa data
 * @param {number} price - Price in Keepa format
 * @param {number} domain - Domain code
 * @returns {string} - Formatted price
 */
function formatPrice(price, domain) {
    if (!price || price === -1) {
        return 'Not available';
    }
    
    const currency = domain === 3 ? '£' : '$';
    return `${currency}${(price / 100).toFixed(2)}`;
}

/**
 * Update cached products with Keepa data
 * @param {string} sellerId - Seller ID
 * @param {Array} cachedProducts - Existing cached products
 * @returns {Promise<Array>} - Updated products with Keepa data
 */
async function enhanceProductsWithKeepa(sellerId, cachedProducts) {
    if (!cachedProducts || cachedProducts.length === 0) {
        console.log(`📭 No cached products found for seller ${sellerId}`);
        return [];
    }

    console.log(`🔄 Enhancing ${cachedProducts.length} cached products with Keepa data...`);

    // Extract ASINs from cached products
    const asinList = cachedProducts
        .filter(product => product.asin)
        .map(product => product.asin);

    if (asinList.length === 0) {
        console.log(`⚠️ No valid ASINs found in cached products`);
        return cachedProducts;
    }

    // Get Keepa data for these ASINs
    const keepaProducts = await getKeepaProductData(asinList, 'co.uk');

    // Merge cached data with Keepa data
    const enhancedProducts = cachedProducts.map(cachedProduct => {
        const keepaProduct = keepaProducts.find(kp => kp.asin === cachedProduct.asin);
        
        if (keepaProduct) {
            // Check if this seller is in the Keepa offers
            const sellerOffer = keepaProduct.seller_offers?.find(offer => offer.sellerId === sellerId);
            
            return {
                ...cachedProduct,
                current_price: keepaProduct.current_price,
                seller_active: !!sellerOffer,
                seller_price: sellerOffer ? formatPrice(sellerOffer.price, 3) : 'Not selling',
                seller_condition: sellerOffer?.condition || 'Unknown',
                keepa_verified: true,
                keepa_data: keepaProduct.keepa_data,
                last_keepa_check: new Date().toISOString()
            };
        } else {
            // Product not found in Keepa, mark as potentially inactive
            return {
                ...cachedProduct,
                keepa_verified: false,
                seller_active: false,
                last_keepa_check: new Date().toISOString()
            };
        }
    });

    // Filter to only return products where the seller is actually selling
    const activeProducts = enhancedProducts.filter(product => 
        product.seller_active !== false // Include unknowns for safety
    );

    console.log(`✅ Enhanced products: ${enhancedProducts.length} total, ${activeProducts.length} actively sold by seller`);
    return activeProducts;
}

/**
 * Main function to get seller products using Keepa + cached data approach
 * @param {string} sellerId - Amazon seller ID
 * @param {Array} cachedProducts - Cached products from previous scraping
 * @returns {Promise<Array>} - Verified products currently sold by the seller
 */
async function getSellerProductsWithKeepa(sellerId, cachedProducts) {
    console.log(`🔍 Getting seller products for ${sellerId} using Keepa verification...`);
    
    try {
        const enhancedProducts = await enhanceProductsWithKeepa(sellerId, cachedProducts);
        
        // Additional filtering for quality
        const qualityProducts = enhancedProducts.filter(product => {
            // Must have basic info
            if (!product.asin || !product.title) return false;
            
            // If Keepa verified and seller not active, exclude
            if (product.keepa_verified && product.seller_active === false) return false;
            
            return true;
        });

        console.log(`📊 Final result: ${qualityProducts.length} verified products for seller ${sellerId}`);
        return qualityProducts;

    } catch (error) {
        console.error(`❌ Error getting seller products with Keepa:`, error.message);
        // Fallback to cached products if Keepa fails
        return cachedProducts || [];
    }
}

module.exports = {
    getKeepaProductData,
    enhanceProductsWithKeepa,
    getSellerProductsWithKeepa
};