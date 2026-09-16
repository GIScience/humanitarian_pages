<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import ReportHeader from '../components/ReportHeader.vue';
import ReportFooter from '../components/ReportFooter.vue';
import MetricMap from '../components/MetricMap.vue';
import IndicatorGaugeCard from '../components/IndicatorGaugeCard.vue';
import AttributeCompletenessCard from '../components/AttributeCompletenessCard.vue';
import {
  fetchAvailableCountries,
  loadAvailableTopics,
  loadIndicators,
  loadIndicatorLookups,
  loadRegionIndicatorValues,
  getPMTilesBounds,
  loadTagCoverage,
  loadTagDistribution,
  loadIndicatorFigure,
  checkParquetExists,
  type PMTilesBounds,
  type TagCoverageItem
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
const selectedTopic = ref('');
const topicId = ref(0);
const isEmbed = ref(false);
const isIframe2Col = ref(false);

onMounted(async () => {
  // Detect if we're embedded in an iframe or HDX window
  const inIframe = window.self !== window.top;
  const hasEmbedParam = new URLSearchParams(window.location.search).has('embed');
  const hasIframe2ColParam = new URLSearchParams(window.location.search).has('iframe-2col');
  
  // If URL has ?embed or ?iframe-2col but we're not in an iframe (e.g., HDX fullscreen opened new tab),
  // redirect to remove the parameter so users see the normal version
  if ((hasEmbedParam || hasIframe2ColParam) && !inIframe) {
    const newUrl = window.location.pathname + window.location.hash;
    window.history.replaceState(null, '', newUrl);
    isEmbed.value = false;
    isIframe2Col.value = false;
  } else {
    isEmbed.value = inIframe || hasEmbedParam;
    // Automatically use iframe-2col mode when inside an iframe
    isIframe2Col.value = inIframe || hasIframe2ColParam;
  }
  
  // Apply embed mode class to body for global styling
  if (isEmbed.value || isIframe2Col.value) {
    document.body.classList.add('embed-mode');
    
    // Notify parent window of content height changes (for iframe embedding)
    const notifyParentResize = () => {
      if (window.parent !== window) {
        const height = document.documentElement.scrollHeight;
        window.parent.postMessage({ type: 'resize', height }, '*');
      }
    };
    
    // Observe content changes to notify parent
    const resizeObserver = new ResizeObserver(() => {
      notifyParentResize();
    });
    resizeObserver.observe(document.documentElement);
    
    // Also notify on mount
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

  topics.value = ['roads', 'buildings'];

  handleHashRouting();
  window.addEventListener('hashchange', handleHashRouting);

  // Setup ResizeObserver for maps and containers
  setTimeout(() => {
    const resizeObserver = new ResizeObserver(() => {
      // Trigger map resize
      window.dispatchEvent(new Event('resize'));
      
      // Also trigger Plotly resize. Prefix-matched selectors (rather than
      // exact ids) so this keeps working regardless of how many view panels
      // exist - each panel's plot/treemap ids carry a per-panel suffix
      // (e.g. "tag-treemap-a", "tag-treemap-b").
      document.querySelectorAll(
        '[id="comparison-plot"], [id="currentness-plot"], [id="completeness-plot"], [id^="tag-treemap"], [id^="active-indicator-plot"]'
      ).forEach(el => Plotly.Plots.resize(el as HTMLElement));
    });

    // Observe map containers
    document.querySelectorAll(
      '[id="road_comparison_map"], [id="current_map"], [id="completeness_map"], [id^="tag-treemap"], [id^="main_map_"]'
    ).forEach(el => {
      if (el) resizeObserver.observe(el);
    });
    
    // Observe main container for embed mode
    const mainContainer = document.querySelector('.page-content');
    if (mainContainer) resizeObserver.observe(mainContainer);
  }, 1000);
});

const countries = ref<{ value: string; label: string }[]>([]);
const topics = ref<string[]>([]);
const indicators = ref<string[]>([]);
const isLoading = ref(false);
const dataDate = ref('');

const pmtilesUrl = ref('');
const parquetUrl = ref('');

const bounds = ref<PMTilesBounds | null>(null);

const featureCount = ref('');
const totalLength = ref('');
const tile1Label = ref('km of roads');

const tagCoverage = ref<TagCoverageItem[]>([]);
const showTagCoverage = ref(false);

const filteredTagCoverage = computed(() => {
  const attrCompletenessIndicators = indicators.value.filter(i => i.startsWith('attribute-completeness_'));
  return tagCoverage.value.filter(item => 
    attrCompletenessIndicators.includes(item.indicator)
  );
});

const map1Lookup = ref<Record<string, number>>({});
const map1Avg = ref(0);
const map1Description = ref('');
const map2Lookup = ref<Record<string, number>>({});
const map2Avg = ref(0);
const map2Description = ref('');
const map3Lookup = ref<Record<string, number>>({});
const map3Avg = ref(0);
const map3Description = ref('');

const banner1Level = ref<'Low' | 'Medium' | 'High'>('Medium');
const banner2Level = ref<'Low' | 'Medium' | 'High'>('Medium');
const banner3Level = ref<'Low' | 'Medium' | 'High'>('Medium');

const map1Indicator = ref('');
const map2Indicator = ref('currentness');
const map3Indicator = ref('');

const currentLayers = computed(() => getCountryLayers(selectedCountry.value));
const selectedCountryLabel = computed(() => countries.value.find(c => c.value === selectedCountry.value)?.label || 'country');

const map1Layer = ref('h3');
const map2Layer = ref('h3');
const map3Layer = ref('h3');

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

const schoolSwitchVisible = ref(false);
const schoolSubTopic = ref('operator');

// --- Redesigned view (normal mode only - the legacy iframe-2col mode below
// keeps using map1Layer/map1Lookup/etc, it only ever shows one map anyway,
// and isn't part of this redesign pass) ---
// Every indicator available for the topic gets its own card (not just a
// fixed comparison/currentness/completeness trio) - some topics have up to
// 7, and a hardcoded 3 made most of them unreachable. attribute-completeness_*
// variants are grouped into one dropdown card instead of one each - a topic
// can have 4+ of them, which otherwise dominates the list.
//
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

// Single View shows one of these; Compare View shows two side by side, each
// fully independent - its own topic, layer, indicator selection, map, plot,
// treemap and attribute-completeness bars. Country stays shared/global
// (see selectedCountry) - only topic-and-below is per-column, matching what
// was actually asked for ("select for each map individually which topic and
// attribute is shown").
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
  tagCoverage: TagCoverageItem[];
  showTagCoverage: boolean;
  schoolSwitchVisible: boolean;
  schoolSubTopic: string;
  // Which polygon on this panel's map is click-selected, if any - drives the
  // plot below to that one region instead of the whole-country aggregate.
  // Belongs to this panel's current (topic, mapLayer) id-space, so it gets
  // cleared whenever either of those changes.
  selectedGeomId: string | null;
}

function createPanel(id: string, topic: string, layer: string): ViewPanel {
  return {
    id, selectedTopic: topic, topicId: 0,
    indicators: [], mapLayer: layer, activeIndicatorKey: 'currentness',
    indicatorCards: [], attributeOptions: [], selectedAttributeIndicator: '',
    mapLookup: {}, activePlotAvailable: true,
    featureCount: '', totalLength: '', tile1Label: '',
    tagCoverage: [], showTagCoverage: false,
    schoolSwitchVisible: false, schoolSubTopic: 'operator',
    selectedGeomId: null
  };
}

const viewMode = ref<'single' | 'split'>('single');
const panels = ref<ViewPanel[]>([createPanel('a', '', 'h3')]);
// The full topic list for the current country, independent of the legacy
// `topics` ref (which stays dedicated to the iframe-2col path) - each panel
// picks its own starting topic from this list.
const availableTopicsForCountry = ref<string[]>([]);

// Single View still drives its one panel's topic from the shared header
// (like before Split View existed); Split View picks topic per column
// instead, so the header's topic selector is hidden there. The legacy
// iframe-2col embed keeps using the header regardless of viewMode.
const showHeaderTopicSelector = computed(() => isIframe2Col.value || viewMode.value === 'single');
const headerSelectedTopic = computed(() => isIframe2Col.value ? selectedTopic.value : (panels.value[0]?.selectedTopic || ''));
const headerTopics = computed(() => isIframe2Col.value ? topics.value : availableTopicsForCountry.value);
function handleHeaderTopicChange(newTopic: string) {
  if (isIframe2Col.value) {
    selectedTopic.value = newTopic;
  } else {
    handlePanelTopicChange(0, newTopic);
  }
}

// Split View's "mirror the other map's zoom/pan": each panel's <MetricMap>
// exposes getView()/setView() (see MetricMap.vue), and only emits 'move' for
// genuine user-driven camera changes - so applying the synced view here via
// setView (which uses jumpTo) doesn't loop back into another sync.
const mapRefs = ref<any[]>([]);
function setMapRef(idx: number, el: any) {
  if (el) mapRefs.value[idx] = el;
}
function handleMapMove(sourceIdx: number) {
  if (panels.value.length < 2) return;
  const source = mapRefs.value[sourceIdx];
  const targetIdx = sourceIdx === 0 ? 1 : 0;
  const target = mapRefs.value[targetIdx];
  if (!source || !target) return;
  const view = source.getView();
  if (view) target.setView(view);
}

function setViewMode(mode: 'single' | 'split') {
  if (viewMode.value === mode) return;
  viewMode.value = mode;
  if (mode === 'split' && panels.value.length < 2) {
    const first = panels.value[0];
    const secondTopic = availableTopicsForCountry.value.find(t => t !== first.selectedTopic) || first.selectedTopic;
    const second = createPanel('b', secondTopic, first.mapLayer);
    panels.value = [first, second];
    loadPanelTopicData(1);
  } else if (mode === 'single') {
    panels.value = [panels.value[0]];
  }
}

function getFilteredTagCoverage(panel: ViewPanel): TagCoverageItem[] {
  const attrIndicators = panel.indicators.filter(i => i.startsWith('attribute-completeness_'));
  return panel.tagCoverage.filter(item => attrIndicators.includes(item.indicator));
}

// Real min/max of what's actually on the map right now, for the count-type
// legend's end labels - concrete numbers are more useful than a vague
// "High"/"Low", and the map is already colored against this exact range.
function getMapLookupRange(panel: ViewPanel): { min: number; max: number } | null {
  const values = Object.values(panel.mapLookup);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function getActiveCard(panel: ViewPanel): IndicatorCard | null {
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

// Split View's compact chip row (between the map and its plot) flattens
// indicators AND each individual attribute-completeness option into one flat
// row of equal chips - no grouping/dropdown, just click the one you want.
interface ChipItem {
  indicator: string;
  label: string;
  level: 'good' | 'warn' | 'bad' | 'neutral';
  description: string;
}
function getChipItems(panel: ViewPanel): ChipItem[] {
  const entries: { sortKey: string; item: ChipItem }[] = panel.indicatorCards.map(card => ({
    sortKey: card.title,
    item: { indicator: card.indicator, label: card.title, level: card.level, description: card.description }
  }));
  panel.attributeOptions.forEach(opt => {
    entries.push({
      sortKey: `Attribute Completeness: ${opt.label}`,
      item: { indicator: opt.indicator, label: opt.label, level: opt.level, description: opt.description }
    });
  });
  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return entries.map(e => e.item);
}

function selectChip(panelIdx: number, indicator: string) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  if (panel.attributeOptions.some(o => o.indicator === indicator)) {
    selectAttributeOption(panelIdx, indicator);
  } else {
    selectIndicatorCard(panelIdx, indicator);
  }
}

// Cards stay alphabetically sorted by title, same as before the attribute-
// completeness variants were grouped - "Attribute Completeness" sorts in
// wherever its name puts it (typically near the top), not always last.
type StackItem =
  | { type: 'indicator'; card: IndicatorCard }
  | { type: 'attribute-group' };

function getIndicatorStackItems(panel: ViewPanel): StackItem[] {
  const entries: { sortKey: string; item: StackItem }[] = panel.indicatorCards.map(card => ({
    sortKey: card.title,
    item: { type: 'indicator', card }
  }));
  if (panel.attributeOptions.length > 0) {
    entries.push({ sortKey: 'Attribute Completeness', item: { type: 'attribute-group' } });
  }
  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return entries.map(e => e.item);
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
// Count indicators (e.g. user-activity) show activeCard.displayValue, which
// loadIndicatorCards already computes region-aware (the country-wide total,
// or the selected region's own total) - no separate lookup needed here.
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
  if (hTopic && topics.value.includes(hTopic)) {
    selectedTopic.value = hTopic;
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

// loadCountry() sets selectedTopic.value itself when updateTopics is true
// (picking the default topic for the newly-loaded country), which would
// otherwise synchronously re-trigger this watcher and re-enter loadCountry()
// while the first call is still in flight - racing its own cache/registration
// state. This flag lets the watcher tell "loadCountry set this" apart from a
// real user-driven topic change.
let isSettingTopicFromLoadCountry = false;

watch(selectedTopic, async (newTopic) => {
  if (!newTopic || !selectedCountry.value) return;
  if (isSettingTopicFromLoadCountry) return;
  topicId.value++;
  await loadCountry(selectedCountry.value, false);
});

async function loadCountry(code: string, updateTopics: boolean) {
  isLoading.value = true;

  const layers = getCountryLayers(code);
  const urls = buildUrls(code, layers.countryLevel);
  pmtilesUrl.value = urls.pmtilesUrl;
  parquetUrl.value = urls.parquetUrl;

  try {
    // The last-modified date, the pmtiles bounds, and which grid layers
    // actually have data are all independent network calls - run them
    // together instead of one after the other.
    const layerCandidates = [...new Set(
      [layers.countryLevel, layers.stateLevel, layers.detailLevel, layers.h3Level].filter(Boolean) as string[]
    )];

    const [lastModifiedResp, pmtilesBounds, layerChecks] = await Promise.all([
      fetch(urls.parquetUrl, { method: 'HEAD' }).catch(() => null),
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
      map1Layer.value = defaultLayer;
      map2Layer.value = defaultLayer;
      map3Layer.value = defaultLayer;
    }

    const lastModified = lastModifiedResp?.headers.get('last-modified');
    dataDate.value = lastModified
      ? new Date(lastModified).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : '';

    bounds.value = pmtilesBounds;
    if (!bounds.value) {
      isLoading.value = false;
      return;
    }

    let availableTopics = availableTopicsForCountry.value;
    if (updateTopics) {
      availableTopics = await loadAvailableTopics(urls.parquetUrl);
      topics.value = availableTopics;
      availableTopicsForCountry.value = availableTopics;
      isSettingTopicFromLoadCountry = true;
      selectedTopic.value = availableTopics.includes('roads')
        ? 'roads'
        : availableTopics[0] || '';
      // watch() callbacks flush on a microtask, not synchronously - resetting
      // the flag right here would clear it before the watcher above ever
      // runs. nextTick() waits for that flush first.
      await nextTick();
      isSettingTopicFromLoadCountry = false;
    }

    if (isIframe2Col.value) {
      // Legacy iframe-2col mode isn't part of this redesign - it only ever
      // showed one map anyway, so it keeps using the old plot-based path,
      // driven by the shared selectedTopic/indicators refs.
      const topicName = selectedTopic.value;

      const [newIndicators, coverage] = await Promise.all([
        loadIndicators(urls.parquetUrl, topicName),
        loadTagCoverage(urls.parquetUrl)
      ]);
      indicators.value = newIndicators;
      tagCoverage.value = coverage;
      showTagCoverage.value = newIndicators.some(ind => ind.startsWith('attribute-completeness_'));

      const cfg = topicConfig[topicName] || {
        comparisonIndicator: topicName.includes('building') ? 'building-comparison' : 'roads-thematic-accuracy',
        completenessIndicator: topicName.includes('building') ? 'user-activity' : 'attribute-completeness_surface'
      };
      map1Indicator.value = newIndicators.includes(cfg.comparisonIndicator)
        ? cfg.comparisonIndicator
        : newIndicators[0] || '';
      map2Indicator.value = 'currentness';
      map3Indicator.value = newIndicators.includes(cfg.completenessIndicator)
        ? cfg.completenessIndicator
        : newIndicators[0] || '';

      await loadMapData();
      loadTreemap();

      const t = topicName.toLowerCase();
      schoolSwitchVisible.value = t.startsWith('school') || t.startsWith('hospital') || t.startsWith('healthcare-primary');
      updateHash(code, topicName);
    } else {
      if (updateTopics) {
        // New country - reset every panel to a fresh default topic, keeping
        // however many panels the current view mode calls for.
        const firstTopic = availableTopics.includes('roads') ? 'roads' : (availableTopics[0] || '');
        if (viewMode.value === 'split') {
          const secondTopic = availableTopics.find(t => t !== firstTopic) || firstTopic;
          panels.value = [createPanel('a', firstTopic, defaultLayer), createPanel('b', secondTopic, defaultLayer)];
        } else {
          panels.value = [createPanel('a', firstTopic, defaultLayer)];
        }
      }
      await Promise.all(panels.value.map((_, idx) => loadPanelTopicData(idx)));
      updateHash(code, panels.value[0]?.selectedTopic || '');
    }
  } catch (e) {
    console.error('Failed to load country:', e);
  } finally {
    isLoading.value = false;
  }
}

function getCurrentTopic(): string {
  return selectedTopic.value || topics.value[0] || '';
}

// Value lookups are layer-specific (one parquet per country/layer), so each map
// fetches its own using whichever grid it's currently showing. Descriptions and
// gauge figures are country-level concepts, independent of grid layer, so they're
// loaded separately (loadMapDescriptions, loadPlot) rather than per-map-layer.
async function loadMapValueLookup(mapNum: 1 | 2 | 3, topicName: string, indicator: string) {
  if (!indicator || !selectedCountry.value) return;

  const layer = mapNum === 1 ? map1Layer.value : mapNum === 2 ? map2Layer.value : map3Layer.value;
  const urls = buildUrls(selectedCountry.value, layer);

  const [result] = await loadIndicatorLookups(urls.parquetUrl, topicName, [indicator]);
  if (!result) return;

  if (mapNum === 1) {
    map1Lookup.value = result.lookup;
    map1Avg.value = result.avg;
    banner1Level.value = getBannerLevel(result.avg);
  } else if (mapNum === 2) {
    map2Lookup.value = result.lookup;
    map2Avg.value = result.avg;
    banner2Level.value = getBannerLevel(result.avg);
  } else {
    map3Lookup.value = result.lookup;
    map3Avg.value = result.avg;
    banner3Level.value = getBannerLevel(result.avg);
  }
}

async function loadMapDescriptions(topicName: string) {
  const indicatorNames = [map1Indicator.value, map2Indicator.value, map3Indicator.value].filter(Boolean);
  if (indicatorNames.length === 0 || !parquetUrl.value) return;

  const results = await loadIndicatorLookups(parquetUrl.value, topicName, indicatorNames);
  const byIndicator: Record<string, string> = {};
  indicatorNames.forEach((name, i) => { byIndicator[name] = results[i]?.description || ''; });

  map1Description.value = byIndicator[map1Indicator.value] || '';
  map2Description.value = byIndicator[map2Indicator.value] || '';
  map3Description.value = byIndicator[map3Indicator.value] || '';
}

async function loadMapData() {
  const topicName = getCurrentTopic();

  await Promise.all([
    loadMapValueLookup(1, topicName, map1Indicator.value),
    loadMapValueLookup(2, topicName, map2Indicator.value),
    loadMapValueLookup(3, topicName, map3Indicator.value),
    loadMapDescriptions(topicName)
  ]);

  if (map1Indicator.value) loadPlot(map1Indicator.value, 'comparison-plot');
  if (map2Indicator.value) loadPlot(map2Indicator.value, 'currentness-plot');
  if (map3Indicator.value) loadPlot(map3Indicator.value, 'completeness-plot');
}

// The redesigned view's three canonical roles reuse the same cfg-driven
// indicator names as the legacy per-map selects, but every indicator gets a
// card now (not just those 3) - hardcoding 3 slots made the rest of a
// topic's indicators (e.g. hospitals' 4 attribute-completeness variants)
// unreachable in the new single-map view.
async function loadIndicatorCards(panelIdx: number, topicName: string) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  if (!parquetUrl.value || panel.indicators.length === 0 || !selectedCountry.value) {
    panel.indicatorCards = [];
    panel.attributeOptions = [];
    panel.selectedAttributeIndicator = '';
    panel.tagCoverage = [];
    return;
  }

  const allIndicators = panel.indicators;

  // A selected region reads its own value+description straight off its grid
  // layer's file instead of the country-level average - same idea as the
  // plot and treemap, just for the values behind the cards/chips/bars.
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
    const isCount = isNoQualityDescription(description);

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
        displayValue: isCount ? Math.round(avg).toLocaleString('en-US') : `${Math.round(avg * 100)}%`,
        ringPct: isCount ? 0 : Math.round(avg * 100),
        level: isCount ? 'neutral' : levelFromAvg(avg),
        isCount,
        description
      });
    }
  });

  panel.indicatorCards = regularCards;
  panel.attributeOptions = attrOptions;
  // The attribute-completeness bars box reuses the same values just fetched
  // above instead of a separate query - it's the same indicators, just
  // rendered as a flat bar list instead of ring cards.
  panel.tagCoverage = attrOptions.map(o => ({ indicator: o.indicator, value: o.ringPct / 100 }));

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
  if (!selectableKeys.includes(panel.activeIndicatorKey)) {
    panel.activeIndicatorKey = selectableKeys.includes('currentness') ? 'currentness' : (selectableKeys[0] || 'currentness');
  }
}

async function loadActiveMapLookup(panelIdx: number, topicName: string) {
  const panel = panels.value[panelIdx];
  const card = panel && getActiveCard(panel);
  if (!panel || !card || !selectedCountry.value) return;

  const urls = buildUrls(selectedCountry.value, panel.mapLayer);
  const [result] = await loadIndicatorLookups(urls.parquetUrl, topicName, [card.indicator]);
  if (!result) return;
  panel.mapLookup = result.lookup;
}

// Same margin/automargin/legend/multi-axis handling as the legacy loadPlot()
// (see git history for how those were worked out) - just for one plot at a
// time, tied to whichever indicator is currently active, instead of 3 fixed
// per-map slots. Each panel gets its own Plotly target id so two panels'
// plots don't stomp on each other.
async function loadActiveIndicatorPlot(panelIdx: number) {
  const panel = panels.value[panelIdx];
  const card = panel && getActiveCard(panel);
  const plotId = `active-indicator-plot-${panel?.id}`;
  if (!panel || !card || !parquetUrl.value || !selectedCountry.value) return;

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

    Plotly.react(plotId, fig.data, fig.layout, {
      responsive: true,
      displayModeBar: false
    });
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
// cards/chips, attribute-completeness bars, plot, tag-distribution treemap)
// from the whole country to that one region; clicking it again, or clicking
// empty map area, goes back (MetricMap already turns "clicked the selected
// region again" into a null geomId itself). The map coloring itself
// (mapLookup) doesn't need reloading - it's already the full per-region
// lookup for the active indicator, this just reads one entry out of it.
function handleRegionClick(panelIdx: number, geomId: string | null) {
  const panel = panels.value[panelIdx];
  if (!panel) return;
  panel.selectedGeomId = geomId;
  loadIndicatorCards(panelIdx, panel.selectedTopic);
  loadActiveIndicatorPlot(panelIdx);
  loadPanelTreemap(panelIdx);
}

function getBannerLevel(avg: number): 'Low' | 'Medium' | 'High' {
  if (avg < 0.25) return 'Low';
  if (avg < 0.75) return 'Medium';
  return 'High';
}

function getBannerColor(level: 'Low' | 'Medium' | 'High'): string {
  switch (level) {
    case 'Low': return '#F44336';
    case 'Medium': return '#FFEB3B';
    case 'High': return '#4CAF50';
  }
}

function getBannerTextColor(level: 'Low' | 'Medium' | 'High'): string {
  return level === 'Medium' ? '#333' : 'white';
}

async function loadPlot(indicator: string, containerId: string) {
  if (!indicator || !selectedCountry.value || !parquetUrl.value) return;

  try {
    const fig = await loadIndicatorFigure(parquetUrl.value, getCurrentTopic(), indicator);
    if (!fig) return;

    fig.layout = fig.layout || {};
    delete fig.layout.width;
    delete fig.layout.height;
    fig.layout.paper_bgcolor = 'rgba(0,0,0,0)';
    fig.layout.plot_bgcolor = 'rgba(0,0,0,0)';
    // Small margin floor + automargin instead of a flat 40px on every side:
    // a fixed pixel margin wastes most of a small/narrow container (measured
    // ~78% blank on the smallest tested size) but barely register on a large
    // one. automargin lets Plotly grow the margin only as much as the actual
    // axis labels/title need, at whatever size the container currently is.
    fig.layout.margin = { t: 25, r: 10, l: 10, b: 10 };
    // automargin has to be set on every axis present (some figures, e.g.
    // roads-thematic-accuracy, have more than one x/y axis), or an
    // un-covered axis's title falls back to a fixed position and overlaps
    // the plot area.
    const axisKeys = Object.keys(fig.layout).filter((key) => /^[xy]axis\d*$/.test(key));
    axisKeys.forEach((key) => {
      fig.layout[key] = { ...fig.layout[key], automargin: true };
    });
    // Plotly's legend.automargin doesn't reliably reserve space in these
    // narrow (~300px) cards - verified across several position/config
    // variations, margin never grows past the floor, so the legend just
    // overlaps the bars/ticks wherever it lands. The banner above (value/
    // level) and the description text below already carry the primary info,
    // so drop the legend entirely rather than let it overlap.
    fig.layout.showlegend = false;

    // Figures with more than one x-axis or y-axis are side-by-side subplots
    // sharing this one card's width - automargin only pads the outer edge,
    // it can't create space between adjacent subplots, so a per-axis title
    // still collides with the neighboring subplot's bars. Same reasoning as
    // the legend above: drop it, the label/description text covers it.
    const isMultiAxis =
      axisKeys.filter((k) => k.startsWith('x')).length > 1 ||
      axisKeys.filter((k) => k.startsWith('y')).length > 1;
    if (isMultiAxis) {
      axisKeys.forEach((key) => {
        fig.layout[key] = { ...fig.layout[key], title: '' };
      });
      // automargin doesn't reliably size the bottom margin for these
      // subplots' long category tick labels either (verified: margin.b
      // stayed near the floor no matter how tall the container was made) -
      // same unreliable behavior as the legend case above. Hand-set a
      // generous fixed bottom margin and a smaller, consistent tick angle/
      // font instead of leaving it to automargin's judgment.
      fig.layout.margin = { ...fig.layout.margin, b: 90 };
      axisKeys
        .filter((k) => k.startsWith('x'))
        .forEach((key) => {
          fig.layout[key] = {
            ...fig.layout[key],
            tickangle: -45,
            tickfont: { size: 9 }
          };
        });
    }
    fig.layout.font = { family: 'Archivo, sans-serif', size: 11 };
    if (fig.layout.title) {
      fig.layout.title.font = { size: 13 };
    }

    Plotly.react(containerId, fig.data, fig.layout, {
      responsive: true,
      displayModeBar: false
    });
  } catch (e) {
    console.error('Failed to load plot:', e);
  }
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

async function loadTreemap() {
  if (!selectedCountry.value) return;

  const topicName = getCurrentTopic();
  const groupingKey = getTagGroupingKey(topicName);
  if (!groupingKey) return;

  const urls = buildUrls(selectedCountry.value, currentLayers.value.countryLevel);

  try {
    const [byMeasure, trueFeatureCount] = await Promise.all([
      loadTagDistribution(urls.tagDistributionUrl, topicName, groupingKey),
      loadTrueFeatureCount(topicName)
    ]);

    const mainMeasure = byMeasure['area'] || byMeasure['length'] || byMeasure['count'];
    if (!mainMeasure?.treemap) return;

    const fig = mainMeasure.treemap;
    fig.layout = fig.layout || {};
    fig.layout.margin = { t: 40, r: 10, l: 10, b: 10 };
    fig.layout.paper_bgcolor = 'rgba(0,0,0,0)';
    fig.layout.plot_bgcolor = 'rgba(0,0,0,0)';
    fig.layout.font = { family: 'Archivo, sans-serif', size: 11 };

    Plotly.react('tag-treemap', fig.data, fig.layout, {
      responsive: true,
      displayModeBar: false
    });

    const countMeasure = byMeasure['count'];
    const featureTotal = trueFeatureCount ?? countMeasure?.sumValue;
    featureCount.value = featureTotal != null
      ? Number(featureTotal).toLocaleString('en-US')
      : '';

    const topicSimple = topicName.toLowerCase().includes('road')
      ? 'roads'
      : topicName.toLowerCase().includes('building')
        ? 'buildings'
        : prettifyTopic(topicName);

    if (byMeasure['area']?.sumValue != null) {
      const km2 = (byMeasure['area'].sumValue / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 0 });
      totalLength.value = km2;
      tile1Label.value = `km² of ${topicSimple}`;
    } else if (byMeasure['length']?.sumValue != null) {
      const km = (byMeasure['length'].sumValue / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 });
      totalLength.value = km;
      tile1Label.value = `km of ${topicSimple}`;
    } else {
      totalLength.value = '';
      tile1Label.value = '';
    }
  } catch (e) {
    console.error('Failed to load treemap:', e);
  }
}

// Same as loadTreemap() above (kept untouched for the legacy iframe-2col
// path), but reading/writing one panel's own state and a per-panel Plotly
// target id instead of the shared globals.
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

    Plotly.react(treemapId, fig.data, fig.layout, {
      responsive: true,
      displayModeBar: false
    });

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

// The full per-topic pipeline for one panel: indicators + tag coverage,
// then the indicator cards derived from them, then whichever indicator is
// currently active (map + plot), then the treemap. Runs whenever a panel's
// own topic changes, or once per panel when the country (re)loads.
async function loadPanelTopicData(panelIdx: number) {
  const panel = panels.value[panelIdx];
  if (!panel || !panel.selectedTopic || !parquetUrl.value) return;

  const topicName = panel.selectedTopic;
  const newIndicators = await loadIndicators(parquetUrl.value, topicName);
  panel.indicators = newIndicators;
  panel.showTagCoverage = newIndicators.some(ind => ind.startsWith('attribute-completeness_'));

  // tagCoverage itself now comes out of loadIndicatorCards (see there) - it
  // reads the same attribute-completeness values the cards/chips already
  // fetch, region-aware for free, instead of a second, always-country-level query.
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

async function handleIndicatorChange(mapNum: 1 | 2 | 3, indicator: string) {
  if (mapNum === 1) map1Indicator.value = indicator;
  else if (mapNum === 2) map2Indicator.value = indicator;
  else map3Indicator.value = indicator;

  await loadMapData();
}

async function handleGridChange(mapNum: 1 | 2 | 3, layer: string) {
  if (mapNum === 1) map1Layer.value = layer;
  else if (mapNum === 2) map2Layer.value = layer;
  else map3Layer.value = layer;

  const topicName = getCurrentTopic();
  const indicator = mapNum === 1 ? map1Indicator.value : mapNum === 2 ? map2Indicator.value : map3Indicator.value;
  await loadMapValueLookup(mapNum, topicName, indicator);
}

function handleSchoolSwitch(subTopic: string) {
  schoolSubTopic.value = subTopic;
  setCurrentSchoolSubTopic(subTopic);
  loadTreemap();
}

const banner1Style = computed(() => ({
  background: getBannerColor(banner1Level.value),
  color: getBannerTextColor(banner1Level.value)
}));

onUnmounted(() => {
  window.removeEventListener('hashchange', handleHashRouting);
});
</script>

<template>
  <div :class="['h-full w-full overflow-hidden flex flex-col relative bg-[#F3F3F3] p-2 gap-2', isEmbed ? 'embed-mode' : '']">
    <ReportHeader
      v-model:selectedCountry="selectedCountry"
      :selectedTopic="headerSelectedTopic"
      @update:selectedTopic="handleHeaderTopicChange"
      :countries="countries"
      :topics="headerTopics"
      :showTopicSelector="showHeaderTopicSelector"
      :showViewModeToggle="!isIframe2Col"
      :viewMode="viewMode"
      @update:viewMode="setViewMode"
    />

    <div class="page-content flexible">
      <div class="loading-overlay" v-if="isLoading">
        <div class="spinner"></div>
      </div>

      <!-- Normal and embed mode: show full 4-column layout -->
      <template v-if="!isIframe2Col">
        <div class="view-columns" :class="{ 'view-columns--split': panels.length > 1 }">
          <div v-for="(panel, idx) in panels" :key="panel.id" class="view-column">
            <section class="hero">
              <!-- Every box in this panel (hero, cards/chips, plot, treemap,
                   attribute bars) switches to the clicked region's own data -
                   this banner is the one loud, unmissable place that says so,
                   since a small badge tucked into just the plot panel wasn't
                   visible enough to stop people reading the other boxes as
                   whole-country numbers. -->
              <div class="region-banner" v-if="panel.selectedGeomId">
                <span class="region-banner-text">
                  <strong>Selected region</strong> — every box below is scoped to this region, not all of {{ selectedCountryLabel }}
                </span>
                <button type="button" class="region-banner-back" @click="handleRegionClick(idx, null)">
                  ← Back to all of {{ selectedCountryLabel }}
                </button>
              </div>
              <div class="band" :data-level="getHeroBandLevel(panel)">
                <span class="band-label">{{ getActiveCard(panel)?.title || 'Quality' }}</span>
                <span class="band-value">{{ getHeroBandLevelLabel(panel) }}<span class="band-pct">{{ getHeroBandValueText(panel) }}</span></span>
              </div>
              <!-- The "grouped by X" tag is already shown on the treemap box
                   below - repeating it here as "Grouping tag" added nothing.
                   Point topics (no length/area, e.g. Hospitals/Schools) just
                   drop that slot and go 3-wide instead of filling it with a
                   duplicate. -->
              <div class="readouts" :class="{ 'readouts--3col': !panel.totalLength }">
                <div class="readout">
                  <span class="readout-label">Features mapped</span>
                  <span class="readout-value">{{ panel.featureCount || '—' }}</span>
                </div>
                <div class="readout" v-if="panel.totalLength">
                  <span class="readout-label">{{ panel.tile1Label }}</span>
                  <span class="readout-value">{{ panel.totalLength }}</span>
                </div>
                <div class="readout">
                  <span class="readout-label">Data current as of</span>
                  <span class="readout-value">{{ dataDate || '—' }}</span>
                </div>
                <div class="readout">
                  <span class="readout-label">Granularity shown</span>
                  <span class="readout-value">{{ panel.mapLayer === currentLayers.countryLevel ? currentLayers.countryLevelLabel
                    : panel.mapLayer === currentLayers.stateLevel ? currentLayers.stateLevelLabel
                    : panel.mapLayer === currentLayers.detailLevel ? currentLayers.detailLevelLabel
                    : currentLayers.h3LevelLabel }}</span>
                </div>
              </div>
            </section>

            <section class="mainview" :class="{ 'mainview--stacked': panels.length > 1 }">
              <div class="map-column">
                <div class="mappanel">
                  <!-- Split View: Topic and Indicator sit directly above the
                       map they control, in the same "label + pill row"
                       language as the Layer switch below them - one control
                       cluster for everything that changes what this map
                       shows, instead of Topic living far away at the top of
                       the column. -->
                  <div class="map-toolbar" v-if="panels.length > 1">
                    <span class="map-toolbar-label">Topic</span>
                    <div class="topic-pills-row">
                      <button
                        v-for="t in availableTopicsForCountry"
                        :key="t"
                        class="pill"
                        :class="{ active: t === panel.selectedTopic }"
                        @click="handlePanelTopicChange(idx, t)"
                      >{{ prettifyTopic(t) }}</button>
                    </div>
                  </div>
                  <div class="map-toolbar" v-if="panels.length > 1">
                    <span class="map-toolbar-label">Indicator</span>
                    <div class="indicator-chip-row">
                      <button
                        v-for="chip in getChipItems(panel)"
                        :key="chip.indicator"
                        type="button"
                        class="chip"
                        :class="{ active: chip.indicator === panel.activeIndicatorKey }"
                        :title="chip.description"
                        @click="selectChip(idx, chip.indicator)"
                      >
                        <span class="chip-dot" :class="'level-' + chip.level"></span>
                        {{ chip.label }}
                      </button>
                    </div>
                  </div>
                  <div class="map-toolbar">
                    <span class="map-toolbar-label">Layer</span>
                    <div class="layer-switch">
                      <button
                        :class="{ active: panel.mapLayer === currentLayers.countryLevel }"
                        :disabled="!isLayerAvailable(currentLayers.countryLevel)"
                        @click="handleMapLayerChange(idx, currentLayers.countryLevel)"
                      >{{ currentLayers.countryLevelLabel }}</button>
                      <button
                        v-if="currentLayers.stateLevel"
                        :class="{ active: panel.mapLayer === currentLayers.stateLevel }"
                        :disabled="!isLayerAvailable(currentLayers.stateLevel)"
                        @click="handleMapLayerChange(idx, currentLayers.stateLevel!)"
                      >{{ currentLayers.stateLevelLabel }}</button>
                      <button
                        :class="{ active: panel.mapLayer === currentLayers.detailLevel }"
                        :disabled="!isLayerAvailable(currentLayers.detailLevel)"
                        @click="handleMapLayerChange(idx, currentLayers.detailLevel)"
                      >{{ currentLayers.detailLevelLabel }}</button>
                      <button
                        :class="{ active: panel.mapLayer === currentLayers.h3Level }"
                        :disabled="!isLayerAvailable(currentLayers.h3Level)"
                        :title="!isLayerAvailable(currentLayers.h3Level) ? 'Not processed for this country yet' : ''"
                        @click="handleMapLayerChange(idx, currentLayers.h3Level)"
                      >{{ currentLayers.h3LevelLabel }}</button>
                    </div>
                  </div>
                  <div class="map-stage">
                    <MetricMap
                      :ref="(el: any) => setMapRef(idx, el)"
                      :key="'main-map-' + panel.id"
                      :containerId="'main_map_' + panel.id"
                      :pmtilesUrl="pmtilesUrl"
                      :lookup="panel.mapLookup"
                      :indicatorName="getActiveCard(panel)?.indicator || ''"
                      :bounds="bounds"
                      :layerName="panel.mapLayer"
                      :sourceName="'main_source_' + panel.id"
                      :topicId="panel.topicId"
                      :isCountIndicator="getActiveCard(panel)?.isCount || false"
                      :selectedGeomId="panel.selectedGeomId"
                      @move="handleMapMove(idx)"
                      @regionClick="handleRegionClick(idx, $event)"
                    />
                    <div class="map-legend" v-if="!getActiveCard(panel)?.isCount">
                      <div><i style="background:#F44336;"></i>0&ndash;25%</div>
                      <div><i style="background:#FFEB3B;"></i>25&ndash;75%</div>
                      <div><i style="background:#4CAF50;"></i>75&ndash;100%</div>
                    </div>
                    <div class="map-legend map-legend--gradient" v-else>
                      <span class="legend-cap">{{ getMapLookupRange(panel) ? getMapLookupRange(panel)!.max.toLocaleString('en-US') : 'High' }}</span>
                      <div class="legend-gradient-bar"></div>
                      <span class="legend-cap">{{ getMapLookupRange(panel) ? getMapLookupRange(panel)!.min.toLocaleString('en-US') : 'Low' }}</span>
                    </div>
                  </div>
                </div>

                <div class="plotpanel">
                  <h3>{{ getActiveCard(panel) ? prettifyIndicator(getActiveCard(panel)!.indicator) : '' }}</h3>
                  <p v-if="!panel.activePlotAvailable" class="plot-unavailable">No chart available for this indicator.</p>
                  <div v-show="panel.activePlotAvailable" class="plot-container" :id="'active-indicator-plot-' + panel.id"></div>
                </div>
              </div>

              <!-- Single View only: the tag-distribution and attribute-
                   completeness boxes sit here, stacked below the indicator
                   tiles, so this whole column reads as "everything about the
                   topic" next to the map+plot. Split View keeps them in the
                   separate .detailview section below instead (see there) -
                   this same markup appears in both places since which one
                   renders is mutually exclusive (single vs split), not a
                   shared component; keep the two in sync if you change one. -->
              <div class="side-column" v-if="panels.length === 1">
                <div class="indicator-stack">
                  <template v-for="item in getIndicatorStackItems(panel)" :key="item.type === 'indicator' ? item.card.indicator : 'attribute-group'">
                    <IndicatorGaugeCard
                      v-if="item.type === 'indicator'"
                      :title="item.card.title"
                      :displayValue="item.card.displayValue"
                      :ringPct="item.card.ringPct"
                      :level="item.card.level"
                      :description="item.card.description"
                      :active="item.card.indicator === panel.activeIndicatorKey"
                      @click="selectIndicatorCard(idx, item.card.indicator)"
                    />
                    <AttributeCompletenessCard
                      v-else
                      :options="panel.attributeOptions"
                      :selected="panel.selectedAttributeIndicator"
                      :active="isAttributeGroupActive(panel)"
                      @select="(indicator: string) => selectAttributeOption(idx, indicator)"
                    />
                  </template>
                </div>

                <div class="panel">
                  <div class="panel-head">
                    <h2>Tag distribution</h2>
                    <span class="muted">grouped by <span class="mono">{{ getTagGroupingKey(panel.selectedTopic) }}</span></span>
                  </div>
                  <div class="grouping-toggle" v-if="panel.schoolSwitchVisible">
                    <button :class="{ active: panel.schoolSubTopic === 'operator' }" @click="handlePanelSchoolSwitch(idx, 'operator')">operator:type</button>
                    <button :class="{ active: panel.schoolSubTopic === 'isced' }" @click="handlePanelSchoolSwitch(idx, 'isced')">
                      {{ panel.selectedTopic?.toLowerCase().startsWith('hospital') || panel.selectedTopic?.toLowerCase().startsWith('healthcare') ? 'healthcare:speciality' : 'isced:level' }}
                    </button>
                  </div>
                  <div class="plot-container" :id="'tag-treemap-' + panel.id"></div>
                </div>

                <div class="panel">
                  <div class="panel-head">
                    <h2>Attribute completeness</h2>
                    <span class="muted">share of features carrying each tag</span>
                  </div>
                  <div v-if="panel.showTagCoverage && getFilteredTagCoverage(panel).length > 0" class="bars">
                    <div v-for="item in getFilteredTagCoverage(panel)" :key="item.indicator" class="bar-row">
                      <span class="bar-label">{{ item.indicator.replace('attribute-completeness_', '') }}</span>
                      <span class="bar-track"><span class="bar-fill" :class="'level-' + levelFromAvg(item.value)" :style="{ width: (item.value * 100) + '%' }"></span></span>
                      <span class="bar-pct">{{ (item.value * 100).toFixed(0) }}%</span>
                    </div>
                  </div>
                  <p v-else class="grouping-note">No attribute-completeness indicators for this topic.</p>
                </div>
              </div>
            </section>

            <!-- Split View only now - Single View moved these two panels
                 into .mainview's side-column above, next to the indicator
                 tiles instead of below everything. -->
            <section class="detailview detailview--stacked" v-if="panels.length > 1">
              <div class="panel">
                <div class="panel-head">
                  <h2>Tag distribution</h2>
                  <span class="muted">grouped by <span class="mono">{{ getTagGroupingKey(panel.selectedTopic) }}</span></span>
                </div>
                <div class="grouping-toggle" v-if="panel.schoolSwitchVisible">
                  <button :class="{ active: panel.schoolSubTopic === 'operator' }" @click="handlePanelSchoolSwitch(idx, 'operator')">operator:type</button>
                  <button :class="{ active: panel.schoolSubTopic === 'isced' }" @click="handlePanelSchoolSwitch(idx, 'isced')">
                    {{ panel.selectedTopic?.toLowerCase().startsWith('hospital') || panel.selectedTopic?.toLowerCase().startsWith('healthcare') ? 'healthcare:speciality' : 'isced:level' }}
                  </button>
                </div>
                <div class="plot-container" :id="'tag-treemap-' + panel.id"></div>
              </div>

              <div class="panel">
                <div class="panel-head">
                  <h2>Attribute completeness</h2>
                  <span class="muted">share of features carrying each tag</span>
                </div>
                <div v-if="panel.showTagCoverage && getFilteredTagCoverage(panel).length > 0" class="bars">
                  <div v-for="item in getFilteredTagCoverage(panel)" :key="item.indicator" class="bar-row">
                    <span class="bar-label">{{ item.indicator.replace('attribute-completeness_', '') }}</span>
                    <span class="bar-track"><span class="bar-fill" :class="'level-' + levelFromAvg(item.value)" :style="{ width: (item.value * 100) + '%' }"></span></span>
                    <span class="bar-pct">{{ (item.value * 100).toFixed(0) }}%</span>
                  </div>
                </div>
                <p v-else class="grouping-note">No attribute-completeness indicators for this topic.</p>
              </div>
            </section>
          </div>
        </div>
      </template>

      <!-- iframe-2col mode: 2-column layout with tile 5 and tile 6 -->
      <template v-else>
        <div class="box-row flexible iframe-2col-grid">
          <div class="grid">
            <div class="image-box" id="tile5">
              <template v-if="showTagCoverage && filteredTagCoverage.length > 0">
                <h4 class="tile-header">Tag Coverage</h4>
                <div class="bar-chart-container">
                  <div class="bar-chart">
                    <div v-for="item in filteredTagCoverage" :key="item.indicator" class="bar-item">
                      <span class="label">{{ item.indicator.replace('attribute-completeness_', '') }}</span>
                      <div class="bar-container">
                        <div class="bar" :style="{ width: `${item.value * 100}%` }"></div>
                      </div>
                      <span class="value">{{ (item.value * 100).toFixed(2) }}%</span>
                    </div>
                  </div>
                </div>
              </template>
              <h4 class="tile-header" style="margin-top: 2rem; margin-bottom: -2rem;">Tag Distribution</h4>
              <div id="school-treemap-switch" :style="{ display: schoolSwitchVisible ? 'flex' : 'none', width: '95%', margin: '3rem auto -2rem auto', justifyContent: 'center', gap: 0, position: 'relative', zIndex: 10 }">
                <button
                  class="switch-btn"
                  :class="{ active: schoolSubTopic === 'operator' }"
                  @click="handleSchoolSwitch('operator')"
                >
                  operator:type
                </button>
                <button
                  class="switch-btn"
                  :class="{ active: schoolSubTopic === 'isced' }"
                  @click="handleSchoolSwitch('isced')"
                >
                  {{ selectedTopic?.toLowerCase().startsWith('hospital') || selectedTopic?.toLowerCase().startsWith('healthcare') ? 'healthcare:speciality' : 'isced:level' }}
                </button>
              </div>
              <div class="plot-container" id="tag-treemap"></div>
            </div>

            <div class="image-box" id="tile6">
              <div class="tile6-split">
                <!-- Left Column: Selector, Banner, Map -->
                <div class="tile6-left">
                  <select
                    class="indicator-selector"
                    :value="map1Indicator"
                    @change="handleIndicatorChange(1, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="ind in indicators" :key="ind" :value="ind">
                      {{ prettifyIndicator(ind) }}
                    </option>
                  </select>
                  <div class="banner" style="padding:0;">
                    <div :style="[banner1Style, {
                      padding: '0.25rem 0.75rem',
                      fontWeight: 'bold',
                      fontSize: '0.875rem',
                      borderRadius: 'var(--border-radius)',
                      textAlign: 'center',
                      marginBottom: '0.75rem'
                    }]" class="banner-text">
                      {{ banner1Level }} {{ prettifyIndicator(map1Indicator) }}
                    </div>
                  </div>
                  <div class="box" style="position: relative; flex: 1; min-height: 0;">
                    <MetricMap
                      :key="'comparison-map-' + topicId"
                      containerId="road_comparison_map"
                      :pmtilesUrl="pmtilesUrl"
                      :lookup="map1Lookup"
                      :indicatorName="map1Indicator"
                      :bounds="bounds"
                      :layerName="map1Layer"
                      sourceName="grid_source"
                      :topicId="topicId"
                      :isCountIndicator="isNoQualityDescription(map1Description)"
                    />
                    <select
                      class="grid-selector"
                      :value="map1Layer"
                      @change="handleGridChange(1, ($event.target as HTMLSelectElement).value)"
                    >
                      <option v-if="isLayerAvailable(currentLayers.countryLevel)" :value="currentLayers.countryLevel">{{ currentLayers.countryLevelLabel }}</option>
                      <option v-if="isLayerAvailable(currentLayers.stateLevel)" :value="currentLayers.stateLevel">{{ currentLayers.stateLevelLabel }}</option>
                      <option v-if="isLayerAvailable(currentLayers.detailLevel)" :value="currentLayers.detailLevel">{{ currentLayers.detailLevelLabel }}</option>
                      <option v-if="isLayerAvailable(currentLayers.h3Level)" :value="currentLayers.h3Level">{{ currentLayers.h3LevelLabel }}</option>
                    </select>
                    <div class="legend">
                      <div>{{ prettifyIndicator(map1Indicator) }}</div>
                      <span style="background:#F44336;width:10px;height:10px;display:inline-block;"></span> 0–25%<br>
                      <span style="background:#FFEB3B;width:10px;height:10px;display:inline-block;"></span> 25–75%<br>
                      <span style="background:#4CAF50;width:10px;height:10px;display:inline-block;"></span> 75–100%
                    </div>
                  </div>
                </div>
                <!-- Right Column: Description, Plot -->
                <div class="tile6-right">
                  <div class="map-description">{{ map1Description }}</div>
                  <div class="plot-container" id="comparison-plot"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <ReportFooter :parquetDate="dataDate" />
  </div>
</template>

<style scoped>
/* ==========================================================================
   Redesigned single-map view (normal mode only). Everything below this
   block, further down this file, is the legacy layout still used by the
   untouched embed/iframe-2col mode - left alone on purpose.
   ========================================================================== */
.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.muted { color: var(--ink-faint); }

.hero {
  display: flex; gap: 1.25rem; align-items: stretch; flex-wrap: wrap;
  padding: 0.9rem 0 1.1rem;
}
/* flex-basis:100% forces .band/.readouts onto their own line below this,
   inside the same flex-wrap row rather than a separate grid row - keeps
   the banner from disturbing Split View's subgrid alignment. */
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

/* Split View: two columns side by side, each a full self-contained view -
   Single View is just this with one column. Each column has 3 top-level
   boxes (hero, mainview, detailview - Topic/Indicator selection lives inside
   mainview's map toolbar, not as a separate top-level box); in Split View,
   .view-column becomes a CSS subgrid sharing the parent's row tracks, so
   e.g. column A's "mainview" and column B's "mainview" always start at the
   same Y and take the same height (the taller one's content sets it, the
   shorter one just gets blank space below - no JS height-measuring needed).
   Falls back to plain flex stacking (no cross-column alignment, but nothing
   breaks) on browsers without subgrid support. */
.view-columns { display: flex; gap: 1.1rem; align-items: flex-start; }
.view-column { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 1.1rem; }

.view-columns--split {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  align-items: start;
}
.view-columns--split > .view-column {
  display: grid;
  grid-template-rows: subgrid;
  grid-row: span 3;
  gap: 1.1rem;
}
@media (max-width: 880px) {
  .view-columns--split { display: flex; flex-direction: column; }
  .view-columns--split > .view-column { display: flex; flex-direction: column; }
}

.topic-pills-row { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.topic-pills-row .pill {
  font-family: var(--font-body); border: 1px solid var(--line-strong); background: var(--paper-raised);
  color: var(--ink-soft); font-size: 0.85rem; font-weight: 600; padding: 0.4rem 0.85rem;
  transition: background 0.15s, color 0.15s, border-color 0.15s; border-radius: var(--radius);
}
.topic-pills-row .pill:hover { border-color: var(--accent); color: var(--ink); }
.topic-pills-row .pill.active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

.mainview { display: grid; grid-template-columns: 1.5fr 1fr; gap: 1.1rem; padding-bottom: 1.1rem; }
@media (max-width: 880px) { .mainview { grid-template-columns: 1fr; } }
/* Compare View's columns are already half-width - side-by-side map+cards
   within that would be too cramped, so everything just stacks instead,
   same as the narrow-viewport behavior above but forced regardless of the
   actual viewport width. */
.mainview.mainview--stacked { grid-template-columns: 1fr; }

.map-column { display: flex; flex-direction: column; gap: 1.1rem; }
/* align-self:start: without it, .mainview's grid (default align-items:
   stretch) stretches this column to match .map-column's height, leaving
   dead space below its last panel instead of ending where its own content
   does. */
.side-column { display: flex; flex-direction: column; gap: 1.1rem; align-self: start; }

.mappanel {
  background: var(--paper-raised); border: 1px solid var(--line); box-shadow: var(--shadow);
  display: flex; flex-direction: column; overflow: hidden; min-height: 560px; border-radius: var(--radius);
}
.map-toolbar {
  display: flex; align-items: center; justify-content: flex-start; gap: 0.6rem;
  padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--line); flex-wrap: wrap;
}
/* A small caption-style label directly beside the buttons it names, matching
   the "Country"/"Topic" label convention in the header - reads as "this
   label belongs to that control", not as a standalone section heading. */
.map-toolbar-label {
  font-family: var(--font-body); font-size: 0.68rem; text-transform: uppercase;
  letter-spacing: 0.07em; font-weight: 600; color: var(--ink-faint);
}
.layer-switch { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.layer-switch button {
  border: 1px solid var(--line-strong); background: transparent; color: var(--ink-soft);
  font-family: var(--font-body); font-size: 0.76rem; font-weight: 600; padding: 0.3rem 0.6rem;
  border-radius: var(--radius);
}
.layer-switch button.active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.layer-switch button:disabled { color: var(--disabled); border-style: dashed; cursor: not-allowed; }

.map-stage { position: relative; flex: 1; min-height: 460px; }
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
.plotpanel h3 {
  font-family: var(--font-body); font-size: 0.78rem; font-weight: 700;
  color: var(--ink-soft); text-transform: uppercase; letter-spacing: 0.06em;
  margin: 0 0 0.4rem;
}
.plotpanel .plot-container { height: 240px; width: 100%; }
.plot-unavailable {
  height: 240px; margin: 0; display: flex; align-items: center; justify-content: center;
  color: var(--ink-faint); font-size: 0.82rem; font-style: italic;
}

/* Every card - folded or expanded - stays exactly one column wide, so the
   2-column tile structure never breaks: an expanded card just grows taller
   in place instead of taking over the row, and grid auto-placement packs
   the rest around it with no leftover half-row gaps (which a "let expanded
   cards span both columns" version could leave behind, whenever a 1-wide
   card was immediately followed by one that spanned 2). align-items:start
   keeps a short folded card from stretching to match a taller neighbor
   sharing its row. Folding/unfolding a card is just a height change like
   any other data update - the grid reflows everything after it on its own,
   no JS needed.

   align-content:start matters here too: nested inside .side-column (a flex
   column, not this grid's direct parent), this grid's own auto-sized rows
   would otherwise still stretch to fill any extra height .side-column ends
   up with - the same "huge gaps between folded tiles" bug .side-column's
   own align-self:start is there to prevent one level up. */
.indicator-stack {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem;
  align-items: start; align-content: start;
}
@media (max-width: 640px) { .indicator-stack { grid-template-columns: 1fr; } }

.indicator-chip-row { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 0.5rem; }
.chip {
  display: inline-flex; align-items: center; gap: 0.45rem;
  font-family: var(--font-body); font-size: 0.82rem; font-weight: 600;
  color: var(--ink-soft); background: var(--paper-raised);
  border: 1px solid var(--line-strong); padding: 0.4rem 0.8rem;
  cursor: pointer; transition: border-color 0.15s, color 0.15s, background 0.15s;
  border-radius: var(--radius);
}
.chip:hover { border-color: var(--accent); color: var(--ink); }
.chip.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.chip-dot { width: 0.55rem; height: 0.55rem; border-radius: 50%; flex: none; }
.chip-dot.level-good { background: var(--good); }
.chip-dot.level-warn { background: var(--warn); }
.chip-dot.level-bad { background: var(--bad); }
.chip-dot.level-neutral { background: var(--ink-faint); }

.detailview { display: grid; grid-template-columns: 1.3fr 1fr; gap: 1.1rem; }
@media (max-width: 880px) { .detailview { grid-template-columns: 1fr; } }
.detailview.detailview--stacked { grid-template-columns: 1fr; }
.panel {
  background: var(--paper-raised); border: 1px solid var(--line); box-shadow: var(--shadow);
  border-radius: var(--radius);
  padding: 1rem 1.2rem 1.2rem;
  /* The treemap's own sizing (Plotly's `responsive` mode inside a plain
     block, not the flex column its CSS was originally written for) can
     render a hair taller/wider than this panel before .panel #tag-treemap
     below pins it down - clip defensively so it never visibly pokes out. */
  overflow: hidden;
}
.panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.35rem; flex-wrap: wrap; }
.panel-head h2 { font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: var(--ink); margin: 0; }
.panel-head .muted { font-size: 0.78rem; font-weight: 500; }

.grouping-toggle { display: flex; gap: 0.3rem; margin-bottom: 0.75rem; }
.grouping-toggle button {
  border: 1px solid var(--line-strong); background: transparent; color: var(--ink-soft);
  font-family: var(--font-body); font-size: 0.72rem; font-weight: 600; padding: 0.25rem 0.55rem;
  border-radius: var(--radius);
}
.grouping-toggle button.active { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.grouping-note { font-size: 0.8rem; color: var(--ink-faint); }

.bars { display: flex; flex-direction: column; gap: 0.8rem; }
.bar-row { display: grid; grid-template-columns: 9rem 1fr 3.2rem; align-items: center; gap: 0.6rem; }
.bar-label { font-size: 0.82rem; font-weight: 600; color: var(--ink); font-family: var(--font-body); }
.bar-track { height: 0.55rem; background: var(--line); position: relative; overflow: hidden; border-radius: var(--radius); }
.bar-fill { position: absolute; inset: 0 auto 0 0; }
.bar-fill.level-good { background: var(--good); }
.bar-fill.level-warn { background: var(--warn); }
.bar-fill.level-bad { background: var(--bad); }
.bar-pct { font-family: var(--font-mono); font-size: 0.82rem; text-align: right; color: var(--ink); }

/* .panel is a plain block, not the flex column #tag-treemap's legacy CSS
   (elsewhere in this file, shared with the untouched embed/iframe-2col
   mode) assumes - give it a real, explicit height here so Plotly renders
   into a known, bounded box instead of sizing itself unpredictably and
   sometimes ending up taller than the panel actually drew around it. */
.panel [id^="tag-treemap"] { height: 280px !important; }
.panel [id^="tag-treemap"] > div { height: 100% !important; }

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

.box-row {
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  padding: var(--spacing);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

.box-row.flexible {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing);
  height: 100%;
}

.box-row.flexible .grid {
  flex: 1;
  min-height: 0;
  flex-wrap: nowrap;
}

.box,
.image-box {
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.image-box .box {
  flex: 1;
  min-height: 150px;
}

.box-centered {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.box h3 {
  font-size: 2rem !important;
  font-weight: 700 !important;
  margin: 0;
  margin-top: 0rem;
  margin-bottom: 0rem;
  min-height: 2.4rem;
}

.box h4 {
  font-weight: 700 !important;
  margin: 0.25rem 0;
  margin-top: 0rem;
  margin-bottom: 0.25rem;
  font-size: 1rem !important;
  min-height: 1.2rem;
}

.tile-secondary h3 {
  font-size: 1.25rem !important;
  font-weight: 600 !important;
  color: #2C3038 !important;
  min-height: auto !important;
  margin-top: 0.5rem !important;
}

.tile-secondary h4 {
  font-size: 0.8rem !important;
  font-weight: 400 !important;
  color: #888 !important;
  min-height: auto !important;
  margin-bottom: 0.5rem !important;
}

.heigit-tile-link {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.heigit-tile-link:hover {
  background: #f3f3f3;
}

.heigit-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.heigit-logo img {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  margin-top: 0.5rem !important;
}

.tile-header {
  margin-top: 1rem;
  text-align: center;
  font-weight: 800;
  font-size: 1rem;
  margin-bottom: 1rem;
}

.box-row:not(.flexible) {
  padding: 0.25rem;
}

.box-row:not(.flexible) .tile-primary h3 {
  font-size: 1.5rem !important;
  min-height: 1.8rem !important;
  margin-top: 0.15rem !important;
}

.box-row:not(.flexible) .tile-primary h4 {
  font-size: 0.8rem !important;
  min-height: 0.9rem !important;
  margin: 0.1rem 0 !important;
}

.map-container {
  flex: 1 1 0;
  min-height: 150px;
  width: 100%;
  border-radius: var(--border-radius);
  overflow: hidden;
  position: relative;
}

.legend {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(255, 255, 255, 0.9);
  padding: 5px 6px;
  border-radius: 6px;
  border: 1px solid #aaa;
  font-size: 0.5rem;
  line-height: 1.2;
  z-index: 2;
}

.legend-title {
  font-weight: bold;
  margin-bottom: 2px;
}

.map-description {
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-card-bg);
  padding: 0.6rem;
  font-size: 0.75rem;
  line-height: 1.3;
  margin-top: 0.5rem;
  overflow-wrap: break-word;
  max-height: none;
  width: 95%;
  margin-left: auto;
  margin-right: auto;
  box-sizing: border-box;
}

.banner {
  padding: 0;
}

.indicator-selector {
  font-size: 0.8rem;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  border: 1px solid #aaa;
  background: rgba(255, 255, 255, 0.9);
  margin-bottom: 0.5rem;
  margin-top: 0.5rem;
}

.image-box .plot-container {
  flex: 1 1 0;
  /* A hard floor, not 0: letting this shrink to fit whatever space is left
     over from the map (image-box .box above) is what was squeezing charts
     down to <110px and forcing margins/legends to collide. The page itself
     scrolls (.page-content.flexible has overflow-y: auto), so it's safe to
     let the card grow taller on short viewports instead of cramming both
     the map and the chart into whatever height happens to be available. */
  min-height: 180px;
  width: 95%;
  margin-left: auto;
  margin-right: auto;
}

.plot-container > div {
  width: 100% !important;
  height: 100% !important;
  min-height: 150px;
}

#tile5 .plot-container {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  overflow: hidden;
}

#tag-treemap {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  width: 100% !important;
}

#tag-treemap > div {
  width: 100% !important;
  height: 100% !important;
}

.bar-chart-container {
  width: 95%;
  margin-left: auto;
  margin-right: auto;
}

.box-row.flexible .image-box:not(#tile5) > *,
.box-row.flexible .image-box:not(#tile5) .box,
.box-row.flexible .image-box:not(#tile5) .map-description,
.box-row.flexible .image-box:not(#tile5) .plot-container {
  width: 95%;
  margin-left: auto;
  margin-right: auto;
}

.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.bar-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bar-item .label {
  width: 60px;
  font-size: 0.75rem;
}

.bar-container {
  flex: 1;
  background: #e1e0e1;
  border-radius: 4px;
  overflow: hidden;
  height: 12px;
  position: relative;
}

.bar-container .bar {
  height: 100%;
  background: #4CAF50;
  text-align: right;
  font-size: 0.65rem;
  color: white;
  line-height: 12px;
  padding-right: 2px;
}

.bar-item .value {
  width: 50px;
  font-size: 0.75rem;
  text-align: right;
}

.grid-selector {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 3;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #aaa;
  border-radius: 6px;
  font-size: 0.7rem;
  padding: 2px 4px;
}

.switch-btn {
  flex: 1;
  font-family: var(--font-sans);
  font-size: 0.75rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--color-border);
  background: #fafafa;
  cursor: pointer;
  color: var(--color-text);
  transition: all 0.2s ease;
  font-weight: 400;
}

.switch-btn:first-child {
  border-radius: 6px 0 0 6px;
  border-right: none;
}

.switch-btn:last-child {
  border-radius: 0 6px 6px 0;
}

.switch-btn.active {
  background: #eee;
  border-color: #aaa;
  font-weight: 800;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}

.switch-btn:hover:not(.active) {
  background: #f0f0f0;
}

@media (max-width: 768px) {
  .page-content.flexible {
    overflow-y: auto;
    overflow-x: hidden;
  }

  .box-row {
    min-width: 0;
    flex: none;
  }

  .grid {
    flex-direction: column;
    height: auto;
  }

  .box-row.flexible .grid {
    flex-direction: column;
    height: auto;
  }

  .box-row:not(.flexible) .grid {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .box-row:not(.flexible) .box {
    min-height: 60px;
    flex: none;
  }

  .box,
  .image-box {
    min-width: 280px;
    min-height: auto;
    overflow: visible;
  }

  .image-box {
    display: flex;
    flex-direction: column;
  }

  .image-box > .box {
    height: 350px;
    min-height: 350px;
    flex: none;
  }

  .map-container {
    min-height: 350px;
    height: 350px;
    width: 100%;
    flex: none;
    overflow: hidden;
  }

  .map-container > div {
    width: 100% !important;
    height: 350px !important;
  }

  .box h3 {
    font-size: 1.25rem !important;
    min-height: 1.5rem;
    margin-top: 0.25rem;
  }

  .box h4 {
    font-size: 0.75rem !important;
    min-height: 1rem;
    margin: 0.25rem 0;
  }

  .tile-header {
    font-size: 0.875rem !important;
  }

  .box-row.flexible {
    flex: none;
    min-height: auto;
  }

  #tag-treemap {
    height: 300px !important;
    min-height: 300px !important;
  }

  #tag-treemap > div {
    height: 300px !important;
    min-height: 300px !important;
  }

  .plot-container {
    height: 250px !important;
    min-height: 250px !important;
    flex: none;
  }

  .plot-container > div {
    height: 250px !important;
    min-height: 250px !important;
  }

  .map-description {
    min-height: 50px;
  }

  .mobile-hidden {
    display: none !important;
  }

  #tile5 {
    order: 1;
  }

  .box-row.flexible .image-box:not(#tile5) {
    order: 0;
  }
}

/* Embed mode styles for HDX integration - compact multi-column layout */
.embed-mode {
  padding: 0.25rem !important;
  gap: 0.25rem !important;
}

/* Keep multi-column layout but make it compact */
.embed-mode .box-row.flexible .grid {
  flex-wrap: nowrap !important;
  height: auto !important;
  gap: 0.25rem !important;
}

.embed-mode .image-box {
  flex: 1 1 0 !important;
  min-width: 0 !important;
}

/* Embed mode header — stay on one row */
.embed-mode header {
  flex-direction: row !important;
  flex-wrap: nowrap !important;
}

.embed-mode :deep(.header-title) {
  width: auto !important;
}

.embed-mode :deep(.header-selectors) {
  gap: 1rem !important;
  flex-direction: row !important;
  width: auto !important;
}

.embed-mode :deep(.selector-group.horizontal label) {
  font-size: 0.85rem !important;
}

.embed-mode :deep(.country-select) {
  font-size: 0.8rem !important;
}

/* Smaller footer in embed mode */
.embed-mode footer {
  padding: 0.1rem 0.3rem !important;
  font-size: 5rem !important;
  gap: 0.25rem !important;
}

.embed-mode .footer-btn {
  padding: 0.1rem 0.2rem !important;
  font-size: 0.6rem !important;
}

.embed-mode .ohsome-link img {
  height: 15px !important;
}

/* Compact tiles */
.embed-mode .box h3 {
  font-size: 1rem !important;
  min-height: 1.2rem !important;
  margin-top: 0.15rem !important;
  margin-bottom: 0.1rem !important;
}

.embed-mode .box h4 {
  font-size: 0.65rem !important;
  min-height: 0.8rem !important;
  margin: 0.1rem 0 !important;
}

.embed-mode .tile-secondary h3 {
  font-size: 0.8rem !important;
}

/* Smaller maps - ensure they're visible */
.embed-mode .map-container {
  min-height: 140px !important;
  flex: 1 1 140px !important;
}

.embed-mode .image-box > .box {
  min-height: 150px !important;
  flex: 1 1 150px !important;
}

/* Smaller plots */
.embed-mode .image-box .plot-container {
  min-height: 100px !important;
  flex: 1 1 100px !important;
}

.embed-mode .plot-container > div {
  min-height: 100px !important;
}

/* Compact text elements */
.embed-mode .tile-header {
  font-size: 0.7rem !important;
  margin-top: 0.2rem !important;
  margin-bottom: 0.2rem !important;
}

.embed-mode .map-description {
  font-size: 0.55rem !important;
  padding: 0.2rem !important;
  margin-top: 0.15rem !important;
  line-height: 1.1 !important;
}

.embed-mode .indicator-selector,
.embed-mode .grid-selector {
  font-size: 0.55rem !important;
  padding: 0.1rem 0.2rem !important;
  margin-bottom: 0.2rem !important;
  margin-top: 0.2rem !important;
}

.embed-mode .legend {
  font-size: 0.35rem !important;
  padding: 1px 2px !important;
  line-height: 1 !important;
}

.embed-mode .bar-item .label,
.embed-mode .bar-item .value {
  font-size: 0.55rem !important;
}

.embed-mode .bar-container {
  height: 6px !important;
}

.embed-mode .bar-chart {
  gap: 0.2rem !important;
  margin-top: 0.2rem !important;
}

.embed-mode .switch-btn {
  font-size: 0.55rem !important;
  padding: 0.15rem 0.25rem !important;
}

/* Make treemap tile header more compact */
.embed-mode #tile5 .tile-header {
  margin-top: 0.2rem !important;
  margin-bottom: 0.2rem !important;
}

/* Reduce margin for school switch in embed mode */
.embed-mode #school-treemap-switch {
  margin: 1.5rem auto -1rem auto !important;
}

.embed-mode #tag-treemap {
  min-height: 150px !important;
  flex: 1 1 150px !important;
}

/* Make page content fit without scrolling in embed mode */
.embed-mode .page-content.flexible {
  overflow: hidden !important;
  flex: 1 1 auto !important;
}

/* Make stat boxes row more compact in embed mode */
.embed-mode .box-row:not(.flexible) {
  padding: 0.1rem !important;
}

.embed-mode .box-row:not(.flexible) .box h3 {
  font-size: 0.8rem !important;
  min-height: 1rem !important;
  margin-top: 0.1rem !important;
  margin-bottom: 0 !important;
}

.embed-mode .box-row:not(.flexible) .box h4 {
  font-size: 0.6rem !important;
  min-height: 0.7rem !important;
  margin: 0.05rem 0 !important;
}

/* Ensure tile 5 is visible */
.embed-mode #tile5 {
  min-height: 160px !important;
}

/* Smaller HeiGIT logo in embed mode */
.embed-mode .heigit-tile-link img {
  width: 100px !important;
  height: auto !important;
}

/* Smaller banner text in embed mode */
.embed-mode .banner-text {
  font-size: 0.65rem !important;
  padding: 0.1rem 0.4rem !important;
}

.embed-mode .banner {
  margin-bottom: 0.25rem !important;
}

/* Very narrow embed containers - stack everything vertically */
@media (max-width: 600px) {
  .embed-mode .box-row.flexible .grid {
    flex-direction: column !important;
    flex-wrap: wrap !important;
  }
  
  .embed-mode .image-box {
    width: 100% !important;
    min-width: unset !important;
  }
  
  .embed-mode .map-container {
    min-height: 250px !important;
  }
  
  .embed-mode .plot-container {
    min-height: 180px !important;
  }
}

/* iframe-2col mode: 2-column layout with tile 5 and tile 6 */
.iframe-2col-grid .grid {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  gap: 0.25rem !important;
  height: 100% !important;
}

.iframe-2col-grid .grid > #tile5 {
  flex: 1 1 0 !important; /* 1/3 width */
  min-width: 0 !important;
}

.iframe-2col-grid .grid > #tile6 {
  flex: 2 1 0 !important; /* 2/3 width */
  min-width: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.iframe-2col-grid .image-box > .box {
  min-height: 150px !important;
  flex: 1 1 150px !important;
}

.iframe-2col-grid #tag-treemap {
  min-height: 150px !important;
  flex: 1 1 150px !important;
  margin-top: -2rem !important;

}

.iframe-2col-grid .plot-container {
  min-height: 100px !important;
  flex: 1 1 100px !important;
}

.iframe-2col-grid .plot-container > div {
  min-height: 100px !important;
}

.iframe-2col-grid .map-description {
  font-size: 0.55rem !important;
  padding: 0.2rem !important;
  margin-top: 0.15rem !important;
  line-height: 1.1 !important;
}

.iframe-2col-grid .tile-header {
  font-size: 0.85rem !important;
  margin-top: 2rem !important;
  margin-bottom: -2rem !important;
}

.iframe-2col-grid .indicator-selector,
.iframe-2col-grid .grid-selector {
  font-size: 0.7rem !important;
  padding: 0.15rem 0.3rem !important;
  margin-bottom: 0.3rem !important;
  margin-top: 0.3rem !important;
}

.iframe-2col-grid .legend {
  font-size: 0.5rem !important;
  padding: 2px 4px !important;
  line-height: 1.1 !important;
}

.iframe-2col-grid .bar-item .label,
.iframe-2col-grid .bar-item .value {
  font-size: 0.7rem !important;
}

.iframe-2col-grid .bar-container {
  height: 6px !important;
}

.iframe-2col-grid .bar-chart {
  gap: 0.2rem !important;
  margin-top: 0.2rem !important;
  margin-bottom: 2rem !important;
}

.iframe-2col-grid .switch-btn {
  font-size: 0.7rem !important;
  padding: 0.2rem 0.3rem !important;
}

.iframe-2col-grid .banner-text {
  font-size: 0.75rem !important;
  padding: 0.15rem 0.5rem !important;
}

.iframe-2col-grid .banner {
  margin-bottom: 0.25rem !important;
}

/* Tile 6 split layout: left (selector/banner/map) and right (description/plot) */
.iframe-2col-grid .tile6-split {
  display: flex !important;
  flex-direction: row !important;
  gap: 0.25rem !important;
  flex: 1 1 auto !important;
  min-height: 0 !important;
  height: 100% !important;
  overflow: hidden !important;
}

.iframe-2col-grid .tile6-left {
  flex: 1 1 50% !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 0.25rem !important;
  min-height: 0 !important;
  overflow: hidden !important;
  margin-top: 0.5rem !important;
}

.iframe-2col-grid .tile6-right {
  flex: 1 1 50% !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 0.25rem !important;
  min-height: 0 !important;
  overflow: hidden !important;
  margin-top: 0.5rem !important;
}

.iframe-2col-grid .tile6-left .box {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
  margin-bottom: 1rem !important;
  width: 100% !important;
}

.iframe-2col-grid .tile6-left .box > div:first-child {
  height: 100% !important;
  width: 100% !important;
}

.iframe-2col-grid .tile6-right .map-description {
  flex: 0 0 auto !important;
  max-height: 45% !important;
  overflow-y: auto !important;
  font-size: 0.75rem !important;
  padding: 0.3rem !important;
  line-height: 1.3 !important;
}

.iframe-2col-grid .tile6-right .plot-container {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

/* Ensure iframe-2col mode fits well in iframe */
.iframe-2col-grid {
  overflow: hidden !important;
  flex: 1 1 auto !important;
}

/* Ensure iframe-2col mode fits well in iframe */
.iframe-2col-grid {
  overflow: hidden !important;
  flex:1 1 auto !important;
}

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
