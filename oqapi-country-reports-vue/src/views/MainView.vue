<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import ReportFooter from '../components/ReportFooter.vue';
import MetricMap from '../components/MetricMap.vue';
import IndicatorGaugeCard from '../components/IndicatorGaugeCard.vue';
import AttributeCompletenessCard from '../components/AttributeCompletenessCard.vue';
import ohsomeLogo from '../assets/images/ohsome-quality-api_2000px.png';
import {
  fetchAvailableCountries,
  loadAvailableTopics,
  loadIndicators,
  loadIndicatorLookups,
  loadRegionIndicatorValues,
  getPMTilesBounds,
  loadTagDistribution,
  loadIndicatorFigure,
  loadLatestTimestamp,
  checkParquetExists,
  type PMTilesBounds
} from '../services/dataService';
import { clearParquetCache } from '../utils/duckdb';
import {
  prettifyTopic,
  prettifyIndicator,
  topicConfig,
  buildUrls,
  getTagGroupingKey,
  getCountryLayers,
  setCurrentSchoolSubTopic
} from '../utils/helpers';

import Plotly from 'plotly.js-dist-min';

const selectedCountry = ref('');
const isEmbed = ref(false);

onMounted(async () => {
  // Detect if we're embedded in an iframe or HDX window. The old
  // ?iframe-2col param predates this layout (it used to switch to a
  // dedicated 2-column template) - now it's just another way to ask for the
  // same compact embed styling as ?embed.
  const inIframe = window.self !== window.top;
  const hasEmbedParam = new URLSearchParams(window.location.search).has('embed');
  const hasIframe2ColParam = new URLSearchParams(window.location.search).has('iframe-2col');

  if ((hasEmbedParam || hasIframe2ColParam) && !inIframe) {
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', newUrl);
    isEmbed.value = false;
  } else {
    isEmbed.value = inIframe || hasEmbedParam || hasIframe2ColParam;
  }

  // Apply embed mode class to body for global styling
  if (isEmbed.value) {
    document.body.classList.add('embed-mode');

    // Notify parent window of content height changes (for iframe embedding)
    const notifyParentResize = () => {
      if (window.parent !== window) {
        const height = document.documentElement.scrollHeight;
        window.parent.postMessage({ type: 'resize', height }, '*');
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      notifyParentResize();
    });
    resizeObserver.observe(document.documentElement);

    setTimeout(notifyParentResize, 1000);
  }

  // Checks each country listed in config/countries.ts directly against S3
  // (see fetchAvailableCountries()) rather than listing the bucket, so this
  // doesn't depend on the ListBucket permission that's currently blocked by
  // a bucket-policy issue - see MAINTAINER_GUIDE.html. Add a country's code
  // to that list once its data is actually uploaded and it shows up here.
  const fetchedCountries = await fetchAvailableCountries();
  countries.value = fetchedCountries.map(c => ({ value: c.code, label: c.name }));

  if (countries.value.length > 0) {
    const preferredDefault = 'DEU';
    selectedCountry.value = countries.value.find(c => c.value === preferredDefault)?.value || countries.value[0].value;
  }

  handleHashRouting();
  window.addEventListener('hashchange', handleHashRouting);

  // Setup ResizeObserver for maps and containers
  setTimeout(() => {
    const resizeObserver = new ResizeObserver(() => {
      // Trigger map resize
      window.dispatchEvent(new Event('resize'));

      // Also trigger Plotly resize. Both the treemap and the regular plot
      // container stay mounted at all times now (v-show, not v-if) so their
      // loader always has a DOM target - but that means the inactive one is
      // sitting there display:none, and Plotly throws ("Resize must be
      // passed a displayed plot div element") if asked to resize a hidden
      // one. offsetParent is null exactly for display:none elements (this
      // plain-flow layout has no fixed-position edge case to worry about).
      document.querySelectorAll(
        '[id^="tag-treemap"], [id^="active-indicator-plot"]'
      ).forEach(el => {
        if ((el as HTMLElement).offsetParent !== null) Plotly.Plots.resize(el as HTMLElement);
      });
    });

    // Observe map containers
    document.querySelectorAll(
      '[id^="tag-treemap"], [id^="main_map_"]'
    ).forEach(el => {
      if (el) resizeObserver.observe(el);
    });

    // Observe main container for embed mode
    const mainContainer = document.querySelector('.page-content');
    if (mainContainer) resizeObserver.observe(mainContainer);
  }, 1000);
});

const countries = ref<{ value: string; label: string }[]>([]);
const isLoading = ref(false);
const dataDate = ref('');

const pmtilesUrl = ref('');
const parquetUrl = ref('');

const bounds = ref<PMTilesBounds | null>(null);

const currentLayers = computed(() => getCountryLayers(selectedCountry.value));
const selectedCountryLabel = computed(() => countries.value.find(c => c.value === selectedCountry.value)?.label || 'country');

// null = not checked yet for this country (show every layer optimistically,
// same as before this existed); once loadCountry resolves it, only layers
// whose parquet file actually exists stay selectable - some grid layers
// (e.g. Germany's h3) haven't been processed for every country yet, and
// picking one that doesn't exist just renders a flat, unexplained gray map.
const availableLayers = ref<Set<string> | null>(null);

function isLayerAvailable(layer?: string): boolean {
  if (!layer) return false;
  return availableLayers.value === null || availableLayers.value.has(layer);
}

// A handful of indicators (e.g. user-activity) are raw counts, not 0-1
// quality ratios - the API marks these with this exact phrase in their
// description, regardless of topic. That's the general, data-driven signal
// to use (checking indicator name alone would miss any future one, and
// quality_class being null isn't reliable either - roads-thematic-accuracy
// has no quality_class either despite being a genuine percentage).
const NO_QUALITY_MARKER = 'No quality estimation will be calculated';
function isNoQualityDescription(description: string): boolean {
  return description.includes(NO_QUALITY_MARKER);
}

// Reference-dataset comparison indicators (roads-thematic-accuracy,
// building-comparison, land-cover-thematic-accuracy) only have a match
// reference for a handful of countries (currently just Germany) - for
// every other country the pipeline still writes a placeholder row (value 0)
// carrying this exact marker instead of skipping the row outright. Filter
// those out rather than showing a permanently-0% card for an indicator
// that was never actually computed for this country.
const UNAVAILABLE_MARKER = 'skipped: indicator not available for this country';
function isUnavailableDescription(description: string): boolean {
  return description.includes(UNAVAILABLE_MARKER);
}

// roads-thematic-accuracy and land-cover-thematic-accuracy both store a
// genuine 0-1 match/agreement ratio (not a raw count - unlike the
// indicators isNoQualityDescription() catches), so they're deliberately
// excluded from that data-driven check. But a match rate against a
// reference dataset isn't a "good/bad" quality verdict either, so by
// product decision they're forced into the same non-quality/count-badge
// treatment as user-activity anyway - just with their percentage kept as
// the displayed value instead of being (wrongly) rounded to a bare "1".
const FORCE_NON_QUALITY_INDICATORS = new Set(['roads-thematic-accuracy', 'land-cover-thematic-accuracy']);

interface IndicatorCard {
  indicator: string;
  title: string;
  displayValue: string;
  ringPct: number;
  level: 'good' | 'warn' | 'bad' | 'neutral';
  isCount: boolean;
  description: string;
}
interface AttributeOption {
  indicator: string;
  label: string;
  displayValue: string;
  ringPct: number;
  level: 'good' | 'warn' | 'bad';
  description: string;
}

function levelFromAvg(avg: number): 'good' | 'warn' | 'bad' {
  return avg >= 0.75 ? 'good' : avg >= 0.25 ? 'warn' : 'bad';
}

// Tag distribution isn't a real ohsome-quality-api indicator - it comes from
// a separate parquet/query (loadPanelTreemap), not the per-indicator lookup/
// plot pipeline below. The sidebar treats it as just another selectable
// "quality indicator" anyway: picking it has no per-region value to color
// the map with (so the map falls back to plain grey), and swaps the plot box
// for the treemap instead of a Plotly line/bar chart.
const TAG_DISTRIBUTION_KEY = 'tag-distribution';

interface ViewPanel {
  id: string;
  selectedTopic: string;
  topicId: number;
  indicators: string[];
  mapLayer: string;
  activeIndicatorKey: string;
  indicatorCards: IndicatorCard[];
  attributeOptions: AttributeOption[];
  selectedAttributeIndicator: string;
  mapLookup: Record<string, number>;
  activePlotAvailable: boolean;
  featureCount: string;
  totalLength: string;
  tile1Label: string;
  schoolSwitchVisible: boolean;
  schoolSubTopic: string;
  // Which polygon on the map is click-selected, if any - drives the plot
  // below to that one region instead of the whole-country aggregate.
  // Belongs to the current (topic, mapLayer) id-space, so it gets cleared
  // whenever either of those changes.
  selectedGeomId: string | null;
}

function createPanel(id: string, topic: string, layer: string): ViewPanel {
  return {
    id, selectedTopic: topic, topicId: 0,
    indicators: [], mapLayer: layer, activeIndicatorKey: 'currentness',
    indicatorCards: [], attributeOptions: [], selectedAttributeIndicator: '',
    mapLookup: {}, activePlotAvailable: true,
    featureCount: '', totalLength: '', tile1Label: '',
    schoolSwitchVisible: false, schoolSubTopic: 'operator',
    selectedGeomId: null
  };
}

// One dashboard view (there's no more Split View) - kept as a one-element
// array rather than a lone object so the per-panel functions below
// (loadIndicatorCards, handleRegionClick, etc.) didn't all need their
// panelIdx parameter ripped out for this redesign.
const panels = ref<ViewPanel[]>([createPanel('a', '', 'h3')]);
const mainPanel = computed(() => panels.value[0]);
const availableTopicsForCountry = ref<string[]>([]);

function getMapLookupRange(panel: ViewPanel): { min: number; max: number } | null {
  const values = Object.values(panel.mapLookup);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function getActiveCard(panel: ViewPanel): IndicatorCard | null {
  if (panel.activeIndicatorKey === TAG_DISTRIBUTION_KEY) {
    return {
      indicator: TAG_DISTRIBUTION_KEY,
      title: 'Tag Distribution',
      displayValue: panel.featureCount || '—',
      ringPct: 0,
      level: 'neutral',
      isCount: true,
      description: 'Distribution of mapped features grouped by tag. The map shows no per-region values for this.'
    };
  }

  const fromRegular = panel.indicatorCards.find(c => c.indicator === panel.activeIndicatorKey);
  if (fromRegular) return fromRegular;

  const fromAttr = panel.attributeOptions.find(o => o.indicator === panel.activeIndicatorKey);
  if (fromAttr) {
    return {
      indicator: fromAttr.indicator,
      title: `Attribute Completeness: ${fromAttr.label}`,
      displayValue: fromAttr.displayValue,
      ringPct: fromAttr.ringPct,
      level: fromAttr.level,
      isCount: false,
      description: fromAttr.description
    };
  }
  return null;
}

function isAttributeGroupActive(panel: ViewPanel): boolean {
  return panel.attributeOptions.some(o => o.indicator === panel.activeIndicatorKey);
}

// Forced non-quality indicators (see FORCE_NON_QUALITY_INDICATORS) keep a
// genuine 0-1 ratio underneath their count-badge treatment - the map's
// hover popup and legend caps need to know this too, so they read as "95%"
// rather than a bare "0.95".
function showsForcedPercent(panel: ViewPanel): boolean {
  return FORCE_NON_QUALITY_INDICATORS.has(getActiveCard(panel)?.indicator || '');
}

function getLegendCapText(panel: ViewPanel, which: 'min' | 'max'): string {
  // Matches the map's own fixedColorRange (see MetricMap usage below) - the
  // legend has to show the same 0%/100% scale the fill color is actually
  // computed against, not this view's own current min/max.
  if (showsForcedPercent(panel)) return which === 'max' ? '100%' : '0%';
  const range = getMapLookupRange(panel);
  if (!range) return which === 'max' ? 'High' : 'Low';
  return range[which].toLocaleString('en-US');
}

// Cards stay alphabetically sorted by title - "Attribute Completeness" sorts
// in wherever its name puts it (typically near the top), not always last.
// Tag distribution is pinned last rather than sorted in alphabetically,
// since it isn't a regular quality indicator - it always reads as "one
// more, different kind of thing" rather than blending into the list.
type StackItem =
  | { type: 'indicator'; card: IndicatorCard }
  | { type: 'attribute-group' }
  | { type: 'tag-distribution' };

function getIndicatorStackItems(panel: ViewPanel): StackItem[] {
  // Count-style indicators (raw counts like user-activity, or a
  // thematic-accuracy indicator forced into that same treatment - see
  // FORCE_NON_QUALITY_INDICATORS) sort after every percentage/ring
  // indicator, not wherever their own title happens to fall alphabetically.
  // Without this, land-cover-thematic-accuracy (title starting with "L")
  // sorted ABOVE Mapping Saturation ("M"), unlike roads-thematic-accuracy
  // ("R"), which happened to sort below it - the same non-quality role
  // read inconsistently depending on topic. (A "sorts after" marker
  // character prepended to the title doesn't work here: localeCompare's
  // default collation treats punctuation as sorting before letters, not
  // after - confirmed '~'.localeCompare('L') === -1 - so this needs an
  // explicit rank, compared before the title, not folded into one string.)
  const entries: { rank: number; title: string; item: StackItem }[] = panel.indicatorCards.map(card => ({
    rank: card.isCount ? 1 : 0,
    title: card.title,
    item: { type: 'indicator', card }
  }));
  if (panel.attributeOptions.length > 0) {
    entries.push({ rank: 0, title: 'Attribute Completeness', item: { type: 'attribute-group' } });
  }
  entries.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title));
  const items = entries.map(e => e.item);

  if (getTagGroupingKey(panel.selectedTopic)) {
    items.push({ type: 'tag-distribution' });
  }
  return items;
}

function stackItemKey(item: StackItem): string {
  return item.type === 'indicator' ? item.card.indicator : item.type;
}

// The hero band reflects whichever indicator is currently active. With no
// region selected, it shows the exact same country-level figure the
// indicator card itself does (card.ringPct) - not a plain average of the
// current layer's per-district values, which used to be this function's
// fallback. That average is a genuinely different statistic from the
// country-level one (most quality metrics aren't "the mean of each
// district's own percentage" - they're computed from country-wide totals),
// and for at least mapping-saturation it can individually exceed 100% per
// district, which pulled the naive mean above 100% too: the hero band could
// read "101%" while the indicator card, two inches away, read "99%" for the
// literal same indicator. With a region selected, that region's own value
// (already sitting in mapLookup - the same per-region data coloring the
// map) is used instead, which is a real per-district figure, not an average.
function getHeroBandDisplayValue(panel: ViewPanel): number {
  if (panel.selectedGeomId && panel.mapLookup[panel.selectedGeomId] != null) {
    return panel.mapLookup[panel.selectedGeomId];
  }
  const card = getActiveCard(panel);
  return card ? card.ringPct / 100 : 0;
}
function getHeroBandLevel(panel: ViewPanel): 'good' | 'warn' | 'bad' | 'neutral' {
  const card = getActiveCard(panel);
  return card?.isCount ? 'neutral' : levelFromAvg(getHeroBandDisplayValue(panel));
}
function getHeroBandLevelLabel(panel: ViewPanel): string {
  const card = getActiveCard(panel);
  if (card?.isCount) return '';
  const l = getHeroBandLevel(panel);
  return l === 'good' ? 'High' : l === 'warn' ? 'Medium' : 'Low';
}
// Count indicators (e.g. user-activity, tag distribution) show
// activeCard.displayValue, which is already region-aware - no separate
// lookup needed here.
function getHeroBandValueText(panel: ViewPanel): string {
  const card = getActiveCard(panel);
  return card?.isCount ? card.displayValue : `${Math.round(getHeroBandDisplayValue(panel) * 100)}%`;
}

function handleHashRouting() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/');
  const hCountry = parts[0];
  const hTopic = parts[1];

  if (hCountry && countries.value.some(c => c.value === hCountry)) {
    selectedCountry.value = hCountry;
  }
  if (hTopic && availableTopicsForCountry.value.includes(hTopic)) {
    handlePanelTopicChange(0, hTopic);
  }
}

function updateHash(country: string, topic: string) {
  if (!country || !topic) return;
  const newHash = `#/${country}/${topic}`;
  if (window.location.hash !== newHash) {
    window.history.pushState(null, '', newHash);
  }
}

watch(selectedCountry, async (newCountry) => {
  if (!newCountry) return;
  // A new country means the previous country's cached parquet files are no
  // longer relevant - clear here, once, rather than inside loadCountry()
  // itself (which also runs on a plain topic switch within the same
  // country, where the cache is still valid and clearing it just forces
  // pointless re-fetches of files already in hand).
  clearParquetCache();
  await loadCountry(newCountry, true);
});

async function loadCountry(code: string, updateTopics: boolean) {
  isLoading.value = true;

  const layers = getCountryLayers(code);
  const urls = buildUrls(code, layers.countryLevel);
  pmtilesUrl.value = urls.pmtilesUrl;
  parquetUrl.value = urls.parquetUrl;

  try {
    // The data's own latest timestamp, the pmtiles bounds, and which grid
    // layers actually have data are all independent network calls - run
    // them together instead of one after the other.
    const layerCandidates = [...new Set(
      [layers.countryLevel, layers.stateLevel, layers.detailLevel, layers.h3Level].filter(Boolean) as string[]
    )];

    const [latestTimestamp, pmtilesBounds, layerChecks] = await Promise.all([
      loadLatestTimestamp(urls.tagDistributionUrl),
      getPMTilesBounds(urls.pmtilesUrl),
      Promise.all(layerCandidates.map(async (layer) => {
        const exists = await checkParquetExists(buildUrls(code, layer).parquetUrl);
        return exists ? layer : null;
      }))
    ]);

    const newAvailableLayers = new Set(layerChecks.filter((l): l is string => l !== null));
    availableLayers.value = newAvailableLayers;

    let defaultLayer = layers.h3Level;
    if (updateTopics) {
      // Prefer the most granular layer that's actually available, rather
      // than always defaulting to h3 regardless of whether it exists.
      const preferredOrder = [layers.h3Level, layers.detailLevel, layers.stateLevel, layers.countryLevel]
        .filter(Boolean) as string[];
      defaultLayer = preferredOrder.find(l => newAvailableLayers.has(l)) || layers.h3Level;
    }

    // The parquet's own timestamp (when the pipeline actually computed this
    // country's data), not the object storage's Last-Modified header (which
    // only reflects when the file was last uploaded/copied).
    dataDate.value = latestTimestamp
      ? new Date(latestTimestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '';

    bounds.value = pmtilesBounds;
    if (!bounds.value) {
      isLoading.value = false;
      return;
    }

    if (updateTopics) {
      // New country - reset to a fresh default topic.
      const availableTopics = await loadAvailableTopics(urls.parquetUrl);
      availableTopicsForCountry.value = availableTopics;
      const firstTopic = availableTopics.includes('roads') ? 'roads' : (availableTopics[0] || '');
      panels.value = [createPanel('a', firstTopic, defaultLayer)];
    }

    await loadPanelTopicData(0);
    updateHash(code, panels.value[0]?.selectedTopic || '');
  } catch (e) {
    console.error('Failed to load country:', e);
  } finally {
    isLoading.value = false;
  }
}

// A selected region reads its own value+description straight off its grid
// layer's file instead of the country-level average - same idea as the plot
// and treemap, just for the values behind the cards/bars. Every indicator
// available for the topic gets its own card - some topics have up to 7, and
// attribute-completeness_* variants are grouped into one dropdown card
// instead of one each, since a topic can have 4+ of them.
async function loadIndicatorCards(panelIdx: number, topicName: string) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  if (!parquetUrl.value || panel.indicators.length === 0 || !selectedCountry.value) {
    panel.indicatorCards = [];
    panel.attributeOptions = [];
    panel.selectedAttributeIndicator = '';
    return;
  }

  const allIndicators = panel.indicators;

  let getValue: (indicator: string, i: number) => { avg: number; description: string };
  if (panel.selectedGeomId) {
    const regionUrl = buildUrls(selectedCountry.value, panel.mapLayer).parquetUrl;
    const regionValues = await loadRegionIndicatorValues(regionUrl, topicName, panel.selectedGeomId, allIndicators);
    getValue = (indicator) => ({ avg: regionValues[indicator]?.value ?? 0, description: regionValues[indicator]?.description || '' });
  } else {
    const results = await loadIndicatorLookups(parquetUrl.value, topicName, allIndicators);
    getValue = (_, i) => ({ avg: results[i]?.avg ?? 0, description: results[i]?.description || '' });
  }

  const regularCards: IndicatorCard[] = [];
  const attrOptions: AttributeOption[] = [];

  allIndicators.forEach((indicator, i) => {
    const { avg, description } = getValue(indicator, i);
    if (isUnavailableDescription(description)) return;

    const isRawCount = isNoQualityDescription(description);
    const isCount = isRawCount || FORCE_NON_QUALITY_INDICATORS.has(indicator);

    if (indicator.startsWith('attribute-completeness_')) {
      attrOptions.push({
        indicator,
        label: prettifyIndicator(indicator.replace('attribute-completeness_', '')),
        displayValue: `${Math.round(avg * 100)}%`,
        ringPct: Math.round(avg * 100),
        level: levelFromAvg(avg),
        description
      });
    } else {
      regularCards.push({
        indicator,
        title: prettifyIndicator(indicator),
        // isRawCount (not isCount) here: roads-thematic-accuracy is forced
        // into the non-quality/count-badge treatment below, but its own
        // value is still a real 0-1 ratio, not a raw count - rounding that
        // to a bare integer would (wrongly) show "1" instead of "95%".
        displayValue: isRawCount ? Math.round(avg).toLocaleString('en-US') : `${Math.round(avg * 100)}%`,
        ringPct: isRawCount ? 0 : Math.round(avg * 100),
        level: isCount ? 'neutral' : levelFromAvg(avg),
        isCount,
        description
      });
    }
  });

  panel.indicatorCards = regularCards;
  panel.attributeOptions = attrOptions;

  if (attrOptions.length > 0) {
    const preferred = topicConfig[topicName]?.completenessIndicator;
    const stillValid = attrOptions.some(o => o.indicator === panel.selectedAttributeIndicator);
    if (!stillValid) {
      panel.selectedAttributeIndicator = (preferred && attrOptions.some(o => o.indicator === preferred))
        ? preferred
        : attrOptions[0].indicator;
    }
  } else {
    panel.selectedAttributeIndicator = '';
  }

  const selectableKeys = [...regularCards.map(c => c.indicator), ...attrOptions.map(o => o.indicator)];
  if (!selectableKeys.includes(panel.activeIndicatorKey) && panel.activeIndicatorKey !== TAG_DISTRIBUTION_KEY) {
    panel.activeIndicatorKey = selectableKeys.includes('currentness') ? 'currentness' : (selectableKeys[0] || 'currentness');
  }
}

async function loadActiveMapLookup(panelIdx: number, topicName: string) {
  const panel = panels.value[panelIdx];
  const card = panel && getActiveCard(panel);
  if (!panel || !card || !selectedCountry.value) return;

  // Tag distribution has no per-region value to color the map with - an
  // empty lookup makes every feature fall back to MetricMap's default grey
  // (see buildFillColorExpression), same as "not loaded yet".
  if (card.indicator === TAG_DISTRIBUTION_KEY) {
    panel.mapLookup = {};
    return;
  }

  const urls = buildUrls(selectedCountry.value, panel.mapLayer);
  const [result] = await loadIndicatorLookups(urls.parquetUrl, topicName, [card.indicator]);
  if (!result) return;
  panel.mapLookup = result.lookup;
}

// Same margin/automargin/legend/multi-axis handling as the pipeline's other
// figures (see git history for how those were worked out), tied to whichever
// indicator is currently active.
async function loadActiveIndicatorPlot(panelIdx: number) {
  const panel = panels.value[panelIdx];
  const card = panel && getActiveCard(panel);
  if (!panel || !card) return;

  // The treemap (rendered by loadPanelTreemap, independent of which
  // indicator is active) fills the plot box instead when tag distribution
  // is selected - nothing to load here.
  if (card.indicator === TAG_DISTRIBUTION_KEY) {
    panel.activePlotAvailable = false;
    return;
  }

  const plotId = `active-indicator-plot-${panel.id}`;
  if (!parquetUrl.value || !selectedCountry.value) return;

  // A selected region's figure lives in its own grid layer's file (the
  // country-level file this component otherwise uses only ever has the one
  // whole-country row), keyed by the same geomID the map colors it with.
  const plotUrl = panel.selectedGeomId
    ? buildUrls(selectedCountry.value, panel.mapLayer).parquetUrl
    : parquetUrl.value;

  try {
    const fig = await loadIndicatorFigure(plotUrl, panel.selectedTopic, card.indicator, panel.selectedGeomId);
    if (!fig) {
      Plotly.purge(plotId);
      panel.activePlotAvailable = false;
      return;
    }
    panel.activePlotAvailable = true;

    fig.layout = fig.layout || {};
    delete fig.layout.width;
    delete fig.layout.height;
    // The pipeline's own figures already carry their indicator's name as an
    // embedded title (some, like user-activity, set a much larger font than
    // others do) - this .plotpanel already shows that same name in the <h3>
    // above, so the embedded one is both redundant and, for whichever
    // indicator sets the larger font, too tall for this fixed-height box's
    // top margin to fit without clipping. Drop it instead of trying to
    // reserve enough margin for whatever font size any given figure happens
    // to use.
    fig.layout.title = undefined;
    fig.layout.paper_bgcolor = 'rgba(0,0,0,0)';
    fig.layout.plot_bgcolor = 'rgba(0,0,0,0)';
    fig.layout.margin = { t: 25, r: 10, l: 10, b: 10 };

    const axisKeys = Object.keys(fig.layout).filter((key) => /^[xy]axis\d*$/.test(key));
    axisKeys.forEach((key) => {
      fig.layout[key] = { ...fig.layout[key], automargin: true };
    });
    fig.layout.showlegend = false;

    const isMultiAxis =
      axisKeys.filter((k) => k.startsWith('x')).length > 1 ||
      axisKeys.filter((k) => k.startsWith('y')).length > 1;
    if (isMultiAxis) {
      axisKeys.forEach((key) => { fig.layout[key] = { ...fig.layout[key], title: '' }; });
      fig.layout.margin = { ...fig.layout.margin, b: 90 };
      axisKeys.filter((k) => k.startsWith('x')).forEach((key) => {
        fig.layout[key] = { ...fig.layout[key], tickangle: -45, tickfont: { size: 9 } };
      });
    }
    fig.layout.font = { family: 'Lato, sans-serif', size: 11 };

    await Plotly.react(plotId, fig.data, fig.layout, {
      responsive: true,
      displayModeBar: false
    });
    // Plotly sometimes measures the container mid-layout (e.g. right after
    // this box was v-show'd visible, or before the sidebar/flex columns
    // have settled their final widths) and locks its SVG to that narrower
    // snapshot - responsive:true only reacts to a later resize *event*, it
    // doesn't re-check on its own. Forcing one resize against the
    // now-settled DOM after every render is what actually fixes the
    // "chart only fills half the box" symptom, not just the box's own CSS.
    await nextTick();
    Plotly.Plots.resize(plotId);
  } catch (e) {
    console.error('Failed to load active indicator plot:', e);
    panel.activePlotAvailable = false;
  }
}

async function refreshActiveIndicator(panelIdx: number, topicName: string) {
  await Promise.all([loadActiveMapLookup(panelIdx, topicName), loadActiveIndicatorPlot(panelIdx)]);
}

function selectIndicatorCard(panelIdx: number, indicator: string) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  panel.activeIndicatorKey = indicator;
  refreshActiveIndicator(panelIdx, panel.selectedTopic);
}

function selectAttributeOption(panelIdx: number, indicator: string) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  panel.selectedAttributeIndicator = indicator;
  selectIndicatorCard(panelIdx, indicator);
}

async function handleMapLayerChange(panelIdx: number, layer: string) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  panel.mapLayer = layer;
  // A selected region's id belongs to the old layer's id-space (Kreise ids
  // aren't Bundesländer ids) - drop the selection rather than carry over a
  // now-meaningless geomID. Cards/treemap only ever changed with topic
  // before this feature, but now they can be showing a just-cleared
  // region's data too, so they need refreshing here as well.
  panel.selectedGeomId = null;
  await Promise.all([
    loadActiveMapLookup(panelIdx, panel.selectedTopic),
    loadActiveIndicatorPlot(panelIdx),
    loadIndicatorCards(panelIdx, panel.selectedTopic),
    loadPanelTreemap(panelIdx)
  ]);
}

// Clicking a polygon switches every data-driven box (hero band, indicator
// cards, plot, tag-distribution treemap) from the whole country to that one
// region; clicking it again, or clicking empty map area, goes back
// (MetricMap already turns "clicked the selected region again" into a null
// geomId itself). The map coloring itself (mapLookup) doesn't need
// reloading - it's already the full per-region lookup for the active
// indicator, this just reads one entry out of it.
function handleRegionClick(panelIdx: number, geomId: string | null) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  panel.selectedGeomId = geomId;
  loadIndicatorCards(panelIdx, panel.selectedTopic);
  loadActiveIndicatorPlot(panelIdx);
  loadPanelTreemap(panelIdx);
}

// The tag-distribution "count" total is scoped to one grouping tag
// (e.g. schools' "operator:type" or "isced:level") - fine when that tag is
// the topic's own defining tag (roads/"highway", buildings/"building",
// land-cover/"landuse": always present on every matching feature, so the
// sum is already a complete total), but badly wrong when it's an optional
// secondary tag (schools/hospitals): confirmed on real data that grouping
// by either of hospitals' two tags captures only 16-25% of the true total.
// mapping-saturation's cumulative "OSM data" curve isn't scoped to any tag
// at all, so it gives the real total when it happens to track a plain
// count (its y-axis is labeled "Count" - for roads/land-cover it tracks
// length/area instead, so this falls back to the tag-distribution sum,
// which is already complete for those single-defining-tag topics anyway).
async function loadTrueFeatureCount(topicName: string): Promise<number | null> {
  if (!parquetUrl.value) return null;
  try {
    const fig = await loadIndicatorFigure(parquetUrl.value, topicName, 'mapping-saturation');
    if (!fig?.data) return null;

    const yaxisTitle = fig.layout?.yaxis?.title?.text ?? fig.layout?.yaxis?.title ?? '';
    if (String(yaxisTitle).toLowerCase() !== 'count') return null;

    const osmTrace = fig.data.find((t: any) => t.name === 'OSM data') || fig.data[0];
    const y = osmTrace?.y;
    if (!Array.isArray(y) || y.length === 0) return null;

    const lastValue = y[y.length - 1];
    return typeof lastValue === 'number' ? lastValue : null;
  } catch {
    return null;
  }
}

async function loadPanelTreemap(panelIdx: number) {
  const panel = panels.value[panelIdx];
  if (!panel || !selectedCountry.value) return;

  const topicName = panel.selectedTopic;
  const groupingKey = getTagGroupingKey(topicName);
  if (!groupingKey) return;

  const geomId = panel.selectedGeomId;
  const urls = geomId
    ? buildUrls(selectedCountry.value, panel.mapLayer)
    : buildUrls(selectedCountry.value, currentLayers.value.countryLevel);
  const treemapId = `tag-treemap-${panel.id}`;

  try {
    // loadTrueFeatureCount reads the country-level mapping-saturation
    // figure, which has no region breakdown - a selected region falls back
    // to the treemap's own per-region count sum below instead (same
    // fallback the country-level view already uses when this comes back
    // null).
    const [byMeasure, trueFeatureCount] = await Promise.all([
      loadTagDistribution(urls.tagDistributionUrl, topicName, groupingKey, geomId),
      geomId ? Promise.resolve(null) : loadTrueFeatureCount(topicName)
    ]);

    const mainMeasure = byMeasure['area'] || byMeasure['length'] || byMeasure['count'];
    if (!mainMeasure?.treemap) return;

    const fig = mainMeasure.treemap;
    fig.layout = fig.layout || {};
    fig.layout.margin = { t: 40, r: 10, l: 10, b: 10 };
    fig.layout.paper_bgcolor = 'rgba(0,0,0,0)';
    fig.layout.plot_bgcolor = 'rgba(0,0,0,0)';
    fig.layout.font = { family: 'Lato, sans-serif', size: 11 };

    await Plotly.react(treemapId, fig.data, fig.layout, {
      responsive: true,
      displayModeBar: false
    });
    // See the matching comment in loadActiveIndicatorPlot() - forces Plotly
    // to re-measure the now-settled container instead of trusting whatever
    // size it happened to catch mid-layout.
    await nextTick();
    Plotly.Plots.resize(treemapId);

    const countMeasure = byMeasure['count'];
    const featureTotal = trueFeatureCount ?? countMeasure?.sumValue;
    panel.featureCount = featureTotal != null ? Number(featureTotal).toLocaleString('en-US') : '';

    const topicSimple = topicName.toLowerCase().includes('road')
      ? 'roads'
      : topicName.toLowerCase().includes('building')
        ? 'buildings'
        : prettifyTopic(topicName);

    if (byMeasure['area']?.sumValue != null) {
      panel.totalLength = (byMeasure['area'].sumValue / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 });
      panel.tile1Label = `km² of ${topicSimple}`;
    } else if (byMeasure['length']?.sumValue != null) {
      panel.totalLength = (byMeasure['length'].sumValue / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 });
      panel.tile1Label = `km of ${topicSimple}`;
    } else {
      panel.totalLength = '';
      panel.tile1Label = '';
    }
  } catch (e) {
    console.error('Failed to load treemap:', e);
  }
}

// The full per-topic pipeline: indicators, then the indicator cards derived
// from them, then whichever indicator is currently active (map + plot), then
// the treemap. Runs whenever the topic changes, or once when the country
// (re)loads.
async function loadPanelTopicData(panelIdx: number) {
  const panel = panels.value[panelIdx];
  if (!panel || !panel.selectedTopic || !parquetUrl.value) return;

  const topicName = panel.selectedTopic;
  const newIndicators = await loadIndicators(parquetUrl.value, topicName);
  panel.indicators = newIndicators;

  await loadIndicatorCards(panelIdx, topicName);
  await refreshActiveIndicator(panelIdx, topicName);
  await loadPanelTreemap(panelIdx);

  const t = topicName.toLowerCase();
  panel.schoolSwitchVisible = t.startsWith('school') || t.startsWith('hospital') || t.startsWith('healthcare-primary');
}

async function handlePanelTopicChange(panelIdx: number, newTopic: string) {
  const panel = panels.value[panelIdx];
  if (!panel || panel.selectedTopic === newTopic) return;
  panel.selectedTopic = newTopic;
  panel.topicId++;
  panel.selectedGeomId = null;
  await loadPanelTopicData(panelIdx);
}

function handlePanelSchoolSwitch(panelIdx: number, subTopic: string) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  panel.schoolSubTopic = subTopic;
  setCurrentSchoolSubTopic(subTopic);
  loadPanelTreemap(panelIdx);
}

onUnmounted(() => {
  window.removeEventListener('hashchange', handleHashRouting);
});
</script>

<template>
  <div :class="['h-full w-full overflow-hidden flex flex-col relative bg-[#F3F3F3] p-2 gap-2', isEmbed ? 'embed-mode' : '']">
    <div class="page-content flexible">
      <div class="loading-overlay" v-if="isLoading">
        <div class="spinner"></div>
      </div>

      <div class="layout-columns">
        <aside class="sidebar">
          <div class="sidebar-brand">
            <img :src="ohsomeLogo" alt="ohsome quality api" class="sidebar-logo" />
            <strong>ohsome Country Quality Report</strong>
          </div>

          <div class="sidebar-section">
            <span class="sidebar-label">Select a Country</span>
            <select class="country-select" v-model="selectedCountry">
              <option value="" disabled>Loading countries…</option>
              <option v-for="country in countries" :key="country.value" :value="country.value">
                {{ country.label }}
              </option>
            </select>
          </div>

          <div class="sidebar-section">
            <span class="sidebar-label">Select a Layer</span>
            <div class="layer-switch">
              <button
                :class="{ active: mainPanel.mapLayer === currentLayers.countryLevel }"
                :disabled="!isLayerAvailable(currentLayers.countryLevel)"
                @click="handleMapLayerChange(0, currentLayers.countryLevel)"
              >{{ currentLayers.countryLevelLabel }}</button>
              <button
                v-if="currentLayers.stateLevel"
                :class="{ active: mainPanel.mapLayer === currentLayers.stateLevel }"
                :disabled="!isLayerAvailable(currentLayers.stateLevel)"
                @click="handleMapLayerChange(0, currentLayers.stateLevel!)"
              >{{ currentLayers.stateLevelLabel }}</button>
              <button
                :class="{ active: mainPanel.mapLayer === currentLayers.detailLevel }"
                :disabled="!isLayerAvailable(currentLayers.detailLevel)"
                @click="handleMapLayerChange(0, currentLayers.detailLevel)"
              >{{ currentLayers.detailLevelLabel }}</button>
              <button
                :class="{ active: mainPanel.mapLayer === currentLayers.h3Level }"
                :disabled="!isLayerAvailable(currentLayers.h3Level)"
                :title="!isLayerAvailable(currentLayers.h3Level) ? 'Not processed for this country yet' : ''"
                @click="handleMapLayerChange(0, currentLayers.h3Level)"
              >{{ currentLayers.h3LevelLabel }}</button>
            </div>
          </div>

          <div class="sidebar-section">
            <span class="sidebar-label">Select a Topic</span>
            <div class="topic-pills-row">
              <button
                v-for="t in availableTopicsForCountry"
                :key="t"
                class="pill"
                :class="{ active: t === mainPanel.selectedTopic }"
                @click="handlePanelTopicChange(0, t)"
              >{{ prettifyTopic(t) }}</button>
            </div>
          </div>

          <div class="sidebar-section sidebar-section--grow">
            <span class="sidebar-label">Select an Indicator</span>
            <div class="indicator-list">
              <template v-for="item in getIndicatorStackItems(mainPanel)" :key="stackItemKey(item)">
                <IndicatorGaugeCard
                  v-if="item.type === 'indicator'"
                  :title="item.card.title"
                  :displayValue="item.card.displayValue"
                  :ringPct="item.card.ringPct"
                  :level="item.card.level"
                  :active="item.card.indicator === mainPanel.activeIndicatorKey"
                  @click="selectIndicatorCard(0, item.card.indicator)"
                />
                <AttributeCompletenessCard
                  v-else-if="item.type === 'attribute-group'"
                  :options="mainPanel.attributeOptions"
                  :selected="mainPanel.selectedAttributeIndicator"
                  :active="isAttributeGroupActive(mainPanel)"
                  @select="(indicator: string) => selectAttributeOption(0, indicator)"
                />
                <IndicatorGaugeCard
                  v-else
                  title="Tag Distribution"
                  :displayValue="mainPanel.featureCount || '—'"
                  :ringPct="0"
                  level="neutral"
                  icon="tag"
                  :active="mainPanel.activeIndicatorKey === 'tag-distribution'"
                  @click="selectIndicatorCard(0, 'tag-distribution')"
                />
              </template>
            </div>
          </div>
        </aside>

        <div class="main-column">
          <section class="hero">
            <!-- Every box below switches to the clicked region's own data -
                 this banner is the one loud, unmissable place that says so. -->
            <div class="region-banner" v-if="mainPanel.selectedGeomId">
              <span class="region-banner-text">
                <strong>Selected region</strong> — every box below is scoped to this region, not all of {{ selectedCountryLabel }}
              </span>
              <button type="button" class="region-banner-back" @click="handleRegionClick(0, null)">
                ← Back to all of {{ selectedCountryLabel }}
              </button>
            </div>
            <div class="band" :data-level="getHeroBandLevel(mainPanel)">
              <span class="band-label">{{ getActiveCard(mainPanel)?.title || 'Quality' }}</span>
              <span class="band-value">{{ getHeroBandLevelLabel(mainPanel) }}<span class="band-pct">{{ getHeroBandValueText(mainPanel) }}</span></span>
            </div>
            <div class="readouts" :class="{ 'readouts--3col': !mainPanel.totalLength }">
              <div class="readout">
                <span class="readout-label">Features mapped</span>
                <span class="readout-value">{{ mainPanel.featureCount || '—' }}</span>
              </div>
              <div class="readout" v-if="mainPanel.totalLength">
                <span class="readout-label">{{ mainPanel.tile1Label }}</span>
                <span class="readout-value">{{ mainPanel.totalLength }}</span>
              </div>
              <div class="readout">
                <span class="readout-label">Data current as of</span>
                <span class="readout-value">{{ dataDate || '—' }}</span>
              </div>
              <div class="readout">
                <span class="readout-label">Granularity shown</span>
                <span class="readout-value">{{ mainPanel.mapLayer === currentLayers.countryLevel ? currentLayers.countryLevelLabel
                  : mainPanel.mapLayer === currentLayers.stateLevel ? currentLayers.stateLevelLabel
                  : mainPanel.mapLayer === currentLayers.detailLevel ? currentLayers.detailLevelLabel
                  : currentLayers.h3LevelLabel }}</span>
              </div>
            </div>
          </section>

          <section class="mappanel">
            <div class="map-stage">
              <MetricMap
                :key="'main-map-' + mainPanel.id"
                :containerId="'main_map_' + mainPanel.id"
                :pmtilesUrl="pmtilesUrl"
                :lookup="mainPanel.mapLookup"
                :indicatorName="getActiveCard(mainPanel)?.indicator || ''"
                :bounds="bounds"
                :layerName="mainPanel.mapLayer"
                :sourceName="'main_source_' + mainPanel.id"
                :topicId="mainPanel.topicId"
                :isCountIndicator="getActiveCard(mainPanel)?.isCount || false"
                :showAsPercent="showsForcedPercent(mainPanel)"
                :fixedColorRange="showsForcedPercent(mainPanel) ? [0, 1] : undefined"
                :selectedGeomId="mainPanel.selectedGeomId"
                @regionClick="handleRegionClick(0, $event)"
              />
              <template v-if="mainPanel.activeIndicatorKey !== 'tag-distribution'">
                <div class="map-legend" v-if="!getActiveCard(mainPanel)?.isCount">
                  <div><i style="background:#F44336;"></i>0&ndash;25%</div>
                  <div><i style="background:#FFEB3B;"></i>25&ndash;75%</div>
                  <div><i style="background:#4CAF50;"></i>75&ndash;100%</div>
                </div>
                <div class="map-legend map-legend--gradient" v-else>
                  <span class="legend-cap">{{ getLegendCapText(mainPanel, 'max') }}</span>
                  <div class="legend-gradient-bar"></div>
                  <span class="legend-cap">{{ getLegendCapText(mainPanel, 'min') }}</span>
                </div>
              </template>
            </div>
          </section>

          <section class="plotpanel">
            <div class="plotpanel-layout">
              <!-- Both branches stay mounted (v-show, not v-if/v-else): loadPanelTreemap()
                   runs on every topic/region change regardless of which indicator is
                   currently active, and needs 'tag-treemap-<id>' to always exist in the
                   DOM to render into - v-if here previously unmounted it whenever tag
                   distribution wasn't the active view, which threw ("No DOM element with
                   id 'tag-treemap-a' exists") and aborted before the featureCount/
                   totalLength/tile1Label assignments further down that function, which is
                   why the readouts above appeared stuck. -->
              <div class="plotpanel-main">
                <div v-show="mainPanel.activeIndicatorKey === 'tag-distribution'">
                  <div class="panel-head">
                    <h3>Tag Distribution</h3>
                    <span class="muted">grouped by <span class="mono">{{ getTagGroupingKey(mainPanel.selectedTopic) }}</span></span>
                  </div>
                  <div class="grouping-toggle" v-if="mainPanel.schoolSwitchVisible">
                    <button :class="{ active: mainPanel.schoolSubTopic === 'operator' }" @click="handlePanelSchoolSwitch(0, 'operator')">operator:type</button>
                    <button :class="{ active: mainPanel.schoolSubTopic === 'isced' }" @click="handlePanelSchoolSwitch(0, 'isced')">
                      {{ mainPanel.selectedTopic?.toLowerCase().startsWith('hospital') || mainPanel.selectedTopic?.toLowerCase().startsWith('healthcare') ? 'healthcare:speciality' : 'isced:level' }}
                    </button>
                  </div>
                  <div class="plot-container" :id="'tag-treemap-' + mainPanel.id"></div>
                </div>
                <div v-show="mainPanel.activeIndicatorKey !== 'tag-distribution'">
                  <h3>{{ getActiveCard(mainPanel) ? prettifyIndicator(getActiveCard(mainPanel)!.indicator) : '' }}</h3>
                  <p v-if="!mainPanel.activePlotAvailable" class="plot-unavailable">No chart available for this indicator.</p>
                  <div v-show="mainPanel.activePlotAvailable" class="plot-container" :id="'active-indicator-plot-' + mainPanel.id"></div>
                </div>
              </div>
              <div class="plotpanel-desc" v-if="getActiveCard(mainPanel)?.description">
                <span class="plotpanel-desc-label">About this indicator</span>
                <p>{{ getActiveCard(mainPanel)?.description }}</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <ReportFooter :parquetDate="dataDate" />
  </div>
</template>

<style scoped>
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.muted { color: var(--ink-faint); }

/* ==========================================================================
   Sidebar (country / layer / topic / quality indicator selection) + the
   main column (hero readouts, map, plot/treemap) it sits beside.
   ========================================================================== */
.layout-columns { display: flex; gap: 1.1rem; align-items: flex-start; }
@media (max-width: 900px) {
  .layout-columns { flex-direction: column; }
}

.sidebar {
  flex: 0 0 360px;
  display: flex; flex-direction: column; gap: 1.4rem;
  background: var(--paper-raised); border: 1px solid var(--line); box-shadow: var(--shadow);
  border-radius: var(--radius); padding: 1.3rem;
  align-self: flex-start;
}
@media (max-width: 900px) {
  .sidebar { flex: none; width: 100%; }
}

.sidebar-brand {
  display: flex; align-items: center; gap: 0.6rem;
  padding-bottom: 1.1rem; border-bottom: 1px solid var(--line);
}
.sidebar-brand img { height: 2.2rem; width: auto; display: block; flex: none; }
.sidebar-brand strong {
  font-family: var(--font-display); font-weight: 700; font-size: 0.98rem;
  letter-spacing: 0.01em; color: var(--ink); line-height: 1.2;
}

.country-select {
  font-family: var(--font-body); font-weight: 600; font-size: 0.9rem; color: var(--ink);
  border: 1px solid var(--line-strong); background: var(--paper-raised);
  padding: 0.5rem 0.65rem; border-radius: var(--radius); cursor: pointer; width: 100%;
}
.country-select:hover { border-color: var(--accent); }

.sidebar-section { display: flex; flex-direction: column; }
.sidebar-section--grow { flex: 1 1 auto; }
.sidebar-label {
  display: block; font-family: var(--font-body); font-size: 0.95rem; font-weight: 700;
  color: var(--ink); margin-bottom: 0.55rem;
}

.indicator-list { display: flex; flex-direction: column; gap: 0.8rem; }

.topic-pills-row { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.topic-pills-row .pill {
  font-family: var(--font-body); border: 1px solid var(--line-strong); background: var(--paper-raised);
  color: var(--ink-soft); font-size: 0.85rem; font-weight: 600; padding: 0.4rem 0.85rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s; border-radius: var(--radius);
}
.topic-pills-row .pill:hover { border-color: var(--accent); color: var(--ink); }
.topic-pills-row .pill.active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

.layer-switch { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.layer-switch button {
  border: 1px solid var(--line-strong); background: transparent; color: var(--ink-soft);
  font-family: var(--font-body); font-size: 0.76rem; font-weight: 600; padding: 0.35rem 0.65rem;
  border-radius: var(--radius);
}
.layer-switch button.active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.layer-switch button:disabled { color: var(--disabled); border-style: dashed; cursor: not-allowed; }

.main-column { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 1.1rem; }

.hero {
  display: flex; gap: 1.25rem; align-items: stretch; flex-wrap: wrap;
  padding: 0.9rem 0 1.1rem;
}
/* flex-basis:100% forces .band/.readouts onto their own line below this,
   inside the same flex-wrap row. */
.region-banner {
  flex: 1 1 100%; display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  background: var(--accent); border: 1px solid var(--accent); box-shadow: var(--shadow);
  padding: 0.65rem 1rem; border-radius: var(--radius);
}
.region-banner-text { color: var(--accent-ink); font-size: 0.88rem; }
.region-banner-text strong { color: var(--accent-ink); }
.region-banner-back {
  flex: none; background: var(--accent-ink); color: var(--accent); border: none;
  font-family: var(--font-body); font-weight: 700; font-size: 0.82rem;
  padding: 0.45rem 0.9rem; cursor: pointer; white-space: nowrap; border-radius: var(--radius);
}
.region-banner-back:hover { opacity: 0.85; }
.band {
  flex: 1 1 240px; display: flex; flex-direction: column; justify-content: center; gap: 0.35rem;
  padding: 1rem 1.3rem; background: var(--paper-raised); border: 1px solid var(--line);
  border-left: 4px solid var(--good);
  box-shadow: var(--shadow); border-radius: var(--radius);
}
.band[data-level="warn"] { border-left-color: var(--warn); }
.band[data-level="bad"] { border-left-color: var(--bad); }
.band[data-level="neutral"] { border-left-color: var(--line-strong); }
.band-label {
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--ink-faint); font-weight: 600;
}
.band-value { font-family: var(--font-display); font-weight: 700; font-size: 1.6rem; color: var(--ink); }
.band-pct {
  font-family: var(--font-mono); font-weight: 500; font-size: 1rem;
  color: var(--ink-soft); margin-left: 0.5rem;
}

.readouts {
  flex: 2 1 460px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
  background: var(--line); border: 1px solid var(--line); box-shadow: var(--shadow);
  border-radius: var(--radius); overflow: hidden;
}
.readouts--3col { grid-template-columns: repeat(3, 1fr); }
.readout {
  background: var(--paper-raised); padding: 0.85rem 1rem;
  display: flex; flex-direction: column; justify-content: center; gap: 0.3rem;
}
.readout-label {
  font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--ink-faint); font-weight: 600;
}
.readout-value { font-family: var(--font-mono); font-weight: 600; font-size: 1.05rem; color: var(--ink); }

.mappanel {
  background: var(--paper-raised); border: 1px solid var(--line); box-shadow: var(--shadow);
  overflow: hidden; border-radius: var(--radius);
  /* An explicit height, not just min-height: MetricMap's root div fills its
     container with height:100%, and a percentage height only resolves
     against an ancestor whose own height is definite - min-height alone
     leaves every ancestor "auto", so the chain collapses to 0 and MapLibre
     never gets a real canvas size. */
  height: 520px;
}
.map-stage { position: relative; height: 100%; }
.map-stage :deep(.map-container) { height: 100%; }
.map-legend {
  position: absolute; left: 0.75rem; bottom: 0.75rem;
  background: var(--paper-raised); border: 1px solid var(--line);
  padding: 0.5rem 0.65rem; font-size: 0.72rem; color: var(--ink-soft);
  display: flex; flex-direction: column; gap: 0.25rem; box-shadow: var(--shadow);
  border-radius: var(--radius);
}
.map-legend div { display: flex; align-items: center; gap: 0.4rem; }
.map-legend i { width: 0.7rem; height: 0.7rem; display: inline-block; flex: none; border-radius: 2px; }
/* Count indicators (e.g. user-activity) are colored on a continuous
   min-to-max gradient, not fixed quality bands - a row of static swatches
   would be misleading there, so this shows the actual scale as a bar with
   the real min/max values from what's currently loaded on the map. */
.map-legend--gradient { align-items: center; gap: 0.3rem; }
.legend-gradient-bar {
  width: 14px; height: 84px;
  background: linear-gradient(180deg, #154360, #EAF2F8);
  border: 1px solid var(--line-strong);
}
.legend-cap { font-family: var(--font-mono); font-size: 0.68rem; color: var(--ink-soft); }

.plotpanel {
  background: var(--paper-raised); border: 1px solid var(--line); box-shadow: var(--shadow);
  padding: 0.9rem 1rem 0.4rem; border-radius: var(--radius);
}
.plotpanel-layout { display: flex; gap: 1.1rem; }
.plotpanel-main { flex: 2 1 0; min-width: 0; }
.plotpanel-desc {
  flex: 1 1 0; min-width: 0;
  border-left: 1px solid var(--line); padding: 0 0 0.4rem 1.1rem;
  display: flex; flex-direction: column; gap: 0.4rem;
  max-height: 270px; overflow-y: auto;
}
.plotpanel-desc-label {
  font-family: var(--font-body); font-size: 0.78rem; font-weight: 700;
  color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em;
}
.plotpanel-desc p {
  margin: 0; font-size: 0.82rem; line-height: 1.5; color: var(--ink-soft);
}
@media (max-width: 720px) {
  .plotpanel-layout { flex-direction: column; }
  .plotpanel-desc { border-left: none; border-top: 1px solid var(--line); padding: 0.75rem 0 0; max-height: none; }
}
.plotpanel h3 {
  font-family: var(--font-body); font-size: 0.78rem; font-weight: 700;
  color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em;
  margin: 0 0 0.4rem;
}
.plotpanel .plot-container { height: 240px; width: 100%; }
.plot-container > div { width: 100% !important; height: 100% !important; min-height: 150px; }
.plot-unavailable {
  height: 240px; margin: 0; display: flex; align-items: center; justify-content: center;
  color: var(--ink-faint); font-size: 0.82rem; font-style: italic;
}

.panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.35rem; flex-wrap: wrap; }
.panel-head h3 { margin: 0; }
.panel-head .muted { font-size: 0.78rem; font-weight: 500; }

.grouping-toggle { display: flex; gap: 0.3rem; margin-bottom: 0.75rem; }
.grouping-toggle button {
  border: 1px solid var(--line-strong); background: transparent; color: var(--ink-soft);
  font-family: var(--font-body); font-size: 0.72rem; font-weight: 600; padding: 0.25rem 0.55rem;
  border-radius: var(--radius);
}
.grouping-toggle button.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

.page-content.flexible {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.6);
}

.spinner {
  width: 2.5rem;
  height: 2.5rem;
  border: 4px solid var(--color-border);
  border-top-color: var(--color-primary, #4CAF50);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.embed-mode .page-content.flexible {
  overflow-y: auto;
}

@media (max-width: 768px) {
  .page-content.flexible {
    overflow-y: auto;
    overflow-x: hidden;
  }
}

/* Embed mode styles for HDX integration - compact layout */
.embed-mode {
  padding: 0.25rem !important;
  gap: 0.25rem !important;
}

.embed-mode .layout-columns { gap: 0.5rem; }
.embed-mode .sidebar { padding: 0.75rem; gap: 0.8rem; }
.embed-mode .sidebar-brand { padding-bottom: 0.75rem; }
.embed-mode .sidebar-brand img { height: 1.9rem; }
.embed-mode .hero { padding: 0.4rem 0 0.6rem; gap: 0.6rem; }
.embed-mode .mappanel { height: 260px; }
.embed-mode .plotpanel .plot-container { height: 160px; }
.embed-mode .plot-unavailable { height: 160px; }

/* Hide ohsome dashboard button in iframe modes */
.embed-mode :deep(.footer-center),
.embed-mode :deep(.ohsome-link) {
  display: none !important;
}

/* Reduce footer height in iframe modes */
.embed-mode :deep(footer) {
  padding: 0.15rem 0.75rem !important;
  gap: 0.25rem !important;
  font-size: 0.7rem !important;
}

.embed-mode :deep(.footer-btn) {
  padding: 0.25rem 0.4rem !important;
  font-size: 0.65rem !important;
}

.embed-mode :deep(.footer-right) {
  font-size: 0.65rem !important;
}
</style>
