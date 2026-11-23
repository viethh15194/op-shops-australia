# Op Shop Finder AU

A static Australian op shop directory on Astro. Visitors search the site's state indexes in their browser. Use the included fictional fixture to try the directory without accounts or API keys.

## Run locally

Install Node 24 (version in `.node-version`). From the repository root:

```sh
npm install
npm test
npm run dev
npm run build
npm run preview
```

The build output is `dist/`. Search, opening hours, filtering and geolocation run in the browser. The local preview supports location on localhost if permission is granted.

## Import

Use an authorised Australian Google Maps Scraper export from Apify (JSON array or CSV). Put it under `input/`, which Git ignores. The importer supports nested JSON, quoted CSV values, and common dotted or slash-delimited Apify CSV fields. Check the first real export's report before publishing. CSV postcodes must retain all four digits.

```sh
npm run import -- input/shops.json --dry-run
npm run update -- input/shops.json
```

The update validates the import and builds the candidate before replacing `data/shops.json`. The previous file is retained as `data/shops.json.backup`. The import command alone saves data without building. Both commands upsert by Place ID, preserve an existing slug, and keep old shops missing from a partial export. A confirmed permanent closure removes its matching listing. `--replace-state VIC` replaces only that state's listings and requires an export for the entire state. Review entries are surfaced in the terminal report.

Edit `data/rules.json` for categories, excluded IDs/names, chains, explicit metro areas and timezone overrides. The keys for metro and timezone overrides take the form `VIC/brunswick/3056`. Review locality values and exceptional timezone boundaries against the real export.

## Cloudflare Pages

Create a Pages project connected to this GitHub repository, choose the production branch, select the Astro preset, and use `npm run build`, output `dist`, and the repository root. Set `NODE_VERSION` to the value in `.node-version`. Pages will build after a push. Test its HTTPS preview domain first.

In `site.config.mjs`, set the final HTTPS origin and contact email and then set `demo: false` after importing real data. The demo has a noindex directive and a blank sitemap. Production requires populated data, emits a sitemap and uses canonical URLs. Search and 404 are noindex. AdSense is opt-in and requires a publisher ID and two slot IDs.

After deploy, test `/find/?q=0800`, a location URL, a shop URL, a deliberately missing URL and `/sitemap.xml`. Review file and build limits before importing a national dataset.

- [Cloudflare Pages Astro setup](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- [Apify export reference](https://apify.com/compass/crawler-google-places)
