import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import json
import os

# List of specific URLs to crawl (no recursion)
CRAWL_URLS = [
    "https://stenoip.github.io/",
    "https://stenoip.github.io/praterich/",
    "https://stenoip.github.io/about.html",
    "https://en.m.wikipedia.org/wiki/Canada"
]

# List of base URLs to crawl the entire site from (recursive)
CRAWL_ENTIRE_SITE = [
    "https://stenoip.github.io/"
]

def crawl_sites(urls):
    """
    Crawls a list of specific URLs without following links.
    """
    combined_content = ""
    for url in urls:
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            all_text = soup.body.get_text(separator=' ', strip=True) if soup.body else ""
            image_descriptions = [f"Image description: {img.get('alt')}" for img in soup.find_all('img') if img.get('alt')]
            combined_content += f"--- Content from {url} ---\n{all_text}\n" + "\n".join(image_descriptions) + "\n"
        except Exception as e:
            print(f"Error crawling {url}: {e}")
    return combined_content

def crawl_entire_site(start_urls):
    """
    Recursively crawls a website starting from the given URLs, following internal links.
    """
    combined_content = ""
    crawled_urls = set()
    to_crawl = list(start_urls)
    
    if not to_crawl:
        return combined_content

    # Use the domain of the first URL to check for internal links
    base_url_domain = urlparse(to_crawl[0]).netloc

    while to_crawl:
        url = to_crawl.pop(0)
        
        if url in crawled_urls:
            continue
        
        print(f"Oodlebot is crawling: {url}")

        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            crawled_urls.add(url)
            
            # Extract text and image descriptions
            all_text = soup.body.get_text(separator=' ', strip=True) if soup.body else ""
            image_descriptions = [f"Image description: {img.get('alt')}" for img in soup.find_all('img') if img.get('alt')]
            combined_content += f"--- Content from {url} ---\n{all_text}\n" + "\n".join(image_descriptions) + "\n"

            # Find and add new internal links to the queue
            for a_tag in soup.find_all('a', href=True):
                href = a_tag.get('href')
                full_url = urljoin(url, href)
                parsed_url = urlparse(full_url)
                
                if parsed_url.netloc == base_url_domain and full_url not in crawled_urls:
                    to_crawl.append(full_url)
        except Exception as e:
            print(f"Error crawling {url}: {e}")
            
    return combined_content

def main():
    print("Oodles is a copyright of Stenoip Company.")

    # Crawl specific URLs first
    crawled_data = crawl_sites(CRAWL_URLS)
    
    # Then, crawl entire sites and append the data
    if CRAWL_ENTIRE_SITE:
        crawled_data += crawl_entire_site(CRAWL_ENTIRE_SITE)

    output_data = {
        "website_info": crawled_data
    }
    with open('index.json', 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)
    print("index.json has been created/updated!")

if __name__ == "__main__":
    main()

"""
===========================
How to use this crawler(Powered By Oodles Search(by Stenoip Co)
===========================

1. Make sure you have Python 3, requests, and beautifulsoup4 installed.
   Install dependencies if needed:
       pip install requests beautifulsoup4

2. Run the crawler from your computer terminal:
       python oodles.py

3. This will create or update a file named 'index.json' in the same folder.

4. Move or copy 'index.json' into your project's 'api/' directory.

5. Upload and commit the new file to GitHub

Now your Praterich AI will be able to see info!
"""
