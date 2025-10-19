# Oodles Search Engine

Oodles is a self-serve search engine platform. It lets anyone generate their own `index.json` datasets by crawling websites, then search through them with ranking, synonyms, pagination and analytics. Think of it as a buffet of web information you can curate yourself.

---

## Features

### Frontend (GitHub Pages)

* Classic 90s-inspired UI
* Generate an index from one or more URLs
* Upload your own `index.json`
* Search with ranking (title, headings, description, body)
* Pagination controls
* Ad-hoc single-URL search
* Auto-prefixes `stenoip.github.io/` → `https://stenoip.github.io/`
* Click tracking (analytics)

### Backend (Vercel)

* `/generate` — crawl sites and build index.json
* `/search` — ranked search with synonyms & stemming
* `/analytics` — log clicks for future ranking improvements
* `/health` — simple health check
* Multi-page crawling with depth/breadth limits
* CORS enabled for GitHub Pages frontend

---

## Project Structure

```

oodles/
├── frontend/ (GitHub Pages)
│   ├── index.html
│   ├── 404.html
│   └── assets/...
└── backend/ (Vercel)
├── api/
│   ├── generate.js
│   ├── search.js
│   ├── analytics.js
│   ├── health.js
│   └── \_cors.js
├── package.json
└── vercel.json

````

---

## Getting Started
Visit: https://stenoip.github.io/oodles

### Generate an index

* Enter one or more URLs in the frontend.
* Adjust depth, link limit, and domain restriction.
* Download the generated `index.json`.

### Upload an index

* Load any valid `index.json` file.
* Search through it instantly.

### Search

* Enter a query.
* Results are ranked by:
    * Title > Headings > Description > Body
    * Helpfulness (longer content, richer descriptions)
    * Synonyms & stemming (e.g. run → running, ran)
* Paginate through results.

### Analytics

* Every click is logged to `/analytics` for future ranking improvements.

---

## Configuration

* **CORS:** The CORS origin is set to `https://stenoip.github.io`. Update `api/_cors.js` if your frontend lives elsewhere.
* **Ranking:** Ranking weights can be tuned in `api/search.js` (`WEIGHTS` object).
* **Synonyms:** Synonyms are defined in `getSynonyms()` inside `api/search.js`.

---

## Roadmap

* [ ] Smarter NLP (lemmatization, TF-IDF, embeddings)
* [ ] Persistent analytics storage (DB or Vercel KV)
* [ ] Richer UI (filters, categories, tags)
* [ ] Crawl scheduling & background jobs

---

## Contributing

Pull requests are welcome! For major changes, open an issue first to discuss what you’d like to change.

---

## License

MIT License. Please read before using.

---

## Credits

Built with by Stenoip Company.
Frontend: GitHub Pages.
Backend: Vercel.
````
