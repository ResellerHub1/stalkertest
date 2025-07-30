/**
 * Direct product search using Keepa's web interface
 * This module provides an alternative way to get seller products
 * when the API approach doesn't return all available products
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Check if Puppeteer is installed
let puppeteerAvailable = false;
try {
    require.resolve('puppeteer');
    puppeteerAvailable = true;
} catch (e) {
    console.log('📝 Puppeteer not available. Web scraping will be limited.');
}

/**
 * Get seller products from Keepa using a direct approach
 * This uses Keepa's website search which can find more products
 * @param {string} sellerId - Amazon seller ID
 * @returns {Promise<Array>} - Array of products
 */
async function getKeepaSellerProductsDirectly(sellerId) {
    console.log(`🔍 Attempting direct Keepa search for seller ${sellerId}...`);
    
    // First try Keepa's standard API
    try {
        const products = await searchKeepaAPIForSeller(sellerId);
        if (products.length > 0) {
            console.log(`✅ Found ${products.length} products via Keepa API!`);
            return products;
        }
    } catch (error) {
        console.log(`ℹ️ Standard Keepa API approach failed: ${error.message}`);
    }
    
    // If we have puppeteer, use that for a more advanced approach
    if (puppeteerAvailable) {
        try {
            console.log(`🔍 Attempting Puppeteer-based Keepa scraping...`);
            const products = await scrapeKeepaWebsiteForSeller(sellerId);
            if (products.length > 0) {
                console.log(`✅ Found ${products.length} products via Keepa web scraping!`);
                return products;
            }
        } catch (error) {
            console.log(`ℹ️ Puppeteer-based scraping failed: ${error.message}`);
        }
    }
    
    // If all else fails, try the Python-based approach
    try {
        const products = await usePythonScraperForKeepa(sellerId);
        if (products.length > 0) {
            console.log(`✅ Found ${products.length} products via Python Keepa scraper!`);
            return products;
        }
    } catch (error) {
        console.log(`ℹ️ Python-based scraping failed: ${error.message}`);
    }
    
    console.log(`❌ All direct Keepa approaches failed for seller ${sellerId}`);
    return [];
}

/**
 * Search Keepa API for seller products in the best way possible
 */
async function searchKeepaAPIForSeller(sellerId) {
    const apiKey = process.env.KEEPA_API_KEY;
    if (!apiKey) {
        throw new Error('No Keepa API key available');
    }
    
    // Use the preferred approach for searching seller products
    const sellerData = await axios.get('https://api.keepa.com/product', {
        params: {
            key: apiKey,
            domain: 3, // UK
            seller: sellerId,
            page: 0,
            perPage: 100
        },
        timeout: 30000
    });
    
    if (!sellerData.data || !sellerData.data.products || sellerData.data.products.length === 0) {
        throw new Error('No products found in Keepa API response');
    }
    
    return sellerData.data.products.map(product => ({
        asin: product.asin,
        title: product.title,
        link: `https://www.amazon.co.uk/dp/${product.asin}`,
        marketplace: 'UK',
        seller_id: sellerId,
        seller_name: product.sellerName || 'Unknown',
        source: 'keepa_direct'
    }));
}

/**
 * Use Python to scrape Keepa website
 * This is a fallback approach when other methods fail
 */
async function usePythonScraperForKeepa(sellerId) {
    return new Promise((resolve, reject) => {
        const pythonScript = `
import requests
import json
import sys
from bs4 import BeautifulSoup

def scrape_keepa_seller_products(seller_id):
    print(f"Scraping Keepa for seller {seller_id}")
    
    # First try direct seller search
    base_url = f"https://keepa.com/seller/?sellerName={seller_id}&domain=3"
    
    # Use clean session for each request
    session = requests.Session()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive"
    }
    
    response = session.get(base_url, headers=headers)
    
    soup = BeautifulSoup(response.text, 'html.parser')
    
    # Look for product data in script tags
    scripts = soup.find_all('script')
    
    products = []
    for script in scripts:
        if script.string and 'var productData =' in script.string:
            # Extract the product data
            data_start = script.string.find('var productData =') + len('var productData =')
            data_end = script.string.find('};', data_start) + 1
            
            if data_end > data_start:
                try:
                    json_str = script.string[data_start:data_end].strip()
                    product_data = json.loads(json_str)
                    
                    # Process product data
                    if 'products' in product_data:
                        for asin, product in product_data['products'].items():
                            if 'title' in product:
                                products.append({
                                    'asin': asin,
                                    'title': product['title'],
                                    'link': f'https://www.amazon.co.uk/dp/{asin}',
                                    'marketplace': 'UK',
                                    'seller_id': seller_id,
                                    'seller_name': 'Unknown',
                                    'source': 'keepa_python'
                                })
                except Exception as e:
                    print(f"Error parsing product data: {e}")
    
    # If we didn't find any products, try alternative Keepa page
    if not products:
        alternative_url = f"https://keepa.com/#!seller/3-{seller_id}"
        response = session.get(alternative_url, headers=headers)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for product links
        product_links = soup.select('a[href^="/product/"]')
        
        for link in product_links:
            try:
                # Extract ASIN from product URL
                href = link.get('href', '')
                if '/product/' in href:
                    asin = href.split('/')[-1]
                    # Get title if available
                    title_elem = link.select_one('.productTitle')
                    title = title_elem.text if title_elem else "Unknown Product"
                    
                    products.append({
                        'asin': asin,
                        'title': title,
                        'link': f'https://www.amazon.co.uk/dp/{asin}',
                        'marketplace': 'UK',
                        'seller_id': seller_id,
                        'seller_name': 'Unknown',
                        'source': 'keepa_python_alt'
                    })
            except Exception as e:
                print(f"Error processing product link: {e}")
    
    print(f"Found {len(products)} products for seller {seller_id}")
    return products

if __name__ == "__main__":
    if len(sys.argv) > 1:
        seller_id = sys.argv[1]
        products = scrape_keepa_seller_products(seller_id)
        print(json.dumps(products))
    else:
        print("No seller ID provided")
        sys.exit(1)
`;
        
        // Create a temporary Python file
        const tmpDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        
        const scriptPath = path.join(tmpDir, `keepa_scraper_${Date.now()}.py`);
        fs.writeFileSync(scriptPath, pythonScript);
        
        // Run the Python script
        const pythonProcess = spawn('python3', [scriptPath, sellerId]);
        
        let dataString = '';
        let errorString = '';
        
        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });
        
        pythonProcess.stderr.on('data', (data) => {
            errorString += data.toString();
            console.log(`🐍 Python error: ${data.toString()}`);
        });
        
        pythonProcess.on('close', (code) => {
            // Clean up the temporary file
            try {
                fs.unlinkSync(scriptPath);
            } catch (e) {
                console.log(`Warning: Could not delete temporary file: ${e.message}`);
            }
            
            if (code !== 0) {
                return reject(new Error(`Python script exited with code ${code}: ${errorString}`));
            }
            
            try {
                // Find the JSON part of the output
                const jsonStart = dataString.indexOf('[');
                const jsonEnd = dataString.lastIndexOf(']') + 1;
                
                if (jsonStart === -1 || jsonEnd === 0) {
                    console.log('No valid JSON found in Python script output');
                    return resolve([]);
                }
                
                const jsonString = dataString.substring(jsonStart, jsonEnd);
                const products = JSON.parse(jsonString);
                resolve(products);
            } catch (e) {
                console.log(`Error parsing Python script output: ${e.message}`);
                resolve([]);
            }
        });
    });
}

/**
 * Use Puppeteer to scrape Keepa website
 * This is a more advanced approach for when API methods fail
 */
async function scrapeKeepaWebsiteForSeller(sellerId, browser) {
    console.log(`🔍 Using Puppeteer to scrape Keepa website for seller ${sellerId}...`);
    
    try {
        // Import puppeteer
        const puppeteer = require('puppeteer');
        
        // Launch browser
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        // Create a new page
        const page = await browser.newPage();
        
        // Set viewport
        await page.setViewport({ width: 1280, height: 800 });
        
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36');
        
        // Try a direct approach first - Visit the seller page on Keepa
        const url = `https://keepa.com/#!seller/3-${sellerId}`;
        console.log(`📡 Accessing: ${url}`);
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        
        // Wait for the page to load
        await page.waitForTimeout(5000);
        
        // Try to find product data in page
        const products = await page.evaluate(() => {
            try {
                // Check if there's product data in the global window object
                if (window.productData && window.productData.products) {
                    const products = [];
                    Object.entries(window.productData.products).forEach(([asin, product]) => {
                        if (product && product.title) {
                            products.push({
                                asin: asin,
                                title: product.title,
                                link: `https://www.amazon.co.uk/dp/${asin}`,
                                marketplace: 'UK',
                                seller_id: window.sellerIDGlobal || 'unknown',
                                seller_name: window.sellerNameGlobal || 'Unknown',
                                source: 'keepa_puppeteer'
                            });
                        }
                    });
                    return products;
                }
                
                // If no global data, try to scrape the seller products table
                const productRows = document.querySelectorAll('table.productTable tr');
                if (productRows && productRows.length > 0) {
                    return Array.from(productRows).slice(1).map(row => {
                        const asinCell = row.querySelector('td:nth-child(1)');
                        const titleCell = row.querySelector('td:nth-child(2)');
                        
                        if (asinCell && titleCell) {
                            const asin = asinCell.textContent.trim();
                            const title = titleCell.textContent.trim();
                            return {
                                asin: asin,
                                title: title,
                                link: `https://www.amazon.co.uk/dp/${asin}`,
                                marketplace: 'UK',
                                seller_id: window.sellerIDGlobal || 'unknown',
                                seller_name: window.sellerNameGlobal || 'Unknown',
                                source: 'keepa_puppeteer'
                            };
                        }
                        return null;
                    }).filter(Boolean);
                }
                
                return [];
            } catch (e) {
                console.error('Error scraping products:', e);
                return [];
            }
        });
        
        // If we didn't find products, try an alternative approach - seller search
        if (products.length === 0) {
            console.log('🔍 Trying alternative Keepa page approach...');
            
            // Try the seller search page
            await page.goto(`https://keepa.com/seller/?sellerName=${sellerId}&domain=3`, { 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });
            
            // Wait for the page to load
            await page.waitForTimeout(5000);
            
            // Try to extract products
            const altProducts = await page.evaluate(() => {
                const products = [];
                
                // Look for product links
                const productLinks = document.querySelectorAll('a[href^="/product/"]');
                
                productLinks.forEach(link => {
                    try {
                        const asin = link.href.split('/').pop();
                        const titleElem = link.querySelector('.productTitle');
                        const title = titleElem ? titleElem.textContent.trim() : 'Unknown Product';
                        
                        products.push({
                            asin: asin,
                            title: title,
                            link: `https://www.amazon.co.uk/dp/${asin}`,
                            marketplace: 'UK',
                            seller_id: window.sellerIDGlobal || 'unknown',
                            seller_name: window.sellerNameGlobal || 'Unknown',
                            source: 'keepa_puppeteer_alt'
                        });
                    } catch (e) {
                        console.error('Error processing product:', e);
                    }
                });
                
                return products;
            });
            
            // Merge in any alternative products found
            if (altProducts && altProducts.length > 0) {
                console.log(`✅ Found ${altProducts.length} products from alternative page`);
                Array.prototype.push.apply(products, altProducts);
            }
        }
        
        // Close the browser
        await browser.close();
        
        // De-duplicate products by ASIN
        const uniqueProducts = {};
        products.forEach(product => {
            if (product.asin) {
                uniqueProducts[product.asin] = product;
            }
        });
        
        const finalProducts = Object.values(uniqueProducts);
        console.log(`✅ Found ${finalProducts.length} unique products using Puppeteer`);
        
        return finalProducts;
    } catch (error) {
        console.error('Error in Puppeteer scraping:', error);
        return [];
    }
}

module.exports = {
    getKeepaSellerProductsDirectly
};