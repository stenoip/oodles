# oodles.py
"""
Copyright Stenoip Company. All rights reserved.

Multithreaded website crawler with progress bar.
Collects visible text from multiple pages of each site
and organizes it by page in `api/index.json`.


NOTE: YOU MUST RUN THIS IN TERMINAL. THIS IS NOT FOR THE WEB!


"""

import requests
from bs4 import BeautifulSoup
import json
import os
from urllib.parse import urljoin, urlparse
from tqdm import tqdm
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- Configuration ---
WEBSITES = [
    "https://stenoip.github.io",
    "https://stenoip.github.io/oodles",
    "https://stenoip.github.io/television_guide.html",
    "https://stenoip.github.io/games/home",
    "https://stenoip.github.io/office/home",
    "https://stenoip.github.io/blog",
    "https://stenoip.github.io/ringzauber"

]

OUTPUT_FILE = os.path.join("api", "index.json")
MAX_DEPTH = 2
MAX_PAGES_PER_SITE = 20
REQUEST_DELAY = 0.2
MAX_THREADS = 5

# --- Helper Functions ---

def get_visible_text(url):
    """Fetch page and extract visible text."""
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        for script in soup(["script", "style"]):
            script.decompose()
        lines = [line.strip() for line in soup.get_text(separator="\n").splitlines() if line.strip()]
        return " ".join(lines), soup
    except requests.RequestException:
        return f"[Error: Could not retrieve content from {url}]", None

def crawl_site(site):
    """Crawl a single site, returning a dictionary of {url: text}."""
    visited = set()
    pages_to_crawl = [(site, 0)]
    site_pages = {}
    pages_count = 0

    with ThreadPoolExecutor(max_workers=MAX_THREADS) as executor:
        futures = {}
        pbar = tqdm(total=MAX_PAGES_PER_SITE, desc=f"Crawling {site}", ncols=100)

        while pages_to_crawl or futures:
            # Submit new pages
            while pages_to_crawl and len(futures) < MAX_THREADS and pages_count + len(futures) < MAX_PAGES_PER_SITE:
                url, depth = pages_to_crawl.pop(0)
                if url not in visited and depth <= MAX_DEPTH:
                    visited.add(url)
                    futures[executor.submit(get_visible_text, url)] = (url, depth)

            # Process completed futures
            done, _ = as_completed(futures), None
            for future in done:
                url, depth = futures.pop(future)
                text, soup = future.result()
                site_pages[url] = text
                pages_count += 1
                pbar.update(1)
                time.sleep(REQUEST_DELAY)

                if soup and depth < MAX_DEPTH:
                    for a_tag in soup.find_all("a", href=True):
                        link = urljoin(url, a_tag['href'])
                        if urlparse(link).netloc == urlparse(site).netloc and link not in visited:
                            pages_to_crawl.append((link, depth + 1))

                if pages_count >= MAX_PAGES_PER_SITE:
                    break
            if pages_count >= MAX_PAGES_PER_SITE:
                break

        pbar.close()
    return site_pages

def main():
    website_info = {}
    for site in WEBSITES:
        website_info[site] = crawl_site(site)

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump({"website_info": website_info}, f, ensure_ascii=False, indent=2)

    print(f"\nSaved crawled content to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
