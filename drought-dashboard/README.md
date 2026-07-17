# Interactive results dashboard

A self-contained, offline web dashboard for the drought-exposure results —
no server, no external API, no tile keys. Open `index.html` by double-clicking
it (or serve the folder statically).

## Files

| File | What |
|---|---|
| `index.html` | The app: custom-canvas equirectangular map + five canvas charts. HeiGIT-style. |
| `data.js` | `window.DXP` — pipeline outputs as base64 typed arrays + JSON (person-days and people-affected, in millions/billions). ~13 MB. |
| `borders.js` | `window.DXP_BORDERS` — Natural Earth country outlines, simplified, with a label anchor point and a size proxy per country (for zoom-gated name labels). |
| `rivers.js` | `window.DXP_RIVERS` — the world's 13 major rivers (Natural Earth), display-only context for the Q / SM∩Q map. |
| `export_dashboard_data.py` | Regenerates `data.js` + `borders.js` + `rivers.js` from `data/processed/`, `data/interim/`, and `data/raw/`. |

Regenerate after a pipeline re-run:

```bash
python output/drought-dashboard/export_dashboard_data.py
```

The rivers file is a one-time acquisition, not part of the analysis cascade:

```bash
python scripts/acquire_data.py --fetch naturalearth-rivers
```

## What it shows

The dashboard is meant to stand on its own — without the paper — for a
non-expert reader:

- **Intro cards** at the top explain, in plain language, what the dashboard
  shows, what a "person-day" is, and what counts as a drought here (the
  125,000 km² / 30-day event thresholds, and the 0.5° grid).
- **Variable-definition cards** explain the three drought variables for
  non-experts: **SM** (soil-moisture drought — agricultural, "what most people
  picture as a drought"), **Q** (runoff drought — hydrological, rivers/
  reservoirs/taps), **SM∩Q** (compound — both at once, no fallback water
  source).
- **Map** — per-0.5°-cell choropleth (SM / Q / SM∩Q) or a national-totals
  choropleth, either cumulative or over a chosen span. Zoom buttons
  (+ / − / reset) sit top-right of the map alongside scroll-to-zoom and
  drag-to-pan; a floating tooltip on hover is offset clear of the cursor icon.
  Country name labels are zoom-gated (large countries first, more appear as
  you zoom in) and can be switched off with the "Aa" button. When Q or SM∩Q
  is selected, the world's 13 major rivers are drawn for context — reinforcing
  the "rivers, reservoirs and taps" language in the variable card; they are
  cartographic reference only, not part of the analysis.
- **Time span** — defaults to a single **year slider** (easiest way to pick one
  specific year, e.g. for the map). A second tab, **"Period (expert)"**, swaps
  in two range sliders ("From" / "To") for any window (e.g. 2015–2024) plus a
  "▶ Watch it build up, 1980→2024" animation. SM supports any custom span
  cell-by-cell; Q/SM∩Q show the full 1980–2024 map with a note when a partial
  span is selected (their per-year cell arrays aren't shipped, to keep the
  file size reasonable).
- **Headline metric toggle** — "Person-days" vs "People affected", and this
  now actually changes **what the map shows**, not just the side-panel number:
  the person-days map sums per cell across the chosen span (additive); the
  people-affected map shows, per cell, the **peak year's** population that was
  ever exposed within the span (not summed — the same population counted in
  two different drought years isn't double-added). Both rasters come from the
  pipeline's real per-cell `people` and `person_days` variables (`data/interim/
  exposure_*.nc`), not a placeholder. The side numbers panel follows the same
  peak/mean-not-summed logic, with an explicit note explaining why.
- **"What you're looking at" panel** — a text explanation that updates live
  with the current variable, map mode, metric, and time span.
- **Findings charts** — LMDI attribution (hazard vs population, per endpoint
  window), the observed-vs-counterfactual trend, the deprivation concentration
  curves, the MAUP scale-sensitivity diagnostic with its headline stats, and a
  fifth chart showing the actual mechanism behind that diagnostic: a scatter of
  each year's borderline-coverage population share against how badly that
  year's binary grid undercounted exposure (r = −0.83), with 1986 — the worst
  year — marked. Previously only the headline "understated by up to 17%" was
  shown without the evidence for *why*; this was already computed
  (`data/processed/validation_fragmentation_SM.csv`) but not surfaced.
- **Event catalogue stats** — the "what counts as a drought" intro card now
  states the real catalogue numbers (715 SM events, median 63 days; 813 Q
  events, median 96 days) instead of only the round threshold values, from
  `data/processed/event_catalogue_descriptives.csv`.
- **Footer** — two-column reference: what each dataset is (Data), and how to
  read person-days vs people-affected and the resolution caveat (Method).

## Honesty on resolution

The finest resolution of the *results* is 0.5° (~55 km) — the drought catalogue's
own grid — and only major, persistent events enter it. The map renders genuine
per-cell person-days at that resolution; it does **not** imply finer spatial
precision. The "cost of the 0.5° grid" panel quantifies exactly this limit
(the paper's RQ5 / MAUP finding). This is stated explicitly in the intro cards
and the footer, not just in the paper.

## Styling

Look and feel follow **heigit.org**: dark red accent (`--accent:#a01e2b`), dark
charcoal header, sharp corners, flat cards. The exact HeiGIT brand hex could
not be verified against the live site in the build environment (browser
tooling was unavailable) — `--accent` (and `--accent-dk`) are single CSS
variables at the top of `index.html`, so the red can be swapped for the exact
brand token in one edit if it turns out to differ.

## Note

Visually verified in-browser (served over local HTTP, since `file://` blocks
the read tools used to inspect it): metric toggle genuinely changes the map
raster (checked `rasterMax` differs between person-days and people-affected —
6947 M vs 22 M for cumulative SM), country choropleth responds to the metric
too, the hover tooltip no longer sits under the cursor icon, the single-year
↔ period toggle correctly collapses/expands the time-span UI, the zoom
buttons change `view.k` as expected, rivers render only for Q/SM∩Q, country
labels toggle on/off and are zoom-gated correctly, the fragmentation scatter
draws real pixels matching r = −0.831 from the actual data, and the event
stats render with a locale-independent thousands separator (all checked
against the actual rendered page, not just the source).

## Sub-national maps — not currently possible without a pipeline change

The dashboard's finest-resolution layer *is* the 0.5° (~55 km) grid — there is
no admin-1 (state/province) aggregation in `data/processed/`, because no
admin-1 region mask or aggregation stage exists in the pipeline (only the
country-level mask used for S3). Adding it would mean a real pipeline
extension (admin-1 boundaries + a new region mask + a new aggregation run),
not a dashboard-only change — and for many countries, admin-1 units are close
to or smaller than a single 0.5° cell, which risks implying spatial precision
the drought catalogue doesn't have. The 0.5° grid view already shows
sub-national variation directly (cells inside a country are shaded
individually); it is the most granular honest view this dataset supports.
