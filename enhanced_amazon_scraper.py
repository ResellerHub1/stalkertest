"""
Enhanced Amazon Seller Inventory Scraper

This module provides advanced scraping for Amazon seller inventories,
designed to find more products than the basic approach.
"""

import json
import os
import time
import random
import logging
import sys
import re
import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('enhanced_amazon_scraper')

# Cache directory
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../data/cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Constants
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
]

# Extended URL patterns to try for seller storefronts
SELLER_URL_PATTERNS = [
    # Standard patterns
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&page={page}",
    "https://www.amazon.{marketplace}/s?me={seller_id}&marketplaceID=A1F83G8C2ARO7P&page={page}",
    "https://www.amazon.{marketplace}/s?merchant={seller_id}&page={page}",
    
    # Seller-specific patterns
    "https://www.amazon.{marketplace}/shops/{seller_id}/page/{page}",
    "https://www.amazon.{marketplace}/stores/{seller_id}/page/{page}",
    
    # Category-specific patterns
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&rh=p_6%3A{seller_id}&page={page}",
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&rh=n%3A65801031&page={page}",  # Beauty category
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&rh=n%3A66280031&page={page}",  # Electronics
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&rh=n%3A117332031&page={page}", # Clothing
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&rh=n%3A560798&page={page}",    # Toys
    
    # Different sorting methods
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&s=price-desc-rank&page={page}",
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&s=price-asc-rank&page={page}",
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&s=date-desc-rank&page={page}",
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&s=review-rank&page={page}",
    "https://www.amazon.{marketplace}/s?i=merchant-items&me={seller_id}&s=relevancerank&page={page}",
]

def get_random_user_agent() -> str:
    """Get a random user agent to avoid blocking."""
    return random.choice(USER_AGENTS)

def get_headers() -> Dict[str, str]:
    """Generate headers with random user agent."""
    return {
        'User-Agent': get_random_user_agent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }

def get_cache_path(seller_id: str, marketplace: str) -> str:
    """Get the cache file path for a seller."""
    return os.path.join(CACHE_DIR, f"{seller_id}_{marketplace}.json")

def get_from_cache(seller_id: str, marketplace: str, max_age_hours: int = 12) -> Optional[Dict[str, Any]]:
    """Get data from cache if not too old."""
    cache_path = get_cache_path(seller_id, marketplace)
    
    if not os.path.exists(cache_path):
        return None
        
    try:
        with open(cache_path, 'r') as f:
            cache_data = json.load(f)
            
        # Check if cache is too old
        cache_time = datetime.fromisoformat(cache_data.get('timestamp', '2000-01-01T00:00:00'))
        max_age = timedelta(hours=max_age_hours)
        
        if datetime.now() - cache_time > max_age:
            logger.info(f"Cache for {seller_id} is older than {max_age_hours} hours")
            return None
            
        return cache_data
    except Exception as e:
        logger.error(f"Error reading cache: {e}")
        return None

def save_to_cache(seller_id: str, marketplace: str, data: Dict[str, Any]) -> None:
    """Save data to cache with timestamp."""
    try:
        # Add timestamp
        data['timestamp'] = datetime.now().isoformat()
        
        cache_path = get_cache_path(seller_id, marketplace)
        with open(cache_path, 'w') as f:
            json.dump(data, f)
            
        logger.info(f"Saved {len(data.get('products', []))} products to cache for {seller_id}")
    except Exception as e:
        logger.error(f"Error saving to cache: {e}")

def make_request(url: str, max_retries: int = 5, retry_delay: int = 4) -> Optional[requests.Response]:
    """Make a request with retry logic and backoff."""
    headers = get_headers()
    
    for attempt in range(max_retries):
        session = None
        try:
            # Use a new session each time
            session = requests.Session()
            response = session.get(url, headers=headers, timeout=15)
            
            if response.status_code == 200:
                return response
            
            if response.status_code == 503:
                # Service unavailable - need longer backoff
                backoff_time = (retry_delay * (attempt + 1)) + random.uniform(1, 3)
                logger.warning(f"Service unavailable (503), backing off for {backoff_time:.1f}s, attempt {attempt+1}/{max_retries}")
                time.sleep(backoff_time)
            else:
                logger.warning(f"Request failed with status {response.status_code}, attempt {attempt+1}/{max_retries}")
                # Add delay between retries with jitter
                time.sleep(retry_delay + random.random() * retry_delay)
        except Exception as e:
            logger.warning(f"Request error: {e}, attempt {attempt+1}/{max_retries}")
            time.sleep(retry_delay + random.random() * 2)
        finally:
            # Close the session
            if session is not None:
                session.close()
    
    return None

def get_seller_name(seller_id: str, marketplace: str = "co.uk") -> Optional[str]:
    """Get the seller's name from their storefront."""
    url = f"https://www.amazon.{marketplace}/sp?seller={seller_id}"
    
    try:
        response = make_request(url)
        if not response:
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Try different selectors for seller name
        selectors = [
            "#sellerName",
            "h1.a-size-large",
            "span.a-size-extra-large",
            "h1.a-spacing-none"
        ]
        
        for selector in selectors:
            element = soup.select_one(selector)
            if element and element.text.strip():
                return element.text.strip()
                
        return None
    except Exception as e:
        logger.error(f"Error getting seller name: {e}")
        return None

def extract_products_from_search_page(html: str, seller_id: str) -> List[Dict[str, Any]]:
    """Extract products from an Amazon search results page."""
    products = []
    
    try:
        soup = BeautifulSoup(html, 'html.parser')
        
        # Different product grid selectors to try
        grid_selectors = [
            "div.s-result-list div.s-result-item",
            "div.sg-col-4-of-12",
            "div[data-component-type='s-search-result']",
            "div.rush-component.s-latency-cf-section",
            ".s-main-slot > div"
        ]
        
        # Find product elements
        product_elements = []
        for selector in grid_selectors:
            elements = soup.select(selector)
            if elements:
                product_elements = elements
                break
                
        # Process each product
        for product in product_elements:
            try:
                # Skip sponsored products
                sponsored = product.select_one("span.s-label-popover-default")
                if sponsored and "Sponsored" in sponsored.text:
                    continue
                    
                # Extract ASIN
                asin = None
                data_asin = product.get('data-asin')
                if data_asin:
                    asin = data_asin
                else:
                    component_props = product.get('data-component-props')
                    if component_props and isinstance(component_props, str) and 'asin' in component_props:
                        try:
                            data_props = json.loads(component_props)
                            asin = data_props.get('asin')
                        except:
                            pass
                    
                if not asin:
                    continue
                    
                # Extract title
                title_elem = product.select_one(".a-size-medium.a-color-base.a-text-normal, .a-size-base-plus.a-color-base.a-text-normal, h2 a.a-link-normal, h5 a")
                title = title_elem.text.strip() if title_elem else "Unknown Title"
                
                # Extract price
                price_elem = product.select_one(".a-price .a-offscreen, span.a-price span.a-offscreen")
                price = price_elem.text.strip() if price_elem else None
                
                # Build product object
                product_obj = {
                    "asin": asin,
                    "title": title,
                    "price": price,
                    "link": f"https://www.amazon.co.uk/dp/{asin}",
                    "seller_id": seller_id,
                    "marketplace": "UK",
                    "source": "enhanced_amazon"
                }
                
                products.append(product_obj)
            except Exception as e:
                logger.debug(f"Error processing product: {e}")
                
        logger.info(f"Extracted {len(products)} products from page")
        return products
    except Exception as e:
        logger.error(f"Error parsing products: {e}")
        return []

def scan_seller_inventory(seller_id: str, marketplace: str = "co.uk", force_refresh: bool = False) -> Tuple[List[Dict[str, Any]], str]:
    """Scan a seller's complete inventory using multiple approaches."""
    logger.info(f"Scanning inventory for seller {seller_id} on {marketplace}")
    
    # Check cache first unless force refresh
    if not force_refresh:
        cache_data = get_from_cache(seller_id, marketplace)
        if cache_data and 'products' in cache_data:
            products = cache_data['products']
            seller_name = cache_data.get('seller_name', 'Unknown')
            logger.info(f"Using cached data with {len(products)} products")
            return products, seller_name
    
    all_products = {}  # Use dict to deduplicate by ASIN
    seller_name = get_seller_name(seller_id, marketplace) or "Unknown Seller"
    
    # Try each URL pattern
    for pattern_idx, url_pattern in enumerate(SELLER_URL_PATTERNS):
        pattern_products_count = 0
        
        logger.info(f"Trying URL pattern {pattern_idx+1}/{len(SELLER_URL_PATTERNS)}")
        
        # Search multiple pages for each pattern (up to 7 pages)
        for page in range(1, 8):
            url = url_pattern.format(marketplace=marketplace, seller_id=seller_id, page=page)
            logger.info(f"Trying URL: {url}")
            
            response = make_request(url)
            
            if not response:
                logger.info(f"No response for URL pattern {pattern_idx+1}, page {page}")
                break
                
            # Extract products from page
            page_products = extract_products_from_search_page(response.text, seller_id)
            
            if not page_products:
                logger.info(f"No products found in page {page} for pattern {pattern_idx+1}")
                break
                
            # Add new products
            for product in page_products:
                if product['asin'] not in all_products:
                    all_products[product['asin']] = product
                    
            pattern_products_count += len(page_products)
            
            # Add sufficient delay between pages to avoid rate limiting
            delay = 3 + random.uniform(2, 5)
            logger.info(f"Waiting {delay:.1f}s before next request...")
            time.sleep(delay)
            
        logger.info(f"Found {pattern_products_count} products for pattern {pattern_idx+1}")
        
        # If we found a good number of products with this pattern, focus on it
        if pattern_products_count >= 100:
            logger.info(f"Pattern {pattern_idx+1} returned many products, scanning more pages")
            
            # Continue with more pages (8-15) for this pattern
            for page in range(8, 16):
                url = url_pattern.format(marketplace=marketplace, seller_id=seller_id, page=page)
                logger.info(f"Trying extra page {page}: {url}")
                
                response = make_request(url)
                
                if not response:
                    break
                    
                page_products = extract_products_from_search_page(response.text, seller_id)
                
                if not page_products:
                    break
                    
                # Add new products
                for product in page_products:
                    if product['asin'] not in all_products:
                        all_products[product['asin']] = product
                        
                # Add short delay between pages
                time.sleep(1 + random.random())
    
    # Convert to list
    product_list = list(all_products.values())
    
    # Cache results
    cache_data = {
        'seller_id': seller_id,
        'seller_name': seller_name,
        'products': product_list,
        'marketplace': marketplace
    }
    save_to_cache(seller_id, marketplace, cache_data)
    
    logger.info(f"Found {len(product_list)} unique products for seller {seller_id}")
    return product_list, seller_name

def get_seller_products(seller_id: str, marketplace: str = "co.uk", force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Get products from an Amazon seller. This function can be called from Node.js."""
    logger.info(f"Getting products for seller {seller_id}")
    logger.info(f"Force refresh: {force_refresh}")
    
    try:
        products, seller_name = scan_seller_inventory(seller_id, marketplace, force_refresh)
        logger.info(f"Found {len(products)} products for seller {seller_id}")
        return products
    except Exception as e:
        logger.error(f"Error scanning seller inventory: {e}")
        return []

if __name__ == "__main__":
    # This allows calling from Node.js
    if len(sys.argv) >= 2:
        seller_id = sys.argv[1]
        marketplace = sys.argv[2] if len(sys.argv) >= 3 else "co.uk"
        force_refresh = sys.argv[3].lower() == "true" if len(sys.argv) >= 4 else False
        
        products = get_seller_products(seller_id, marketplace, force_refresh)
        print(json.dumps(products))
    else:
        print("Usage: python enhanced_amazon_scraper.py <seller_id> [marketplace] [force_refresh]")