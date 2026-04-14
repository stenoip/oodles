

# Oodles Metasearch Engine

![Oodles Logo](https://stenoip.github.io/oodles/logo.png)

...


Oodles is a full‑scale, general‑purpose metasearch engine that combines results from Bing, Yahoo and Brave into a single, unified search experience.
It works like Google or Bing: type a query, get web results but with AI‑enhanced ranking,  and zero tracking.

Alongside its everyday search interface, Oodles also includes optional developer tools for deep crawling and custom index generation.


---


### Who Oodles Is For
Oodles Metasearch is for everyday users who want a Google‑like search engine without tracking and want multi‑source results without bias! It’s ideal for everyday users who simply want to type a question and get clean, fas, multi‑source results but it also appeals to people who care about **privacy** and **independence** in how they search. Because Oodles pulls results from Bing, Yahoo and Brave at the same time, it gives users a broader, more balanced view of the web instead of relying on one company’s algorithm. 

## What Oodles Metasearch Does


* **Multi-Source Fetching:** Fetches results from Bing, Yahoo, and Brave simultaneously.
* **AI Synthesis (Praterich):** Generates  search overviews and summarizes technical results.
* **Smart Ranking:** AI-driven re-ranking that promotes the top 5 most relevant links above standard algorithmic results.
* **SERP Detection:** Knowledge Panel, To-Go tools (like translator and calculator) for quick answers.
* **Deep Image Crawler:** Up to 400 images!






---

## NEW! The Adaptive search engine


Traditional search engines are powerful, but they’re rigid. They return fixed lists of links even when the user is clearly asking for an explanation, not a webpage. 

Chatbots do the opposite: they generate answers, but they don’t give you real search results or multiple sources to verify anything. 

As of 2026, we introduced Adaptive Search, which merges both worlds. When your query looks like a normal search, Oodles shows you our classic results from Bing, Yahoo and Brave. When your query is conversational or open‑ended, it shifts into chat mode and responds like an **AI assistant**. This hybrid approach removes the limitations of both systems, giving you real search when you need it and real conversation when you want it **all in one place**.


---

## How Oodles Works (developer info)

### Search Flow
* User submits a query via `index.html`.
* `api/index.js` fetches results from multiple engines in parallel using `Promise.all`.
* `frontend_javascript/search-logic.js` sends snippets to the Praterich AI for synthesis.
* The AI detects if a tool (such as a calculator) is needed and provides a Smart Ranking to reorder results.

### Indexing Flow
* User provides a URL to the generator tool.
* `api/metasearch.js` performs a deep crawl(our ants), visiting each page and extracting full content.
* The backend bundles this into a downloadable `index.json` compatible with `api/search.js`.



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
