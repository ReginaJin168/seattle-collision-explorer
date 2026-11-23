# Seattle Collision Explorer

An interactive product-data-science dashboard for exploring reported Seattle collisions by time, severity, weather, road condition, collision type, and location.

## Current version

- Uses 16,578 cleaned SDOT collision records (September 2023 – September 2026). Cleaning uses the team's shared `cleaned_data/collision_cleaning.py` (30 rows from another extract removed), fixes swapped latitude/longitude, and joins Open-Meteo hourly weather.
- **Historical Explorer**: linked filters, KPI summaries, an interactive Esri tile map with Leaflet SVG collision points, monthly and hourly patterns, severity mix, weather comparison and record-level detail. Reports with no recorded time (stored as 00:00, 3,218 records) are kept in counts and on the map but left out of the hourly chart. The map shows up to 1,600 points; statistics use all filtered records.
- **Prediction Lab**: a logistic regression trained in Python (time period, weather, road condition, collision type, light condition) predicts the probability that a collision involves an injury. It was trained on records before September 2025 and tested on September 2025 – June 2026: ROC AUC 0.73, accuracy 71% (vs 62% for always guessing "no injury"). The page shows the model's coefficients as odds ratios and its test metrics.
- Associations only; counts are not interpreted as causal effects.

## How the pieces fit

All data work is done in Python; the web page only displays the results.

| Step | File |
| --- | --- |
| Clean collisions + join weather | `cleaned_data/build_all_collisions_weather.py` |
| Build dashboard data, train and evaluate the injury model | `web/scripts/prepare_dashboard_data.py` |
| Display | `web/index.html`, `web/app.js`, `web/dashboard.css` |

## Run locally

From this directory:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The map loads Esri street and imagery tiles over the internet. The collision data and dashboard code are bundled locally; no map API key is needed for these public tile services.

## Refresh the data

From the repository root:

```bash
python web/scripts/prepare_dashboard_data.py
```

This rewrites `web/data/collisions.json` and `web/data/collisions-data.js`.

## Role

Regina Jin — visualization and dashboard lead; supports data preparation, model testing, and result interpretation.
