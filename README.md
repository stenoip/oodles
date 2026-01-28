

# Oodles Metasearch Engine

![Oodles Logo](https://stenoip.github.io/oodles/2025_10_28_0pb_Kleki.png)

Note, this is a technical overview of Oodles. If you do not know programming, it may be hard for you to understand!


---

Oodles is a dual-purpose search platform that functions  as a **Metasearch Engine** (crawling results from Bing, Brave and Yahoo) and secondarily as a **self-serve index generator**. It features an integrated AI system called **Praterich** that synthesizes, ranks and detects tools for a smarter search experience.


---

## Key Features

### 1. Metasearch Aggregator (Primary)
* **Multi-Source Fetching:** Queries Bing, Yahoo, Brave simultaneously via the `/api` endpoint.
* **AI Synthesis (Praterich):** Generates  search overviews and summarizes technical results.
* **Smart Ranking:** AI-driven re-ranking that promotes the top 5 most relevant links above standard algorithmic results.
* **Tool Detection:** Automatically triggers built-in tools (Calculator, Translator, Colour Picker) based on natural language queries.
* **Deep Image Crawler:** Extracts images directly from the source pages. A recent update has increased the range of number of images to 100-400.

### Oodles features Dataset Generation
* **Deep Crawling:** Visits and scrapes a webpage, headings and metadata from target URLs using `metasearch.js`.
* **Index Creation:** Generates and downloads custom `index.json` datasets for offline or private search use.


---

## Project Structure

```text
root/
├── index.html                # Main search entry
├── search.html               # Results display page
├── 404.html                  # Error page
├── frontend_javascript/      # Client-side logic
│   └── search-logic.js       # UI Controller: AI, Tools, and Tab Management
└── api/                      # Vercel Backend
    ├── index.js              # Primary Metasearch & Image Crawler
    ├── metasearch.js         # Deep Content Scraper (for indexing)
    ├── generate.js           # index.json Generator logic
    ├── search.js             # Local index search logic
    ├── analytics.js          # Click tracking
    └── _cors.js              # Security & Headers
```

---

## How Oodles Works

### Search Flow
* User submits a query via `index.html`.
* `api/index.js` fetches results from multiple engines in parallel using `Promise.all`.
* `frontend_javascript/search-logic.js` sends snippets to the Praterich AI for synthesis.
* The AI detects if a tool (such as a calculator) is needed and provides a Smart Ranking to reorder results.

### Indexing Flow
* User provides a URL to the generator tool.
* `api/metasearch.js` performs a deep crawl(our ants), visiting each page and extracting full content.
* The backend bundles this into a downloadable `index.json` compatible with `api/search.js`.

---

## Configuration

* **AI Logic:** Modify `ladyPraterichSystemInstruction` in `search-logic.js` to change how the AI summarizes or ranks results.
* **Built-in Tools:** Add new utility URLs to the `BUILT_IN_TOOLS` object in `search-logic.js`.
* **Backend URL:** Update `BACKEND_BASE` in the frontend logic to point to your Vercel deployment.

---

## Credits

Built by Stenoip Company.  2024-2026. LONG LIVE FRUTIGER AERO!
* **Frontend:** Hosted on GitHub Pages.  
* **Backend:** Powered by Vercel.  
* **AI:** Powered by the Praterich model via Groq AI API.

---
