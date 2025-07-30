/**
 * Node.js bridge to Python Amazon scraper
 * This allows calling the Python scraper from JavaScript
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Path to the Python script
const SCRAPER_PATH = path.join(__dirname, 'amazon_scraper.py');

/**
 * Execute the Python scraper with arguments and return results
 * @param {string} functionName - Name of the Python function to call
 * @param {array} args - Arguments to pass to the Python function
 * @returns {Promise<any>} - Results from Python
 */
async function executePythonScript(functionName, args) {
    return new Promise((resolve, reject) => {
        // Make sure the Python file exists
        if (!fs.existsSync(SCRAPER_PATH)) {
            reject(new Error(`Python scraper not found at: ${SCRAPER_PATH}`));
            return;
        }

        // Construct the Python script to run the specific function with args
        const pythonCode = `
import sys
import json
from amazon_scraper import ${functionName}

try:
    args = json.loads('${JSON.stringify(args)}')
    result = ${functionName}(*args)
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
        
        // Create a temporary Python file to run
        const tempFilePath = path.join(__dirname, `_temp_${Date.now()}.py`);
        fs.writeFileSync(tempFilePath, pythonCode);

        console.log(`🐍 Running Python script for ${functionName}...`);
        
        // Execute the Python script
        const pythonProcess = spawn('python3', [tempFilePath]);
        
        let outputData = '';
        let errorData = '';
        
        // Collect stdout data
        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });
        
        // Collect stderr data
        pythonProcess.stderr.on('data', (data) => {
            errorData += data.toString();
            console.error(`🐍 Python error: ${data.toString()}`);
        });
        
        // Handle Python process exit
        pythonProcess.on('close', (code) => {
            // Clean up temp file
            try {
                fs.unlinkSync(tempFilePath);
            } catch (error) {
                console.error(`Error removing temp file: ${error.message}`);
            }
            
            if (code !== 0) {
                console.error(`🐍 Python process exited with code ${code}`);
                reject(new Error(`Python process failed: ${errorData}`));
                return;
            }
            
            // Parse the JSON output
            try {
                const result = JSON.parse(outputData);
                if (result && result.error) {
                    reject(new Error(`Python error: ${result.error}`));
                } else {
                    resolve(result);
                }
            } catch (error) {
                console.error(`Error parsing Python output: ${error.message}`);
                console.error(`Raw output: ${outputData}`);
                reject(error);
            }
        });
    });
}

/**
 * Get all products from an Amazon seller
 * @param {string} sellerId - Amazon seller ID
 * @param {string} marketplace - Amazon marketplace (default: co.uk)
 * @param {boolean} forceRefresh - Force refresh cache
 * @returns {Promise<Array>} - Array of products
 */
async function getSellerProducts(sellerId, marketplace = 'co.uk', forceRefresh = false) {
    console.log(`🛒 Getting products for seller ${sellerId} from Amazon ${marketplace}`);
    try {
        const products = await executePythonScript('get_seller_products', [sellerId, marketplace, forceRefresh]);
        console.log(`✅ Found ${products.length} products for seller ${sellerId}`);
        
        // Enhance product data with additional fields the Discord bot expects
        return products.map(product => ({
            ...product,
            asin: product.asin,
            title: product.title,
            marketplace: `UK`,
            seller: {
                id: sellerId,
                name: product.seller_name || 'Unknown'
            },
            sellerInfo: {
                price: product.price_text ? parsePrice(product.price_text) : 0,
                condition: 0  // Assuming new, could be enhanced later
            },
            directFromSeller: true,  // These are directly from the seller
            amazon_scraper: true     // Mark as coming from our scraper
        }));
    } catch (error) {
        console.error(`❌ Error getting seller products: ${error.message}`);
        return [];
    }
}

/**
 * Get a seller's display name
 * @param {string} sellerId - Amazon seller ID
 * @param {string} marketplace - Amazon marketplace (default: co.uk)
 * @returns {Promise<string|null>} - Seller name or null
 */
async function getSellerName(sellerId, marketplace = 'co.uk') {
    console.log(`🏪 Getting seller name for ${sellerId}`);
    try {
        const sellerName = await executePythonScript('get_seller_name', [sellerId, marketplace]);
        console.log(`✅ Found seller name: ${sellerName}`);
        return sellerName;
    } catch (error) {
        console.error(`❌ Error getting seller name: ${error.message}`);
        return null;
    }
}

/**
 * Try to extract numeric price from a price string
 * @param {string} priceText - Price text (e.g., "£10.99")
 * @returns {number} - Numeric price or 0 if parsing fails
 */
function parsePrice(priceText) {
    try {
        // Remove currency symbols and extract the number
        const numericStr = priceText.replace(/[^0-9.]/g, '');
        return parseFloat(numericStr) || 0;
    } catch (error) {
        console.error(`Error parsing price "${priceText}": ${error.message}`);
        return 0;
    }
}

module.exports = {
    getSellerProducts,
    getSellerName
};