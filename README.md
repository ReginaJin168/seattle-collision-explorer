# Seattle Collision Explorer

An interactive product-data-science dashboard for exploring reported Seattle collisions by time, severity, weather, road condition, collision type, and location.

## Current version

- Uses 16,608 public SDOT collision records covering September 2023 through September 2026.
- Provides linked filters, KPI summaries, an interactive Esri tile map with Leaflet SVG collision vectors, monthly and hourly patterns, severity mix, weather comparison, and record-level detail. The map samples up to 1,600 records from the local dataset for display; summary statistics use all filtered records.
- Separates historical exploration from a Prediction Lab prototype with scenario inputs, an empirical injury-rate benchmark, context lifts, and univariate feature screening.
- Preserves missing context fields as `Unknown` rather than dropping them.
- Treats the dashboard as exploratory analysis; counts are not interpreted as causal effects or exposure-adjusted risk.

## Prediction Lab handoff

The current Prediction Lab is not a trained model. It uses smoothed historical injury rates and labels all outputs as non-causal benchmarks. When the modeling pipeline is ready, replace the baseline calculation in `renderPrediction()` with the exported probability function and populate the evaluation cards with holdout ROC AUC, recall, F1, and calibration results. The Historical Explorer can remain unchanged.

## Run locally

From this directory:

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

The map loads Esri street and imagery tiles over the internet. The collision data and dashboard code are bundled locally; no map API key is needed for these public tile services.

## Refresh the data

The preparation script reads the course-project collision CSV and creates a browser-ready JSON file:

```bash
python3 scripts/prepare_dashboard_data.py
```

## Planned analytical layer

- Join SDOT traffic study metadata and hourly traffic counts.
- Add Seattle street-segment road characteristics.
- Join hourly historical weather observations.
- Calculate traffic-adjusted collision measures.
- Integrate collision-probability and injury-severity model outputs after validation.

## Role

Regina Jin — visualization and dashboard lead; supports data preparation, model testing, and result interpretation.
