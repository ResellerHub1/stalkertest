"""
Amazon Seller Storefront Scraper

This module scrapes an Amazon seller's storefront to find all products they sell.
It works as an alternative to the Keepa API when direct seller inventory isn't accessible.
"""

import os
import json
import time
import random
import logging
import re
from typing import List, Dict, Any, Optional
import requests
from bs4 import BeautifulSoup
import trafilatura

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('amazon_scraper')

# Expanded list of User-Agent strings for better rotation
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/111.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 Edg/111.0.1661.54',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36 OPR/97.0.0.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
]

# Cache directory for storing seller data to reduce requests
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Use a free proxy rotation service or None to use direct connection
FREE_PROXY_LIST_URL = "https://free-proxy-list.net/"

# Directly define a set of verified proxies to avoid web scraping for them
# This creates a more stable solution since proxy lists can change or be unavailable
VERIFIED_PROXIES = [
    # Format: {'ip': 'proxy-ip', 'port': 'port', 'country': 'country-code', 'url': 'http://proxy-ip:port'}
    # These would normally be populated from a reliable proxy source
    # Since we don't have real proxies here, we'll leave this empty and fall back to direct connections
]

def get_free_proxies() -> List[Dict[str, str]]:
    """Get a list of free proxies."""
    if VERIFIED_PROXIES:
        logger.info(f"Using {len(VERIFIED_PROXIES)} verified proxies")
        return VERIFIED_PROXIES
        
    # If no verified proxies, return empty list
    # Note: Scraping proxy lists is unreliable and often against ToS of websites
    # It's better to use a proper proxy service with an API or direct access
    logger.info("No verified proxies available, using direct connections")
    return []

class AmazonSellerScraper:
    """Scraper for Amazon seller storefronts."""
    
    def __init__(self, marketplace="co.uk"):
        """Initialize the scraper with specific marketplace."""
        self.marketplace = marketplace
        self.base_url = f"https://www.amazon.{marketplace}"
        self.session = requests.Session()
        self.proxies = []
        self.current_proxy_index = 0
        self.max_retries = 3
        self.retry_delay = 2  # seconds
        self.request_delay = (2, 5)  # min and max seconds
        
        # Cookies to make requests more like a regular browser
        self.session.cookies.set('session-id', f'{random.randint(1000000, 9999999)}')
        self.session.cookies.set('session-id-time', f'{int(time.time())}')
        self.session.cookies.set('i18n-prefs', 'GBP')
        self.session.cookies.set('lc-gb', 'en_GB')
        
        # Try to get proxies for rotation
        self.refresh_proxies()
    
    def refresh_proxies(self):
        """Get a fresh list of proxies."""
        self.proxies = get_free_proxies()
        self.current_proxy_index = 0
        
    def get_next_proxy(self) -> Optional[Dict[str, str]]:
        """Get the next proxy in the rotation."""
        if not self.proxies:
            return None
            
        proxy = self.proxies[self.current_proxy_index]
        self.current_proxy_index = (self.current_proxy_index + 1) % len(self.proxies)
        return proxy
        
    def _get_headers(self) -> Dict[str, str]:
        """Generate headers with random user agent to avoid blocking."""
        # Generate a plausible browser fingerprint
        user_agent = random.choice(USER_AGENTS)
        
        headers = {
            'User-Agent': user_agent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'DNT': '1',
            'Referer': f"https://www.amazon.{self.marketplace}/"
        }
        
        # Add Chrome-specific headers if using a Chrome UA
        if 'Chrome' in user_agent and 'Safari' in user_agent:
            headers['sec-ch-ua'] = '"Google Chrome";v="111", "Not(A:Brand";v="8", "Chromium";v="111"'
            headers['sec-ch-ua-mobile'] = '?0'
            headers['sec-ch-ua-platform'] = '"Windows"' if 'Windows' in user_agent else '"macOS"'
            
        return headers
    
    def _get_cache_path(self, seller_id: str) -> str:
        """Get cache file path for a seller."""
        return os.path.join(CACHE_DIR, f"{seller_id}_{self.marketplace}.json")
    
    def _get_from_cache(self, seller_id: str) -> Optional[Dict[str, Any]]:
        """Try to get seller data from cache if not too old."""
        cache_path = self._get_cache_path(seller_id)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    cache_data = json.load(f)
                
                # Check if cache is less than 24 hours old
                cache_time = cache_data.get('timestamp', 0)
                if time.time() - cache_time < 86400:  # 24 hours
                    logger.info(f"Using cached data for seller {seller_id}")
                    return cache_data
            except Exception as e:
                logger.warning(f"Error reading cache: {e}")
        
        return None
    
    def _save_to_cache(self, seller_id: str, data: Dict[str, Any]) -> None:
        """Save seller data to cache."""
        cache_path = self._get_cache_path(seller_id)
        try:
            # Add timestamp for cache expiration
            data['timestamp'] = time.time()
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            logger.info(f"Saved data to cache for seller {seller_id}")
        except Exception as e:
            logger.warning(f"Error saving to cache: {e}")
    
    def _make_request(self, url: str, use_proxy: bool = True) -> Optional[requests.Response]:
        """Make a request with retry and proxy rotation."""
        for attempt in range(self.max_retries):
            try:
                # Get proxy if needed and available
                proxy_dict = None
                if use_proxy:
                    proxy = self.get_next_proxy()
                    if proxy:
                        proxy_dict = {'http': proxy['url'], 'https': proxy['url']}
                        logger.info(f"Using proxy: {proxy['ip']}:{proxy['port']} ({proxy['country']})")
                
                # Add some randomness to mimic human behavior
                time.sleep(random.uniform(self.request_delay[0], self.request_delay[1]))
                
                # Make the request with fresh headers each time
                headers = self._get_headers()
                
                response = self.session.get(
                    url, 
                    headers=headers, 
                    proxies=proxy_dict,
                    timeout=20,
                    allow_redirects=True
                )
                
                if response.status_code == 200:
                    return response
                elif response.status_code == 503:
                    # Amazon's anti-bot detection was triggered
                    logger.warning(f"Got 503 Service Unavailable (anti-bot). Attempt {attempt+1}/{self.max_retries}")
                    if use_proxy and self.proxies:
                        # Try a different proxy on next attempt
                        continue
                    time.sleep(self.retry_delay * (attempt + 1))  # Exponential backoff
                elif response.status_code == 403:
                    logger.warning(f"Access denied (403). Attempt {attempt+1}/{self.max_retries}")
                    # Sleep longer for 403 errors
                    time.sleep(self.retry_delay * 2 * (attempt + 1))
                else:
                    logger.warning(f"Request failed with status code {response.status_code}. Attempt {attempt+1}/{self.max_retries}")
                    time.sleep(self.retry_delay)
            except requests.RequestException as e:
                logger.error(f"Request error on attempt {attempt+1}: {e}")
                time.sleep(self.retry_delay)
        
        return None

    def get_seller_name(self, seller_id: str) -> Optional[str]:
        """Get seller's display name from their storefront."""
        try:
            url = f"{self.base_url}/sp?seller={seller_id}"
            logger.info(f"Getting seller name from {url}")
            
            # Try using trafilatura first for better clean text extraction
            try:
                downloaded = trafilatura.fetch_url(url)
                if downloaded:
                    # Try to extract the seller name from the page title
                    # Handle downloaded content based on its type
                    content = downloaded
                    if isinstance(downloaded, bytes):
                        content = downloaded.decode('utf-8', errors='ignore')
                        
                    match = re.search(r"<title>(.*?)[:|–]", content)
                    if match:
                        return match.group(1).strip()
            except Exception as te:
                logger.warning(f"Trafilatura extraction failed: {te}")
            
            # Fall back to requests + BeautifulSoup if trafilatura fails
            response = self._make_request(url)
            if not response:
                return None
            
            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Try multiple selectors that might contain the seller name
            selectors = [
                'h1#sellerName', 
                'span.a-size-extra-large.a-text-bold',
                'h1.a-size-large',
                'h1 span'
            ]
            
            for selector in selectors:
                name_element = soup.select_one(selector)
                if name_element and name_element.text.strip():
                    return name_element.text.strip()
            
            # Alternative: look for the seller name in the page title
            title_element = soup.find('title')
            if title_element:
                title_text = title_element.text
                # Amazon titles often have formats like "Seller Name: Amazon.co.uk Marketplace"
                for separator in [':', '|', '-', '–']:
                    if separator in title_text:
                        return title_text.split(separator)[0].strip()
            
            # One more attempt: try to find "Amazon.co.uk: Seller Name" pattern
            if title_element and 'Amazon' in title_element.text:
                parts = title_element.text.split(':', 1)
                if len(parts) > 1:
                    return parts[1].strip()
            
            return None
        except Exception as e:
            logger.error(f"Error getting seller name: {e}")
            return None
    
    def get_seller_products(self, seller_id: str, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        Get all products from a seller's storefront.
        
        Args:
            seller_id: The Amazon seller ID
            force_refresh: Whether to bypass cache and force a fresh scrape
            
        Returns:
            List of products with ASIN, title, price, and other details
        """
        logger.info(f"Getting products for seller {seller_id}")
        logger.info(f"Force refresh: {'Yes' if force_refresh else 'No'}")
        
        # Try to get from cache first unless forced refresh
        if not force_refresh:
            cache_data = self._get_from_cache(seller_id)
            if cache_data:
                logger.info(f"Using cached data with {len(cache_data.get('products', []))} products")
                return cache_data.get('products', [])
        else:
            logger.info(f"Bypassing cache due to force_refresh=True")
        
        # Try multiple URL formats for Amazon seller pages
        # Enhanced list of URL patterns to try - more comprehensive for big sellers
        urls_to_try = [
            # Standard patterns
            f"{self.base_url}/s?i=merchant-items&me={seller_id}",
            f"{self.base_url}/s?me={seller_id}&marketplaceID=A1F83G8C2ARO7P",  # UK marketplace ID
            f"{self.base_url}/s?k=*&me={seller_id}",  # Wildcard search for all items
            f"{self.base_url}/s?rh=n%3A%2Cp_6%3A{seller_id}",  # Alternative search format
            
            # Additional patterns that can work for some sellers
            f"{self.base_url}/s?merchant={seller_id}",
            f"{self.base_url}/s?rh=p_4%3A{seller_id}",
            f"{self.base_url}/shops/{seller_id}",  # Sometimes works for large sellers
            f"{self.base_url}/sp?seller={seller_id}",
            f"{self.base_url}/s?i=merchant-items&me={seller_id}&qid={int(time.time())}",  # Add timestamp to avoid caching
            
            # Category-specific searches for big sellers to get past pagination limits
            f"{self.base_url}/s?i=merchant-items&me={seller_id}&rh=n%3A117332031", # Beauty category
            f"{self.base_url}/s?i=merchant-items&me={seller_id}&rh=n%3A560798", # Books
            f"{self.base_url}/s?i=merchant-items&me={seller_id}&rh=n%3A1025612", # Clothing
            f"{self.base_url}/s?i=merchant-items&me={seller_id}&rh=n%3A560800", # Electronics
            f"{self.base_url}/s?i=merchant-items&me={seller_id}&rh=n%3A11052681", # Home & Kitchen
        ]
        
        products = []
        seller_name = self.get_seller_name(seller_id) or "Unknown Seller"
        
        # Try each URL format and collect all unique products
        total_pages_crawled = 0
        logger.info(f"Attempting to get ALL products from seller {seller_id}")
        
        for base_url in urls_to_try:
                
            page = 1
            more_pages = True
            page_products = []
            
            while more_pages and page <= 100:  # Check up to 100 pages to ensure we get full inventory
                try:
                    # Add pagination parameter if not the first page
                    url = f"{base_url}&page={page}" if page > 1 else base_url
                    logger.info(f"Trying URL: {url} (page {page})")
                    
                    # Use our robust request method
                    response = self._make_request(url)
                    if not response:
                        logger.warning(f"Failed to get response for {url}")
                        break
                    
                    # First check if we got a valid seller page
                    if "Sorry! We couldn't find that page" in response.text or "We're sorry" in response.text:
                        logger.warning(f"Invalid seller page format: {url}")
                        break
                    
                    soup = BeautifulSoup(response.content, 'html.parser')
                    
                    # Use even more comprehensive selectors to find products
                    product_selectors = [
                        'div[data-asin]:not([data-asin=""])', 
                        '.s-result-item[data-asin]:not([data-asin=""])',
                        '.sg-col-inner div[data-asin]',
                        'div.a-section[data-asin]',
                        'li.a-carousel-card[data-asin]',
                        'div[data-component-type="s-search-result"]',
                        'div.rush-component[data-asin]',
                        '.s-main-slot div[data-asin]',
                        '.widgetId\\=search-results div[data-asin]',
                        'div[cel_widget_id*="MAIN-SEARCH_RESULTS"]',
                        'div.s-card-container'
                    ]
                    
                    found_products = False
                    for selector in product_selectors:
                        product_elements = soup.select(selector)
                        if product_elements:
                            found_products = True
                            logger.info(f"Found {len(product_elements)} products with selector {selector}")
                            total_pages_crawled += 1
                            
                            # Process each product
                            for element in product_elements:
                                asin = element.get('data-asin', '')
                                if not asin or len(asin) != 10:  # Valid ASINs are 10 characters
                                    continue
                                
                                # Try multiple selectors for product details
                                title_selectors = ['.a-text-normal', 'h2 a span', '.a-size-base-plus', '.a-size-medium']
                                price_selectors = ['.a-price .a-offscreen', '.a-price', '.a-color-price']
                                
                                # Get title
                                title = None
                                for title_selector in title_selectors:
                                    title_element = element.select_one(title_selector)
                                    if title_element and title_element.text.strip():
                                        title = title_element.text.strip()
                                        break
                                
                                if not title:
                                    continue  # Skip products without title
                                
                                # Get price
                                price_text = None
                                for price_selector in price_selectors:
                                    price_element = element.select_one(price_selector)
                                    if price_element and price_element.text.strip():
                                        price_text = price_element.text.strip()
                                        break
                                
                                # Create the product entry
                                product = {
                                    'asin': asin,
                                    'title': title,
                                    'link': f"{self.base_url}/dp/{asin}",
                                    'marketplace': f"Amazon {self.marketplace.upper()}",
                                    'seller_id': seller_id,
                                    'seller_name': seller_name
                                }
                                
                                # Add price if available
                                if price_text:
                                    product['price_text'] = price_text
                                
                                # Check if we already have this product
                                if not any(p['asin'] == asin for p in page_products):
                                    page_products.append(product)
                            
                            break  # Break the selector loop if we found products
                    
                    if not found_products:
                        logger.warning(f"No product elements found on page {page}")
                        break
                    
                    # Check if there's a "Next" button for pagination
                    next_button = soup.select_one('.a-pagination .a-last a')
                    disabled = False
                    
                    # Safely check if the next button's parent has a disabled class
                    if next_button and hasattr(next_button, 'parent') and next_button.parent:
                        parent = next_button.parent
                        if hasattr(parent, 'get') and callable(parent.get):
                            parent_classes = parent.get('class', [])
                            if parent_classes and isinstance(parent_classes, list):
                                disabled = 'a-disabled' in parent_classes
                    
                    if not next_button or disabled:
                        more_pages = False
                    else:
                        # Add a random delay between page requests
                        time.sleep(random.uniform(3.0, 7.0))
                        page += 1
                    
                except Exception as e:
                    logger.error(f"Error scraping page {page}: {e}")
                    more_pages = False
            
            # Add unique products from this URL format
            for product in page_products:
                if not any(p['asin'] == product['asin'] for p in products):
                    products.append(product)
            
            if page_products:
                logger.info(f"Found {len(page_products)} products for seller {seller_id} using format {base_url}")
                logger.info(f"Running product count: {len(products)} unique products so far")
        
        # If we found products, save to cache
        if products:
            data = {
                'seller_id': seller_id,
                'seller_name': seller_name,
                'products': products,
                'product_count': len(products),
                'last_updated': time.time(),
                'pages_crawled': total_pages_crawled
            }
            logger.info(f"COMPLETED: Found {len(products)} total unique products for seller {seller_id} across {total_pages_crawled} pages")
            logger.info(f"Saving {len(products)} products to cache for seller {seller_id}")
            self._save_to_cache(seller_id, data)
            
            # Log some sample products
            if len(products) > 0:
                logger.info(f"Sample product - ASIN: {products[0]['asin']}, Title: {products[0]['title'][:50]}...")
                
        else:
            logger.warning(f"No products found for seller {seller_id} after trying multiple approaches")
        
        return products

# Helper function to use from JavaScript
def get_seller_products(seller_id: str, marketplace: str = "co.uk", force_refresh: bool = False) -> List[Dict[str, Any]]:
    """Get products from an Amazon seller. This function can be called from Node.js."""
    try:
        scraper = AmazonSellerScraper(marketplace=marketplace)
        products = scraper.get_seller_products(seller_id, force_refresh)
        return products
    except Exception as e:
        logger.error(f"Error in get_seller_products: {e}")
        return []

# Helper function to get seller name only
def get_seller_name(seller_id: str, marketplace: str = "co.uk") -> Optional[str]:
    """Get just the seller's name. This function can be called from Node.js."""
    try:
        scraper = AmazonSellerScraper(marketplace=marketplace) 
        return scraper.get_seller_name(seller_id)
    except Exception as e:
        logger.error(f"Error in get_seller_name: {e}")
        return None

# Test function
def test_scraper(seller_id: str) -> None:
    """Test the scraper with a specific seller ID."""
    scraper = AmazonSellerScraper()
    seller_name = scraper.get_seller_name(seller_id)
    print(f"Seller Name: {seller_name}")
    
    products = scraper.get_seller_products(seller_id)
    print(f"Found {len(products)} products")
    
    for i, product in enumerate(products[:5], 1):  # Show first 5 products
        print(f"\n{i}. {product['title']}")
        print(f"   ASIN: {product['asin']}")
        if 'price_text' in product:
            print(f"   Price: {product['price_text']}")
        print(f"   Link: {product['link']}")

if __name__ == "__main__":
    # Example usage
    test_seller = "A25WS8YVXEJW8B"  # Example seller ID
    test_scraper(test_seller)