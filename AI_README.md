# AI Notes - Wastewater Watch

This is a static multi-option site. Keep all staging options functional until Tal chooses one to promote.

## Structure

- `index.html` links to all staging options.
- `staging_1` through `staging_5` are separate visual treatments.
- `shared/app.js` contains the data loading, settings, controls, chart, cards, table, and manual browser refresh logic.
- `shared/base.css` contains shared layout and components.
- `data/wastewater.json` is generated real data and should not be hand-edited.
- `scripts/refresh_data.py` fetches real CDC data using only Python standard library.
- `.github/workflows/refresh-data.yml` runs the refresh daily and on manual dispatch.

## Data Rules

Do not use dummy data unless explicitly asked, and if you do, label it prominently in the UI and docs.

The current data source is CDC NWSS WVAL dataset `atcp-73re`. The UI currently filters California rows into these area groups:

- East Bay: Alameda + Contra Costa
- Alameda County
- Contra Costa County
- Bay Area: Alameda, Contra Costa, Marin, Napa, San Francisco, San Mateo, Santa Clara, Solano, Sonoma
- SF + Peninsula: San Francisco + San Mateo
- South Bay: Santa Clara
- California: all California rows

Area lines are population-weighted averages of selected matching sites. Keep the source notes clear that wastewater is a trend signal, not an exact case count.

## Promotion

When Tal chooses a staging option:

1. Copy that staging option's `index.html` and `styles.css` to the repo root.
2. Update paths from `../shared/...` and `../data/...` to `shared/...` and `data/...`.
3. Keep the staging folders unless Tal asks to delete them.
4. Verify root and chosen staging option both load from a local server.
