# Wastewater Watch

Live site: https://talrme.github.io/wastewater-watch/

Five staging concepts for a static respiratory wastewater dashboard:

- `staging_1` - Bay Radar
- `staging_2` - Signal Board
- `staging_3` - Waterline
- `staging_4` - Viral Transit
- `staging_5` - Field Notes

All options use the same real data file: `data/wastewater.json`.

## Data

The data file is generated from the CDC NWSS public Socrata dataset:

`CDC Wastewater Viral Activity Level for SARS-CoV-2, Influenza A and RSV`

Dataset ID: `atcp-73re`

The refresh script pulls California rows for the last ~400 days and writes a compact static JSON file. No dummy data is used.

## Manual Refresh

From the repo root:

```bash
python3 scripts/refresh_data.py
```

Then commit the updated `data/wastewater.json`.

Each staging website also has a **Refresh now** button. That button fetches live CDC rows in the browser and stores the refreshed data in that browser's local storage. It does not update the checked-in `data/wastewater.json` file.

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

The staging index will be at:

https://talrme.github.io/wastewater-watch/
