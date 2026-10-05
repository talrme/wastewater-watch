# AI Notes - Wastewater Watch

This is a static GitHub Pages site. Signal Board is the production direction.

## Structure

- `index.html` is the production Signal Board site.
- `styles.css` is the production visual treatment.
- `shared/app.js` contains the data loading, settings, controls, chart, cards, table, and manual browser refresh logic.
- `shared/base.css` contains shared layout and components.
- `data/wastewater.json` is generated real data and should not be hand-edited.
- `scripts/refresh_data.py` fetches real CDC data using only Python standard library.
- `.github/workflows/refresh-data.yml` runs the refresh daily and on manual dispatch.

## Data Rules

Do not use dummy data unless explicitly asked, and if you do, label it prominently in the UI and docs.

The current data source is CDC NWSS WVAL dataset `atcp-73re`. The production app tries to fetch live California rows directly in the browser, then normalizes and aggregates them client-side. It stores that live payload in local storage and reuses it for the configured browser-cache window, defaulting to 3 days. The checked-in `data/wastewater.json` is a fallback and should still be refreshed by script/GitHub Actions.

The UI currently filters California rows into these area groups:

- East Bay: Alameda + Contra Costa
- Alameda County
- Contra Costa County
- Bay Area: Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma
- SF + Peninsula: San Francisco + San Mateo
- South Bay: Santa Clara
- California: all California rows

Area lines are population-weighted averages of selected matching sites. Keep the source notes clear that wastewater is a trend signal, not an exact case count.

## Production

Root `index.html` uses `shared/app.js` with `data-data-path="data/wastewater.json"`. There are no staging folders in the production repo. Verify the root page loads from a local static server before pushing meaningful UI changes.
