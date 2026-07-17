#!/usr/bin/env python3
"""Export pipeline outputs to a compact, self-contained data.js for the
offline dashboard (output/drought-dashboard/index.html).

All values are pipeline outputs (data/processed, data/interim). Person-days
are stored in MILLIONS as uint16 where they fit (max SM cumulative cell =
6947 million << 65535), so hover shows real numbers, not approximations.
Binary arrays are base64-encoded; the browser decodes them into typed arrays.
Everything lands in one `window.DXP = {...}` assignment loaded via
<script src="data.js"> — works under file:// (no fetch, no CORS, no API).

USAGE
  python output/drought-dashboard/export_dashboard_data.py
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import xarray as xr

ROOT = Path(__file__).resolve().parents[2]
PROC = ROOT / "data" / "processed"
INTERIM = ROOT / "data" / "interim"
OUT = Path(__file__).parent / "data.js"

NLAT, NLON = 360, 720   # 0.5 deg grid; lat descending 89.75..-89.75


def b64(arr) -> str:
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def to_millions_u16(a: np.ndarray) -> np.ndarray:
    """person-days -> millions, clipped into uint16 (0..65535).

    NaN (permanently masked cells, e.g. all-NaN across years for a max()
    reduction) is mapped to 0 explicitly rather than relying on the
    platform-defined float->uint cast.
    """
    return np.clip(np.nan_to_num(np.round(a / 1e6)), 0, 65535).astype("uint16")


def main():
    data: dict = {"grid": {"nlat": NLAT, "nlon": NLON,
                           "lat0": 89.75, "lon0": -179.75, "res": 0.5},
                  "unit": "person-days (millions, uint16 where dense)"}

    # ---- cumulative maps, dense uint16 (millions), per variable ------------
    # person-days: additive, so summed over year. people: NOT additive, so the
    # map uses the peak-year value per cell (pointwise max), consistent with
    # how "people affected" is reported everywhere else in this dashboard.
    cum = {}
    cumPpl = {}
    for var in ["SM", "Q", "SMxQ"]:
        ds = xr.open_dataset(INTERIM / f"exposure_{var}.nc")
        c = ds["person_days"].sum("year").values.astype("float64")  # (lat,lon)
        cum[var] = {"b64": b64(to_millions_u16(c.ravel())),
                    "max_m": int(to_millions_u16(c).max())}
        p = ds["people"].max("year").values.astype("float64")  # (lat,lon), peak year
        cumPpl[var] = {"b64": b64(to_millions_u16(p.ravel())),
                       "max_m": int(to_millions_u16(p).max())}
    data["cum"] = cum
    data["cumPpl"] = cumPpl

    # ---- SM per-year, sparse over the union of ever-exposed cells ----------
    ds = xr.open_dataset(INTERIM / "exposure_SM.nc")
    pyr = ds["person_days"].values.astype("float64")   # (year,lat,lon)
    pplyr = ds["people"].values.astype("float64")       # (year,lat,lon)
    years = [int(y) for y in ds["year"].values]
    ever = (pyr > 0).any(axis=0).ravel()
    cells = np.where(ever)[0].astype("int32")          # flat grid indices
    flat = pyr.reshape(pyr.shape[0], -1)[:, cells]     # (year, ncell)
    flat_ppl = pplyr.reshape(pplyr.shape[0], -1)[:, cells]
    data["smYear"] = {
        "years": years,
        "cells_b64": b64(cells),
        "vals_b64": b64(to_millions_u16(flat).ravel()),   # row-major (year, cell)
        "ppl_vals_b64": b64(to_millions_u16(flat_ppl).ravel()),
        "ncell": int(cells.size),
    }

    # ---- country series + cumulative totals --------------------------------
    cw = pd.read_csv(ROOT / "data" / "raw" / "region_mask_crosswalk.csv")
    name_by_code = dict(zip(cw.code, cw.name))
    countries = {}
    glob = {"years": years}
    for var in ["SM", "Q", "SMxQ"]:
        t = pd.read_csv(PROC / f"exposure_table_{var}.csv")
        reg = t[t.region != "GLOBAL"].copy()
        reg["code"] = reg.region.str.replace("R", "", regex=False).astype(int)
        for code, g in reg.groupby("code"):
            pdv = g[g.metric == "person_days"].set_index("year")["value"]
            ppl = g[g.metric == "people"].set_index("year")["value"]
            entry = countries.setdefault(int(code), {"name": name_by_code.get(code, str(code))})
            entry[f"pd_{var}"] = [round(float(pdv.get(y, 0.0)) / 1e9, 4) for y in years]   # billions
            entry[f"ppl_{var}"] = [round(float(ppl.get(y, 0.0)) / 1e6, 2) for y in years]  # millions
        # global per-year series (person-days in billions, people in millions)
        gg = t[t.region == "GLOBAL"]
        glob[f"pd_{var}"] = [round(float(gg[(gg.metric == "person_days") & (gg.year == y)].value.iloc[0]) / 1e9, 3) for y in years]
        glob[f"ppl_{var}"] = [round(float(gg[(gg.metric == "people") & (gg.year == y)].value.iloc[0]) / 1e6, 1) for y in years]
    data["global"] = glob
    data["countries"] = countries
    data["years"] = years

    # ---- attribution (endpoint + sensitivity windows) ----------------------
    attr = {}
    for var in ["SM", "Q", "SMxQ"]:
        e = pd.read_csv(PROC / f"decomposition_endpoint_{var}.csv").iloc[0]
        s = pd.read_csv(PROC / f"decomposition_sensitivity_{var}.csv")
        attr[var] = {
            "delta_bn": round(e.delta_person_days / 1e9, 2),
            "hazard_bn": round(e.hazard_effect / 1e9, 2),
            "pop_bn": round(e.population_effect / 1e9, 2),
            "windows": [{"from": r.window_from, "to": r.window_to,
                         "hazard_bn": round(r.hazard_effect / 1e9, 2),
                         "pop_bn": round(r.population_effect / 1e9, 2),
                         "hazard_share": round(r.hazard_share, 4)}
                        for _, r in s.iterrows()],
        }
    data["attribution"] = attr

    # counterfactual series for SM (observed / hazard-driven / pop-driven)
    cf = pd.read_csv(PROC / "decomposition_series_SM.csv").sort_values("year")
    data["counterfactual_SM"] = {
        "years": [int(y) for y in cf.year],
        "observed": [round(v / 1e9, 3) for v in cf.observed_person_days],
        "hazard": [round(v / 1e9, 3) for v in cf.hazard_driven_person_days],
        "population": [round(v / 1e9, 3) for v in cf.population_driven_person_days],
    }

    # ---- deprivation concentration -----------------------------------------
    conc = {}
    for var in ["SM", "SMxQ"]:
        st = pd.read_csv(PROC / f"stratified_exposure_{var}.csv").sort_values("quintile")
        meta = (PROC / f"stratified_exposure_{var}.meta.txt").read_text()
        ci = float([l for l in meta.splitlines() if l.startswith("concentration_index")][0].split(":")[1])
        conc[var] = {
            "pop_share": [round(v, 4) for v in st.population_share],
            "pd_share": [round(v, 4) for v in st.person_days_share],
            "ci": round(ci, 4),
        }
    data["concentration"] = conc

    # ---- MAUP diagnostic ---------------------------------------------------
    res = pd.read_csv(PROC / "validation_resolution_SM.csv").sort_values("year")
    frag = pd.read_csv(PROC / "validation_fragmentation_SM.csv").sort_values("year")
    m = res.merge(frag[["year", "borderline_share"]], on="year")
    data["maup"] = {
        "years": [int(y) for y in res.year],
        "ratio_bin": [round(v, 4) for v in res.ratio_bin],
        "ratio_frac": [round(v, 4) for v in res.ratio_frac],
        "borderline": [round(v, 4) for v in m.borderline_share],
        "r": round(float(m.borderline_share.corr(m.ratio_bin)), 3),
        "agree": {"cell_year": None, "kappa": None, "spearman": None},
    }
    agr = pd.read_csv(PROC / "validation_agreement_SM.csv").iloc[0]
    data["maup"]["agree"] = {"cell_year": round(float(agr.cell_year_agreement), 3),
                             "kappa": round(float(agr.cohen_kappa), 3),
                             "spearman": round(float(agr.series_spearman), 3)}

    # ---- event catalogue descriptives (SM/Q only -- matches what the paper
    # cites; PRE/PET are hazard-construction intermediates, not dashboard
    # variables, and SM∩Q is a daily overlap, not its own catalogued event) --
    ec = pd.read_csv(PROC / "event_catalogue_descriptives.csv").set_index("variable")
    data["eventCatalogue"] = {
        v: {"n": int(ec.loc[v, "n_events"]),
            "durMedian": round(float(ec.loc[v, "duration_days_median"]), 1),
            "areaMedianKm2": int(round(float(ec.loc[v, "area_max_km2_median"]))),
        } for v in ["SM", "Q"]
    }

    # write data.js -----------------------------------------------------------
    OUT.write_text("window.DXP = " + json.dumps(data, separators=(",", ":")) + ";\n")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.name}  ({kb:.0f} KB)  — {len(countries)} countries, "
          f"{data['smYear']['ncell']} SM cells x {len(years)} years")

    # ---- simplified country borders (separate file) ------------------------
    g = gpd.read_file(f"zip://{ROOT}/data/raw/ne_110m_admin_0_countries.zip")
    g = g[["NAME", "ISO_N3_EH", "geometry"]].copy()
    # label anchor (guaranteed inside the polygon) + a size proxy for
    # zoom-gating labels, both computed on the un-simplified geometry
    rep = g.geometry.representative_point()
    g["rep_lon"], g["rep_lat"] = rep.x, rep.y
    g["area_deg2"] = g.geometry.area
    g["geometry"] = g.geometry.simplify(0.12, preserve_topology=True)
    feats = []
    for _, row in g.iterrows():
        try:
            code = int(row["ISO_N3_EH"])
        except (ValueError, TypeError):
            code = -99
        feats.append({"type": "Feature",
                      "properties": {"name": row["NAME"], "code": code,
                                     "rep": [round(float(row["rep_lon"]), 3), round(float(row["rep_lat"]), 3)],
                                     "area": round(float(row["area_deg2"]), 2)},
                      "geometry": row.geometry.__geo_interface__})
    gj = {"type": "FeatureCollection", "features": feats}
    bpath = Path(__file__).parent / "borders.js"
    bpath.write_text("window.DXP_BORDERS = " + json.dumps(gj, separators=(",", ":")) + ";\n")
    print(f"wrote {bpath.name}  ({bpath.stat().st_size/1024:.0f} KB)  — {len(feats)} countries")

    # ---- rivers (display-only, for the Q / SM∩Q map overlay) ---------------
    r = gpd.read_file(f"zip://{ROOT}/data/raw/ne_110m_rivers_lake_centerlines.zip")
    r = r[["name", "geometry"]].copy()
    rfeats = []
    for _, row in r.iterrows():
        geom = row.geometry
        lines = [geom] if geom.geom_type == "LineString" else list(geom.geoms)
        coords = [[[round(float(x), 2), round(float(y), 2)] for x, y in ln.coords] for ln in lines]
        rfeats.append({"name": row["name"], "lines": coords})
    rpath = Path(__file__).parent / "rivers.js"
    rpath.write_text("window.DXP_RIVERS = " + json.dumps(rfeats, separators=(",", ":")) + ";\n")
    print(f"wrote {rpath.name}  ({rpath.stat().st_size/1024:.0f} KB)  — {len(rfeats)} rivers")


if __name__ == "__main__":
    main()
