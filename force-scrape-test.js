/**
 * This script tests our enhanced Amazon scraper 
 * with forced refresh to ensure we find all products
 */

require('dotenv').config();

// Import the direct Keepa search implementation
const { getKeepaSellerProductsDirectly } = require('./utils/keepa_direct_search');

// Target seller ID
const SELLER_ID = 'A3EH2U557HPK44'; // The seller with 1,000+ products

async function runTest() {
    console.log(`🔍 Testing enhanced scraping for ${SELLER_ID}...`);
    
    try {
        // Use direct Keepa search to find all products
        console.log('⏳ This may take a minute, scraping large inventory...');
        const products = await getKeepaSellerProductsDirectly(SELLER_ID);
        
        console.log(`\n✅ Found ${products.length} products for seller ${SELLER_ID}`);
        
        if (products.length > 0) {
            // Show sample products
            console.log('\n📊 Sample products:');
            const sampleSize = Math.min(5, products.length);
            
            for (let i = 0; i < sampleSize; i++) {
                const product = products[i];
                console.log(`  ${i+1}. ${product.asin}: ${product.title.substring(0, 60)}${product.title.length > 60 ? '...' : ''}`);
            }
            
            // Analyze source distribution
            const sources = {};
            products.forEach(product => {
                const source = product.source || 'unknown';
                sources[source] = (sources[source] || 0) + 1;
            });
            
            console.log('\n📈 Data source breakdown:');
            Object.entries(sources).forEach(([source, count]) => {
                const percentage = ((count / products.length) * 100).toFixed(1);
                console.log(`  - ${source}: ${count} products (${percentage}%)`);
            });
        } else {
            console.log('❌ No products found!');
        }
    } catch (error) {
        console.error('❌ Error during test:', error);
    }
}

// Run the test
runTest();