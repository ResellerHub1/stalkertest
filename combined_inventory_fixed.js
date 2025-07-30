/**
 * Combined inventory tracker for Amazon sellers
 * 
 * This module manages cached inventory data without any Amazon scraping
 * to avoid 503 blocking issues. Uses only cached data sources.
 */

const fs = require('fs');
const path = require('path');

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
 * Get complete inventory for a seller using only cached data
 * @param {string} sellerId - Amazon seller ID
 * @param {boolean} forceRefresh - Ignored (no scraping)
 * @returns {Promise<Array>} - Cached products only
 */
async function getCompleteInventory(sellerId, forceRefresh = false) {
    console.log(`🔄 Getting complete inventory for seller ${sellerId} (cache only)...`);
    
    // Get cached inventory
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

module.exports = {
    getCompleteInventory,
    getCachedInventory
};