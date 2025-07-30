/**
 * Keepa API Integration for Seller Products
 * 
 * This module properly uses Keepa API to get seller products
 * instead of scraping Amazon directly.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Get seller products using Keepa API
 * @param {string} sellerId - Amazon seller ID
 * @param {string} marketplace - Amazon marketplace (default: co.uk)
 * @returns {Promise<Array>} - Array of products from Keepa
 */
async function getSellerProductsFromKeepa(sellerId, marketplace = 'co.uk') {
    const apiKey = process.env.KEEPA_API_KEY;
    if (!apiKey) {
        throw new Error('Keepa API key not found in environment variables');
    }

    const domainMap = {
        'com': 1,    // US
        'co.uk': 3,  // UK
        'de': 4,     // Germany
        'fr': 5,     // France
        'co.jp': 6,  // Japan
        'ca': 7,     // Canada
        'it': 8,     // Italy
        'es': 9,     // Spain
        'in': 10,    // India
        'com.mx': 11 // Mexico
    };

    const domain = domainMap[marketplace] || 3; // Default to UK

    console.log(`🔍 Getting seller products for ${sellerId} from Keepa API (domain: ${domain})`);

    try {
        // Method 1: Try to get seller information first
        console.log(`📋 Step 1: Getting seller information...`);
        const sellerResponse = await axios.get('https://api.keepa.com/seller', {
            params: {
                key: apiKey,
                domain: domain,
                seller: sellerId
            },
            timeout: 30000
        });

        console.log(`🔍 Seller API response:`, JSON.stringify(sellerResponse.data, null, 2));

        // Method 2: Try product search with seller parameter
        console.log(`📋 Step 2: Searching for products by seller...`);
        try {
            const searchResponse = await axios.get('https://api.keepa.com/search', {
                params: {
                    key: apiKey,
                    domain: domain,
                    type: 'product',
                    seller: sellerId,
                    page: 0,
                    perPage: 50
                },
                timeout: 30000
            });

            console.log(`🔍 Search API response:`, JSON.stringify(searchResponse.data, null, 2));

            if (searchResponse.data && searchResponse.data.asinList && searchResponse.data.asinList.length > 0) {
                console.log(`✅ Found ${searchResponse.data.asinList.length} ASINs from Keepa search`);
                
                // Get detailed product information for the ASINs
                const productResponse = await getProductDetails(searchResponse.data.asinList.slice(0, 50), domain, apiKey);
                return productResponse;
            }
        } catch (searchError) {
            console.log(`⚠️ Search method failed:`, searchError.response?.data || searchError.message);
        }

        // Method 3: Try category-based approach for seller
        console.log(`📋 Step 3: Trying category-based seller lookup...`);
        try {
            const categoryResponse = await axios.get('https://api.keepa.com/bestsellers', {
                params: {
                    key: apiKey,
                    domain: domain,
                    category: 0, // All categories
                    seller: sellerId
                },
                timeout: 30000
            });

            console.log(`🔍 Category API response:`, JSON.stringify(categoryResponse.data, null, 2));

            if (categoryResponse.data && categoryResponse.data.asinList && categoryResponse.data.asinList.length > 0) {
                console.log(`✅ Found ${categoryResponse.data.asinList.length} ASINs from category search`);
                const productResponse = await getProductDetails(categoryResponse.data.asinList.slice(0, 50), domain, apiKey);
                return productResponse;
            }
        } catch (categoryError) {
            console.log(`⚠️ Category method failed:`, categoryError.response?.data || categoryError.message);
        }

        // If we get here, Keepa doesn't have seller product data
        console.log(`ℹ️ Keepa API doesn't have direct seller product data for ${sellerId}`);
        console.log(`ℹ️ This is normal - Keepa focuses on individual product tracking rather than seller inventories`);
        
        return [];

    } catch (error) {
        console.error(`❌ Keepa API error:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * Get detailed product information from ASINs
 * @param {Array} asinList - List of ASINs
 * @param {number} domain - Keepa domain code
 * @param {string} apiKey - Keepa API key
 * @returns {Promise<Array>} - Array of detailed product info
 */
async function getProductDetails(asinList, domain, apiKey) {
    if (!asinList || asinList.length === 0) {
        return [];
    }

    console.log(`📦 Getting product details for ${asinList.length} ASINs...`);

    try {
        const productResponse = await axios.get('https://api.keepa.com/product', {
            params: {
                key: apiKey,
                domain: domain,
                asin: asinList.join(','),
                stats: 1,
                update: 0,
                history: 0
            },
            timeout: 45000
        });

        if (productResponse.data && productResponse.data.products) {
            const products = productResponse.data.products.map(product => ({
                asin: product.asin,
                title: product.title || 'Unknown Title',
                link: `https://www.amazon.${domain === 3 ? 'co.uk' : 'com'}/dp/${product.asin}`,
                marketplace: domain === 3 ? 'UK' : 'US',
                seller_id: product.sellerIds ? product.sellerIds[0] : 'Unknown',
                seller_name: product.brand || 'Unknown Seller',
                price_text: getFormattedPrice(product, domain),
                source: 'keepa_api',
                lastUpdate: new Date().toISOString()
            }));

            console.log(`✅ Retrieved ${products.length} product details from Keepa`);
            return products;
        }

        return [];
    } catch (error) {
        console.error(`❌ Error getting product details:`, error.response?.data || error.message);
        return [];
    }
}

/**
 * Format price from Keepa product data
 * @param {Object} product - Keepa product object
 * @param {number} domain - Domain code for currency
 * @returns {string} - Formatted price string
 */
function getFormattedPrice(product, domain) {
    if (!product.stats || !product.stats.current) {
        return 'Price not available';
    }

    const currentPrice = product.stats.current[0];
    if (currentPrice === -1 || currentPrice === null) {
        return 'Price not available';
    }

    const currency = domain === 3 ? '£' : '$';
    const price = (currentPrice / 100).toFixed(2);
    return `${currency}${price}`;
}

/**
 * Test Keepa seller API with a specific seller
 * @param {string} sellerId - Seller ID to test
 */
async function testKeepaSellerAPI(sellerId = 'A3EH2U557HPK44') {
    console.log(`🧪 Testing Keepa seller API with seller: ${sellerId}`);
    
    try {
        const products = await getSellerProductsFromKeepa(sellerId, 'co.uk');
        console.log(`📊 Test results: Found ${products.length} products`);
        
        if (products.length > 0) {
            console.log(`📦 Sample product:`, {
                asin: products[0].asin,
                title: products[0].title.substring(0, 50) + '...',
                price: products[0].price_text
            });
        }
        
        return products;
    } catch (error) {
        console.error(`❌ Test failed:`, error.message);
        return [];
    }
}

module.exports = {
    getSellerProductsFromKeepa,
    testKeepaSellerAPI
};