/**
 * Enhanced Node.js bridge to Python Amazon scraper
 * This bridge calls our advanced Amazon scraper that finds more products
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Execute the enhanced Python scraper with arguments
 * @param {string} sellerId - Amazon seller ID to scrape
 * @param {string} marketplace - Amazon marketplace (default: co.uk)
 * @param {boolean} forceRefresh - Force refresh cache
 * @returns {Promise<Array>} - Products from the seller
 */
async function getEnhancedSellerProducts(sellerId, marketplace = 'co.uk', forceRefresh = false) {
    console.log(`🐍 Running enhanced Amazon scraper for seller ${sellerId}...`);
    
    return new Promise((resolve, reject) => {
        // Path to the Python script
        const scriptPath = path.join(__dirname, 'enhanced_amazon_scraper.py');
        
        // Check if script exists
        if (!fs.existsSync(scriptPath)) {
            return reject(new Error(`Enhanced Amazon scraper script not found: ${scriptPath}`));
        }
        
        // Arguments to pass to the Python script
        const args = [
            scriptPath,
            sellerId,
            marketplace,
            forceRefresh.toString()
        ];
        
        // Spawn a Python process
        const pythonProcess = spawn('python3', args);
        
        let dataString = '';
        let errorString = '';
        
        // Collect data from script
        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });
        
        // Collect error output
        pythonProcess.stderr.on('data', (data) => {
            console.log(`🐍 Python error: ${data.toString()}`);
            errorString += data.toString();
        });
        
        // Handle completion
        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.log(`🐍 Python process exited with code ${code}`);
                console.log(`🐍 Error: ${errorString}`);
                return reject(new Error(`Process exited with code ${code}: ${errorString}`));
            }
            
            try {
                // Parse the JSON output from the Python script
                const jsonStart = dataString.indexOf('[');
                const jsonEnd = dataString.lastIndexOf(']') + 1;
                
                if (jsonStart === -1 || jsonEnd === 0) {
                    console.log('No valid JSON found in Python output');
                    console.log('Raw output:', dataString);
                    return resolve([]);
                }
                
                const jsonStr = dataString.substring(jsonStart, jsonEnd);
                const products = JSON.parse(jsonStr);
                
                console.log(`✅ Found ${products.length} products for seller ${sellerId}`);
                resolve(products);
            } catch (error) {
                console.log(`Error parsing Python output: ${error.message}`);
                console.log('Raw output:', dataString);
                reject(error);
            }
        });
    });
}

module.exports = {
    getEnhancedSellerProducts
};