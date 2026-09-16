# MERGE data explorer (standalone dashboard)

`dashboard.html` is a **self-contained** interactive explorer for the main-paper analysis frame —
open it directly in a browser (no server, no internet, no external requests). It embeds simplified
admin-1 geometry (Natural Earth 10m, public domain) + the phase-1 aggregates + the paper's headline
numbers (`paper_values.csv`).

**Contents:** admin-1 choropleth with a layer switcher (asset-wealth Gini, development SHDI, wealth
level IWI, poverty share, between-region inequality share, displacement events, median displacement
rate); a **year-range slider** and **hazard-type filter** that update the displacement map layers and the
charts live; **hover shows all region attributes at once** (for quick comparison) and click pins a full
profile; toggleable **region names** and **country names** that reveal progressively on zoom; zoom/pan; plus linked charts

**Map layers** are grouped into *Wealth & development* (latest-year Gini, SHDI, IWI, poverty, between-region share) and *Disaster impact* (displacement events & rate, people-affected rate, death rate — the last two from EM-DAT). Selecting a wealth/development layer greys out the year & hazard controls (they don't recolour a latest-year measure); selecting a disaster layer re-enables them. **Hover** shows every attribute at once plus a per-hazard-type event breakdown for the region; a **Play** button animates the years one at a time. — the R1–R4 coefficient forest, the
by-channel effect, the per-event Gini↔displacement scatter, and the Gini-decile displacement line.

**Framing:** exploration/demo tool, associational (not causal); admin-1 aggregates (latest year);
scope is the low- and middle-income countries the wealth surveys cover. Not new results.

## Rebuild
```
# 1) fetch admin-1 geometry (public domain, ~40 MB; not committed):
curl -L -o data/raw/natural_earth/ne_10m_admin_1_states_provinces.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
# 2) assemble the embedded data blob:
MERGE_PHASE=phase1 python src/dashboard/prep_dashboard_data.py
# 3) inline it into the standalone file (replaces __DATA__ in the template):
python - <<'PY'
t=open("src/dashboard/template.html").read(); d=open("docs/dashboard/dashboard_data.json").read().replace("</","<\\/")
open("docs/dashboard/dashboard.html","w").write(t.replace("__DATA__",d))
PY
```

## Design
Styled to HeiGIT's brand identity (crimson #cc0130, Poppins headings + Inter body, white minimalist institutional look). Fonts are embedded as base64 (`src/dashboard/fontface.css`) so the file stays fully offline. Written for a general audience: a ‘How to read’ guide, plain-language description for every map layer and chart, clear axis labels/units/legends, a region-profile inspector, a glossary, and toggleable zoomable region names on the map.
