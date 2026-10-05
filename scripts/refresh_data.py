#!/usr/bin/env python3
"""Fetch real CDC NWSS wastewater data for the static site.

This script intentionally uses only the Python standard library so it can run
both locally and inside GitHub Actions without a dependency install step.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path


DATASET = "atcp-73re"
ENDPOINT = f"https://data.cdc.gov/resource/{DATASET}.json"
STATE = "California"
COLUMNS = [
    "state_territory",
    "counties_served",
    "site",
    "population_served",
    "source",
    "site_wval",
    "site_wval_category",
    "date_included_in_wval",
    "week_end",
    "pathogen_target",
    "date_updated",
]


def build_url(from_week: str) -> str:
    where = f"state_territory='{STATE}' AND week_end >= '{from_week}'"
    params = {
        "$select": ",".join(COLUMNS),
        "$where": where,
        "$limit": "50000",
        "$order": "week_end,site,pathogen_target",
    }
    return f"{ENDPOINT}?{urllib.parse.urlencode(params)}"


def as_float(value: object) -> float | None:
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def as_int(value: object) -> int | None:
    try:
        return int(float(value))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def normalize(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    cleaned: list[dict[str, object]] = []
    for row in rows:
        wval = as_float(row.get("site_wval"))
        if wval is None:
            continue
        cleaned.append(
            {
                "state": row.get("state_territory") or STATE,
                "countiesServed": row.get("counties_served") or "",
                "site": row.get("site") or "",
                "populationServed": as_int(row.get("population_served")),
                "source": row.get("source") or "",
                "wval": wval,
                "category": row.get("site_wval_category") or "Unknown",
                "dateIncluded": row.get("date_included_in_wval") or "",
                "weekEnd": row.get("week_end") or "",
                "pathogen": row.get("pathogen_target") or "",
                "dateUpdated": row.get("date_updated") or "",
            }
        )
    return cleaned


def main() -> int:
    today = dt.date.today()
    from_week = (today - dt.timedelta(days=400)).isoformat()
    url = build_url(from_week)
    print(f"Fetching CDC NWSS wastewater data from {from_week} onward...")
    with urllib.request.urlopen(url, timeout=60) as response:
        raw = response.read().decode("utf-8")
    rows = json.loads(raw)
    if not isinstance(rows, list):
        print(raw, file=sys.stderr)
        raise SystemExit("CDC response was not a row list")
    cleaned = normalize(rows)
    if not cleaned:
        raise SystemExit("CDC response returned no usable rows")

    week_ends = sorted({str(row["weekEnd"]) for row in cleaned if row.get("weekEnd")})
    pathogens = sorted({str(row["pathogen"]) for row in cleaned if row.get("pathogen")})
    payload = {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source": {
            "name": "CDC Wastewater Viral Activity Level for SARS-CoV-2, Influenza A and RSV",
            "datasetId": DATASET,
            "url": f"https://data.cdc.gov/Public-Health-Surveillance/CDC-Wastewater-Viral-Activity-Level-for-SARS-CoV-2/{DATASET}",
            "api": ENDPOINT,
        },
        "filters": {
            "state": STATE,
            "fromWeek": from_week,
            "pathogens": pathogens,
        },
        "summary": {
            "rowCount": len(cleaned),
            "latestWeekEnd": week_ends[-1] if week_ends else None,
            "earliestWeekEnd": week_ends[0] if week_ends else None,
        },
        "rows": cleaned,
    }

    out_path = Path(__file__).resolve().parents[1] / "data" / "wastewater.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(cleaned):,} rows to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
