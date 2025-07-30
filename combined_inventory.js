/**
 * Combined inventory tracker for Amazon sellers
 * 
 * This module manages multiple data sources and maintains a
 * persistent cache of all known products from each seller.
 * It incrementally builds a complete inventory over time,
 * even if individual scraping sessions are rate-limited.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const amazonScraper = require('./amazon_bridge');
const { getEnhancedSellerProducts } = require('./enhanced_amazon_bridge');
const { getKeepaSellerProductsDirectly } = require('./keepa_direct_search');

// Directory for combined inventory cache
const CACHE_DIR = path.join(__dirname, '../data/inventory_cache');
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Get cached inventory for a seller
 * @param {string} sellerId - Amazon seller ID
 * @returns {Object} - Cached inventory data or empty object
 */
function getCachedInventory(sellerId) {
    const cachePath = path.join(CACHE_DIR, `${sellerId}_combined.json`);
    
    // Ensure cache directory exists
    if (!fs.existsSync(CACHE_DIR)) {
        console.log(`📁 Creating cache directory ${CACHE_DIR}`);
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    
    if (fs.existsSync(cachePath)) {
        try {
            const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
            console.log(`📂 Loaded combined cache for ${sellerId} with ${Object.keys(cacheData.products || {}).length} products`);
            return cacheData;
        } catch (error) {
            console.log(`⚠️ Error reading combined cache: ${error.message}`);
            const newCache = { products: {}, lastUpdate: null, sources: [] };
            // Save the new cache to ensure it exists
            fs.writeFileSync(cachePath, JSON.stringify(newCache, null, 2));
            return newCache;
        }
    } else {
        console.log(`📁 No cache exists for seller ${sellerId}, creating new cache file`);
        const newCache = { products: {}, lastUpdate: null, sources: [] };
        // Create the cache file
        fs.writeFileSync(cachePath, JSON.stringify(newCache, null, 2));
        return newCache;
    }
}

/**
 * Update the combined inventory cache
 * @param {string} sellerId - Amazon seller ID
 * @param {Array} newProducts - New products to add to cache
 * @param {string} source - Source of the products
 */
function updateCombinedCache(sellerId, newProducts, source) {
    if (!newProducts || newProducts.length === 0) {
        console.log(`ℹ️ No new products to add from ${source}`);
        return;
    }
    
    const cachePath = path.join(CACHE_DIR, `${sellerId}_combined.json`);
    const cachedData = getCachedInventory(sellerId);
    let productsAdded = 0;
    
    // Add new products to cache (deduplicating by ASIN)
    newProducts.forEach(product => {
        if (product && product.asin) {
            // Only add if not exists or has more data
            if (!cachedData.products[product.asin] || 
                !cachedData.products[product.asin].title && product.title) {
                cachedData.products[product.asin] = {
                    ...product,
                    firstSeen: cachedData.products[product.asin]?.firstSeen || new Date().toISOString(),
                    lastSeen: new Date().toISOString(),
                    sources: [...new Set([...(cachedData.products[product.asin]?.sources || []), source])]
                };
                productsAdded++;
            } else {
                // Update existing product's lastSeen and sources
                cachedData.products[product.asin].lastSeen = new Date().toISOString();
                cachedData.products[product.asin].sources = [
                    ...new Set([...cachedData.products[product.asin].sources, source])
                ];
            }
        }
    });
    
    // Update last update timestamp
    cachedData.lastUpdate = new Date().toISOString();
    cachedData.sellerName = newProducts[0]?.seller_name || cachedData.sellerName;
    
    // Save updated cache
    try {
        fs.writeFileSync(cachePath, JSON.stringify(cachedData, null, 2));
        console.log(`✅ Updated combined cache for ${sellerId}: added ${productsAdded} new products from ${source}`);
    } catch (error) {
        console.log(`❌ Error updating combined cache: ${error.message}`);
    }
}

/**
 * Get complete inventory for a seller from all sources
 * This incrementally builds a full inventory over time
 * @param {string} sellerId - Amazon seller ID
 * @param {boolean} forceRefresh - Whether to force refresh data
 * @returns {Promise<Array>} - Combined products
 */
async function getCompleteInventory(sellerId, forceRefresh = false) {
    console.log(`🔄 Getting complete inventory for seller ${sellerId}...`);
    
    // Get cached inventory first
    const cachedInventory = getCachedInventory(sellerId);
    const cachedProductsCount = Object.keys(cachedInventory.products || {}).length;
    
    console.log(`📊 Found ${cachedProductsCount} products in combined cache`);
    
    // ONLY USE CACHED DATA - NO SCRAPING DUE TO 503 BLOCKING
    if (cachedProductsCount > 0) {
        console.log(`✅ Using cached data exclusively (${cachedProductsCount} products) - no scraping needed`);
        const productsList = Object.values(cachedInventory.products || {});
        
        // Return the cached products without any scraping
        return productsList.map(product => ({
            asin: product.asin,
            title: product.title || 'Unknown Product',
            link: product.link || `https://www.amazon.co.uk/dp/${product.asin}`,
            price: product.price,
            seller_id: sellerId,
            marketplace: 'UK',
            seller_name: cachedInventory.sellerName || 'Unknown Seller',
            source: 'cache'
        }));
    }
    
    console.log(`⚠️ No cached data found for seller ${sellerId} - returning empty array`);
    return [];
}
            source: 'combined',
            active: true // Mark as active since we've filtered out inactive ones
        }));
    } catch (error) {
        console.log(`❌ Error getting complete inventory: ${error.message}`);
        
        // If all else fails, return the cached products (but still filter for valid ones)
        if (cachedProductsCount > 0) {
            console.log(`📂 Returning filtered products from cache only`);
            const cachedProductsList = Object.values(cachedInventory.products || {});
            
            const validCachedProducts = cachedProductsList.filter(product => {
                // Skip products without basic info
                if (!product.asin || !product.title) return false;
                
                // Skip explicitly unavailable products
                if (product.unavailable === true) return false;
                
                // Skip products with unavailability hints in title
                const lowerTitle = (product.title || "").toLowerCase();
                if (lowerTitle.includes("unavailable") || 
                    lowerTitle.includes("no longer available") || 
                    lowerTitle.includes("out of stock")) {
                    return false;
                }
                
                return true;
            });
            
            console.log(`📂 After filtering, returning ${validCachedProducts.length} valid products from cache (out of ${cachedProductsList.length} total)`);
            
            return validCachedProducts.map(product => ({
                asin: product.asin,
                title: product.title || 'Unknown Product',
                link: product.link || `https://www.amazon.co.uk/dp/${product.asin}`,
                price: product.price,
                seller_id: sellerId,
                marketplace: 'UK',
                seller_name: cachedInventory.sellerName || 'Unknown Seller',
                source: 'cache_only',
                active: true // Mark as active since we've filtered
            }));
        }
        
        return [];
    }
}

module.exports = {
    getCompleteInventory
};