/* Diverging Trends dashboard — static, offline-capable. Data: window.BASINS/COUNTRIES/LABELS/CHARTS.
   Data colors = the paper's validated Okabe-Ito palettes; HeiGIT red is UI chrome only. */
"use strict";

// ---------------------------------------------------------------- palettes --
const TREND = { declining: "#D55E00", increasing: "#0072B2", "no-trend": "#d9d9d9", "no-coverage": "#f5f5f5" };
const FRAC_BINS = [0.001, 0.1, 0.25, 0.5, 1.0001];
const FRAC_COLS = ["#f5f5f5", "#fdd0a2", "#fd8d3c", "#d94801", "#7f2704"];
const FRAC_LBLS = ["0% (none declining)", "&gt;0–10%", "10–25%", "25–50%", "50–100%"];
const BIVAR = [["#e8e8e8","#e4acac","#c85a5a"],["#b0d5df","#ad9ea5","#985356"],["#64acbe","#627f8c","#574249"]];
const POP_BINS = [0.999, 1.5, 2.5, 4, 1e9];
const POP_COLS = ["#2166ac", "#f2f0eb", "#d9b38a", "#b35806", "#7f3b08"];
const POP_LBLS = ["shrinking (&lt;1×)", "1–1.5×", "1.5–2.5×", "2.5–4×", "&gt;4×"];
const NODATA = "#f5f5f5";

function bin(v, bins, cols) { for (let i = 0; i < bins.length; i++) if (v <= bins[i]) return cols[i]; return cols[cols.length - 1]; }
function binIdx(v, bins) { for (let i = 0; i < bins.length; i++) if (v <= bins[i]) return i; return bins.length - 1; }
const fmt = (x) => x.toLocaleString("en-US");
const M = (x) => (x >= 1e6 ? (x / 1e6).toFixed(1) + " M" : x >= 1e3 ? Math.round(x / 1e3) + " k" : fmt(Math.round(x)));

// -------------------------------------------------------------------- map --
const map = L.map("map", { worldCopyJump: false, zoomControl: true, minZoom: 2, maxZoom: 8, attributionControl: false })
  .setView([22, 10], 2);
map.zoomControl.setPosition("bottomright");

// home button
const Home = L.Control.extend({
  options: { position: "bottomright" },
  onAdd() {
    const d = L.DomUtil.create("div", "leaflet-bar");
    const a = L.DomUtil.create("a", "", d);
    a.href = "#"; a.title = "Reset view"; a.innerHTML = "⌂";
    a.onclick = (e) => { e.preventDefault(); map.setView([22, 10], 2); };
    return d;
  },
});
map.addControl(new Home());

const countriesLayer = L.geoJSON(window.COUNTRIES, {
  style: { color: "#ffffff", weight: 0.6, fillColor: "#e7e5df", fillOpacity: 1, interactive: false },
}).addTo(map);

let MODE = "trend";

// Performance: with 4,734 basin polygons, recomputing inline SVG styles on every mode switch
// (basinsLayer.setStyle) is too slow for smooth interaction. Instead, each basin gets a fixed
// set of CSS classes ONCE at creation, and switching modes just swaps one class on the map
// container — the browser repaints via CSS (O(1) JS), not a 4,734-element JS/DOM loop.
function basinClasses(p) {
  const fracC = p.hc === "no-coverage" ? "f-nodata" : `f-${binIdx(p.fd, FRAC_BINS)}`;
  const bivarC = p.fx >= 0 ? `v-${p.gy}-${p.fx}` : "v-none";
  const popC = p.pop0 > 0 ? `p-${binIdx(p.pop1 / p.pop0, POP_BINS)}` : "p-none";
  return `t-${p.hc} ${fracC} ${bivarC} ${popC}${p.hot ? " hot" : ""}`;
}
function styleBasin(f) {
  const p = f.properties;
  return { className: basinClasses(p), color: "#ffffff", weight: 0.35, fillColor: TREND[p.hc] || NODATA, fillOpacity: 1 };
}
function unhighlight(ly) {
  const p = ly.feature.properties;
  const hot = MODE === "bivar" && document.getElementById("hotChk").checked && p.hot;
  ly.setStyle({ color: hot ? "#1a1a1a" : "#ffffff", weight: hot ? 1.4 : 0.35 });
}

function popupHTML(p) {
  const growth = p.pop0 > 0 ? (p.pop1 / p.pop0).toFixed(2) + "×" : "–";
  const cls = { declining: "declining ▼", increasing: "increasing ▲", "no-trend": "no significant trend", "no-coverage": "no discharge data" };
  const biv = p.fx >= 0
    ? `decline tercile ${p.fx + 1}/3, growth tercile ${p.gy + 1}/3` + (p.hot ? " — <b>statistical compound hotspot</b>" : "")
    : "not classified (no coverage or no 1980 population)";
  return `<h3>Basin ${p.id} <span style="font-weight:400;color:#8a8a96">· ${p.rg}</span></h3>
    <div class="pop-row"><span class="k">Discharge trend (basin majority)</span><span class="v">${cls[p.hc] || p.hc}</span></div>
    <div class="pop-row"><span class="k">Trend at main-stem/outlet cell</span><span class="v">${cls[p.oc] || p.oc}</span></div>
    <div class="pop-row"><span class="k">Share of declining cells</span><span class="v">${Math.round(p.fd * 100)}%</span></div>
    <div class="pop-row"><span class="k">Discharge grid cells in basin</span><span class="v">${p.nc}</span></div>
    <div class="pop-row"><span class="k">Population 1980</span><span class="v">${M(p.pop0)}</span></div>
    <div class="pop-row"><span class="k">Population 2020</span><span class="v">${M(p.pop1)}</span></div>
    <div class="pop-row"><span class="k">Population change 1980→2020</span><span class="v">${growth}</span></div>
    <div class="pop-row"><span class="k">Decline × growth class</span><span class="v" style="font-weight:400">${biv}</span></div>
    <p class="pop-note">“Declining” = statistically significant downward trend of annual mean discharge
    1980–2019 (FDR-controlled). Values are basin aggregates of a coarse (0.5°) reconstruction —
    indicative, not suitable for local planning.</p>`;
}

const basinsLayer = L.geoJSON(window.BASINS, {
  style: styleBasin,
  onEachFeature: (f, ly) => {
    ly.bindPopup(() => popupHTML(f.properties), { maxWidth: 340 });
    ly.on("mouseover", () => ly.setStyle({ weight: 1.6, color: "#cc0130" }));
    ly.on("mouseout", () => unhighlight(ly));
  },
}).addTo(map);

// country labels (toggleable, zoom-dependent)
let labelLayer = L.layerGroup();
function rebuildLabels() {
  labelLayer.clearLayers();
  const z = map.getZoom();
  if (!document.getElementById("lblChk").checked || z < 3) return;
  const min = z >= 5 ? 0 : z >= 4 ? 1 : 2; // rough importance filter by name length heuristics
  window.LABELS.forEach((l) => {
    if (z < 5 && l.n.length > (z >= 4 ? 18 : 12)) return;
    labelLayer.addLayer(
      L.marker([l.y, l.x], {
        interactive: false,
        icon: L.divIcon({ className: "country-label", html: l.n, iconSize: null }),
      })
    );
  });
}
labelLayer.addTo(map);
map.on("zoomend", rebuildLabels);
rebuildLabels();

// ------------------------------------------------------- mode UI + legend --
const EXPLAIN = {
  trend: `<b>Discharge trend class, 1980–2019.</b> Basins are <b>declining</b> when more than half of
    their discharge grid cells show a statistically significant downward trend of annual mean river
    flow (and <b>increasing</b> vice-versa). Most basins show no significant trend — natural year-to-year
    variability is large. Light basins have no usable discharge data.`,
  frac: `<b>Share of declining cells.</b> A more nuanced view than the class: what fraction of each
    basin's discharge cells declined significantly? This share (0–100%) is what the study's primary
    exposure measure weights population by — no arbitrary threshold needed.`,
  bivar: `<b>Where decline and growth meet.</b> Color mixes two rankings: redder = stronger discharge
    decline, darker/bluer = faster population growth 1980–2020. The <b>dark top-right class</b> (top third
    in <i>both</i>) marks potential problem basins. Black outlines: basins where this joint class forms
    statistically significant spatial clusters (local join counts, FDR-controlled) — the Middle East,
    Sahel margin, interior Brazil and the North American Southwest.`,
  pop: `<b>Population change 1980→2020</b> per basin (ratio: 2× = doubled), from the GHS-POP census-based
    grids. Compare with the trend views: exposure grows where this map is dark <i>and</i> discharge declines.`,
};

function legendHTML() {
  if (MODE === "trend") {
    return `<div class="lg-title">Discharge trend 1980–2019</div>` +
      [["declining","declining (significant ▼)"],["increasing","increasing (significant ▲)"],["no-trend","no significant trend"],["no-coverage","no discharge data"]]
        .map(([k, l]) => `<div class="lg-row"><span class="lg-swatch" style="background:${TREND[k]}"></span>${l}</div>`).join("");
  }
  if (MODE === "frac") {
    return `<div class="lg-title">Declining cells per basin</div>` +
      FRAC_COLS.map((c, i) => `<div class="lg-row"><span class="lg-swatch" style="background:${c}"></span>${FRAC_LBLS[i]}</div>`).join("") +
      `<div class="lg-row"><span class="lg-swatch" style="background:${NODATA}"></span>no discharge data</div>`;
  }
  if (MODE === "bivar") {
    let grid = "";
    for (let gy = 2; gy >= 0; gy--) for (let fx = 0; fx < 3; fx++)
      grid += `<span class="bivar-cell" style="background:${BIVAR[gy][fx]}"></span>`;
    return `<div class="lg-title">Decline × population growth</div>
      <div class="bivar-axis" style="margin-left:14px">↑ population growth</div>
      <div class="bivar-grid">${grid}</div>
      <div class="bivar-axis" style="margin-left:14px">discharge decline →</div>
      <div class="lg-row" style="margin-top:5px"><span class="lg-swatch outline"></span>significant hotspot cluster</div>
      <div class="lg-row"><span class="lg-swatch" style="background:${NODATA}"></span>not classified</div>`;
  }
  return `<div class="lg-title">Population 2020 ÷ 1980</div>` +
    POP_COLS.map((c, i) => `<div class="lg-row"><span class="lg-swatch" style="background:${c}"></span>${POP_LBLS[i]}</div>`).join("") +
    `<div class="lg-row"><span class="lg-swatch" style="background:${NODATA}"></span>no 1980 population</div>`;
}

const mapEl = document.getElementById("map");
function refreshMode() {
  document.getElementById("legend").innerHTML = legendHTML();
  document.getElementById("modeExplain").innerHTML = EXPLAIN[MODE];
  document.getElementById("hotWrap").classList.toggle("hidden", MODE !== "bivar");
  mapEl.classList.remove("mode-trend", "mode-frac", "mode-bivar", "mode-pop");
  mapEl.classList.add("mode-" + MODE); // CSS repaints all basins instantly — no per-feature JS loop
}
document.querySelectorAll('input[name="mode"]').forEach((r) =>
  r.addEventListener("change", () => { MODE = r.value; refreshMode(); }));
document.getElementById("hotChk").addEventListener("change", (e) =>
  mapEl.classList.toggle("show-hot", e.target.checked));
document.getElementById("lblChk").addEventListener("change", rebuildLabels);
mapEl.classList.add("show-hot");
refreshMode();

// ------------------------------------------------------------- key cards --
const K = window.CHARTS.key;
const kc = [
  [`${K.E0_M} → ${K.E1_M} M`, `people in declining-discharge basins, 1980 → 2020 (+${K.growth_pct}%)`],
  [`${K.pop_effect_pct}%`, `of that increase is explained by global population growth alone`],
  [`${K.cells_declining_pct}%`, `of the world's discharge grid declined significantly (${K.cells_increasing_pct}% increased)`],
  [`${K.n_hotspots}`, `of ${fmt(K.n_basins)} basins are statistically significant decline-×-growth hotspots`],
];
document.getElementById("kcards").innerHTML = kc
  .map(([n, l]) => `<div class="kcard"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join("");
document.getElementById("cfgHash").textContent = window.CHARTS.meta.config_hash;

// -------------------------------------------------------------- SVG utils --
const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function chartFrame(id, w, h) {
  const host = document.getElementById(id);
  host.innerHTML = "";
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%" }, host);
  return svg;
}
function axisText(svg, x, y, txt, opts = {}) {
  const t = svgEl("text", { x, y, "font-size": opts.size || 10, fill: opts.col || "#515161",
    "text-anchor": opts.anchor || "start", ...(opts.rotate ? { transform: `rotate(-90 ${x} ${y})` } : {}) }, svg);
  t.textContent = txt;
  return t;
}

// --------------------------------------------------------- exposure chart --
(function expChart() {
  const S = window.CHARTS.series.GLOBAL, GR = window.CHARTS.grun;
  const w = 430, h = 240, mL = 46, mR = 10, mT = 12, mB = 34;
  const svg = chartFrame("expChart", w, h);
  const xs = S.epochs, maxY = 700;
  const X = (e) => mL + ((e - xs[0]) / (xs[xs.length - 1] - xs[0])) * (w - mL - mR);
  const Y = (v) => mT + (1 - v / maxY) * (h - mT - mB);
  for (let v = 0; v <= maxY; v += 100) {
    svgEl("line", { x1: mL, x2: w - mR, y1: Y(v), y2: Y(v), class: "gridline" }, svg);
    axisText(svg, mL - 5, Y(v) + 3, v, { anchor: "end" });
  }
  xs.filter((e) => e % 10 === 0).forEach((e) => axisText(svg, X(e), h - mB + 14, e, { anchor: "middle" }));
  axisText(svg, 12, (h - mB + mT) / 2, "million people", { anchor: "middle", rotate: true, size: 10.5 });
  axisText(svg, (mL + w - mR) / 2, h - 4, "year (population epoch)", { anchor: "middle", size: 10.5 });

  // band between strict (majority) and broad (outlet) definitions
  const band = S.epochs.map((e, i) => `${X(e)},${Y(S.E_outlet[i])}`).join(" ") + " " +
    S.epochs.slice().reverse().map((e) => { const i = S.epochs.indexOf(e); return `${X(e)},${Y(S.E_majority[i])}`; }).join(" ");
  svgEl("polygon", { points: band, fill: "#0072B2", opacity: 0.09 }, svg);

  function line(vals, color, dash, width) {
    const d = S.epochs.map((e, i) => `${i ? "L" : "M"}${X(e)},${Y(vals[i])}`).join("");
    svgEl("path", { d, fill: "none", stroke: color, "stroke-width": width, ...(dash ? { "stroke-dasharray": dash } : {}) }, svg);
  }
  line(S.E_outlet, "#7fb2d4", null, 1.3);
  line(S.E_majority, "#8fcdb8", null, 1.3);
  if (GR) line(GR.E_frac_grun, "#8a8a96", "5 3", 1.5);
  line(S.E_frac, "#0072B2", null, 2.6);

  const lbl = (txt, v, col, dy = 0) => axisText(svg, w - mR - 2, Y(v) + dy, txt, { anchor: "end", col, size: 9.5 });
  lbl("broad definition (main river declining)", S.E_outlet[S.E_outlet.length - 1] - 28, "#5f8cab", -4);
  lbl("primary definition", S.E_frac[S.E_frac.length - 1] + 26, "#0072B2", -2);
  lbl("robustness check (independent runoff data)", GR ? GR.E_frac_grun[GR.E_frac_grun.length - 1] - 20 : 0, "#8a8a96", 20);
  lbl("strict definition (basin majority declining)", S.E_majority[S.E_majority.length - 1] - 20, "#3e9c78", -4);
})();

// ------------------------------------------------------------ LMDI chart --
const REGIONS = Object.keys(window.CHARTS.lmdi).filter((r) => r !== "Unknown").sort((a, b) =>
  a === "GLOBAL" ? -1 : b === "GLOBAL" ? 1 : a.localeCompare(b));
const sel = document.getElementById("regSel");
REGIONS.forEach((r) => { const o = document.createElement("option"); o.value = r; o.textContent = r === "GLOBAL" ? "World (global)" : r; sel.appendChild(o); });

function drawLmdi(region) {
  const d = window.CHARTS.lmdi[region];
  const w = 430, h = 220, mL = 46, mB = 40, mT = 18;
  const svg = chartFrame("lmdiChart", w, h);
  const maxY = Math.max(d.E1, d.E0 + Math.max(d.dP, 0)) * 1.18;
  const Y = (v) => mT + (1 - v / maxY) * (h - mT - mB);
  const cols = { E: "#5f6b7a", dP: "#E69F00", dc: "#D55E00" };
  const bars = [
    { x: 0, base: 0, val: d.E0, col: cols.E, lab: `exposed\n1980`, num: d.E0 },
    { x: 1, base: d.E0, val: d.dP, col: cols.dP, lab: "population\ngrowth", num: (d.dP >= 0 ? "+" : "") + d.dP },
    { x: 2, base: d.E0 + d.dP, val: d.dc, col: cols.dc, lab: "concentration\neffect", num: (d.dc >= 0 ? "+" : "") + d.dc },
    { x: 3, base: 0, val: d.E1, col: cols.E, lab: `exposed\n2020`, num: d.E1 },
  ];
  for (let v = 0; v <= maxY; v += maxY > 300 ? 100 : maxY > 80 ? 25 : 10) {
    svgEl("line", { x1: mL, x2: w - 8, y1: Y(v), y2: Y(v), class: "gridline" }, svg);
    axisText(svg, mL - 5, Y(v) + 3, Math.round(v), { anchor: "end" });
  }
  const bw = 62, gap = (w - mL - 20 - 4 * bw) / 3;
  bars.forEach((b) => {
    const x = mL + 8 + b.x * (bw + gap);
    const y0 = Y(Math.max(b.base, b.base + b.val)), hgt = Math.abs(Y(b.base) - Y(b.base + b.val));
    svgEl("rect", { x, y: y0, width: bw, height: Math.max(hgt, 1.5), fill: b.col, rx: 1.5 }, svg);
    axisText(svg, x + bw / 2, y0 - 5, b.num + " M", { anchor: "middle", size: 10, col: "#1c1c24" });
    b.lab.split("\n").forEach((ln, i) =>
      axisText(svg, x + bw / 2, h - mB + 13 + i * 11, ln, { anchor: "middle", size: 9.5 }));
  });
  axisText(svg, 12, (h - mB + mT) / 2, "million people", { anchor: "middle", rotate: true, size: 10.5 });

  const note = document.getElementById("lmdiNote");
  const pctP = Math.round((d.dP / (d.E1 - d.E0)) * 100);
  const dir = d.dc > 0 ? "toward" : "away from";
  note.innerHTML = region === "GLOBAL"
    ? `Reading: of the +${(d.E1 - d.E0).toFixed(1)} M change, <b>${pctP}% is population growth</b>;
       the small remainder (+${d.dc} M) is population shifting toward declining basins — see the next
       chart for where that really comes from.`
    : `Reading: within ${region}, population growth contributes ${d.dP >= 0 ? "+" : ""}${d.dP} M; on top of that,
       population shifted <b>${dir}</b> declining basins (${d.dc >= 0 ? "+" : ""}${d.dc} M).
       Regional decompositions use regional totals and do not sum to the global one.`;
  }
sel.addEventListener("change", () => drawLmdi(sel.value));
drawLmdi("GLOBAL");

// ------------------------------------------------------ between/within ----
(function bwChart() {
  const d = window.CHARTS.bw;
  const w = 460, h = 210, mL = 172, mR = 55;
  const svg = chartFrame("bwChart", w, h);
  const rows = [
    { lines: ["global population", "scale"], val: d.scale, col: "#E69F00" },
    { lines: ["between regions", "(growth in already-", "exposed regions)"], val: d.between, col: "#CC79A7" },
    { lines: ["within regions", "(shift relative to", "declining basins)"], val: d.within, col: "#D55E00" },
  ];
  const maxV = 240;
  const X = (v) => mL + (v / maxV) * (w - mL - mR);
  rows.forEach((r, i) => {
    const y = 30 + i * 58;
    const x0 = Math.min(X(0), X(r.val)), bw2 = Math.abs(X(r.val) - X(0));
    svgEl("rect", { x: x0, y: y - 11, width: Math.max(bw2, 2), height: 22, fill: r.col, rx: 1.5 }, svg);
    const midLine = (r.lines.length - 1) / 2;
    r.lines.forEach((ln, j) =>
      axisText(svg, mL - 10, y - (midLine - j) * 11 + 3, ln, { anchor: "end", size: 9.5 }));
    axisText(svg, X(Math.max(r.val, 0)) + 6, y + 4, (r.val >= 0 ? "+" : "") + r.val + " M", { size: 10.5, col: "#1c1c24" });
  });
  svgEl("line", { x1: X(0), x2: X(0), y1: 8, y2: h - 26, stroke: "#9aa0a8", "stroke-width": 1 }, svg);
  axisText(svg, (mL + w - mR) / 2, h - 6, "contribution to the global change, million people", { anchor: "middle", size: 10 });
})();

// ---------------------------------------------------------------- tooltips --
const tip = document.getElementById("tip");
document.querySelectorAll(".qmark").forEach((q) => {
  q.addEventListener("mouseenter", (e) => {
    tip.textContent = q.dataset.tip;
    tip.classList.remove("hidden");
  });
  q.addEventListener("mousemove", (e) => {
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 340) + "px";
    tip.style.top = e.clientY + 16 + "px";
  });
  q.addEventListener("mouseleave", () => tip.classList.add("hidden"));
});

// ------------------------------------------------------------------ about --
function toggleAbout() { document.getElementById("about").classList.toggle("hidden"); }
document.getElementById("aboutBtn").addEventListener("click", toggleAbout);
