# Wastewater Watch

Live site: https://talrme.github.io/wastewater-watch/

Signal Board is the promoted static respiratory wastewater dashboard. It runs on GitHub Pages and uses real CDC NWSS data.

The earlier visual explorations remain in:

- `staging_1` - Bay Radar
- `staging_2` - Signal Board reference copy
- `staging_3` - Waterline
- `staging_4` - Viral Transit
- `staging_5` - Field Notes

The production page uses the same real data model as the staging options.

## Data

The data file is generated from the CDC NWSS public Socrata dataset:

`CDC Wastewater Viral Activity Level for SARS-CoV-2, Influenza A and RSV`

Dataset ID: `atcp-73re`

No dummy data is used.

The browser tries to fetch current California rows directly from the CDC API, normalizes them, aggregates them in-browser, and caches that live payload in local storage. By default it reuses browser-cached data for 3 days; this can be changed to 1, 3, or 7 days in Settings. The checked-in `data/wastewater.json` file remains as a reliable bundled fallback and for GitHub Actions refreshes.

## Manual Refresh

From the repo root:

```bash
python3 scripts/refresh_data.py
```

Then commit the updated `data/wastewater.json`.

The website also has a **Refresh data** button. That button fetches live CDC rows in the browser and stores the refreshed data in that browser's local storage. It does not update the checked-in `data/wastewater.json` file.

## GitHub Actions Refresh

The workflow is already included at:

`.github/workflows/refresh-data.yml`

To enable it:

1. Push this repo to GitHub.
2. Go to the repo's **Actions** tab.
3. If GitHub asks, enable workflows.
4. The workflow will run once daily at `14:25 UTC`.
5. You can also run it manually from **Actions -> Refresh wastewater data -> Run workflow**.

The workflow checks out the repo, runs `python3 scripts/refresh_data.py`, and commits `data/wastewater.json` if it changed.

## GitHub Pages

In GitHub:

1. Open **Settings -> Pages**.
2. Set **Source** to `Deploy from a branch`.
3. Choose `main` and `/ (root)`.
4. Save.

The live site will be at:

https://talrme.github.io/wastewater-watch/
