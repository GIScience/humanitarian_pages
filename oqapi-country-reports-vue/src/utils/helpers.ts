export function prettifyTopic(slug: string): string {
  if (!slug) return "";
  return slug
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function prettifyIndicator(name: string): string {
  if (!name) return "";
  return name
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface TopicConfig {
  comparisonIndicator: string;
  comparisonLabel: string;
  currentnessLabel: string;
  completenessIndicator: string;
  completenessLabel: string;
  completenessFigure: string;
}

export const topicConfig: Record<string, TopicConfig> = {
  "roads": {
    comparisonIndicator: "roads-thematic-accuracy",
    comparisonLabel: "Road Completeness",
    currentnessLabel: "Road Currentness",
    completenessIndicator: "attribute-completeness_surface",
    completenessLabel: "Attribute Completeness",
    completenessFigure: "attribute-completeness_surface"
  },
  "buildings": {
    comparisonIndicator: "building-comparison",
    comparisonLabel: "Building Completeness",
    currentnessLabel: "Building Currentness",
    completenessIndicator: "user-activity",
    completenessLabel: "User Activity",
    completenessFigure: "user-activity"
  },
  "land-cover": {
    comparisonIndicator: "land-cover-thematic-accuracy",
    comparisonLabel: "Land Cover Thematic Accuracy",
    currentnessLabel: "Land Cover Currentness",
    completenessIndicator: "land-cover-completeness",
    completenessLabel: "Land Cover Completeness",
    completenessFigure: "land-cover-completeness"
  },
  // Schools/hospitals have no reference-dataset comparison indicator at all -
  // mapping-saturation (how mature the mapping is) is the closest available
  // stand-in, rather than falling back to whatever indicator happens to load
  // first (which collapsed onto "currentness", showing the same card twice).
  "schools": {
    comparisonIndicator: "mapping-saturation",
    comparisonLabel: "Mapping Saturation",
    currentnessLabel: "School Currentness",
    completenessIndicator: "attribute-completeness_name",
    completenessLabel: "Attribute Completeness",
    completenessFigure: "attribute-completeness_name"
  },
  "hospitals": {
    comparisonIndicator: "mapping-saturation",
    comparisonLabel: "Mapping Saturation",
    currentnessLabel: "Hospital Currentness",
    completenessIndicator: "attribute-completeness_emergency",
    completenessLabel: "Attribute Completeness",
    completenessFigure: "attribute-completeness_emergency"
  }
};

let currentSchoolSubTopic = "operator";

export function getCurrentSchoolSubTopic(): string {
  return currentSchoolSubTopic;
}

export function setCurrentSchoolSubTopic(subTopic: string): void {
  currentSchoolSubTopic = subTopic;
}

/**
 * Which tag-distribution grouping_key to query for a given topic (and, for
 * schools/hospitals, the currently selected sub-topic toggle). This is a query
 * parameter now, not a file-naming key - the tag-distribution parquet covers
 * every topic/grouping_key/measure combination in one file per (country, layer).
 */
export function getTagGroupingKey(topic: string): string {
  if (!topic) return "";
  const topicLower = topic.toLowerCase();

  if (topicLower.startsWith("road")) return "highway";
  if (topicLower.startsWith("building")) return "building";
  if (topicLower.startsWith("land-cover") || topicLower.startsWith("land")) return "landuse";

  if (topicLower.startsWith("school")) {
    return currentSchoolSubTopic === "isced" ? "isced:level" : "operator:type";
  }

  if (topicLower.startsWith("hospital") || topicLower.startsWith("healthcare-primary")) {
    return currentSchoolSubTopic === "isced" ? "healthcare:speciality" : "operator:type";
  }

  return "";
}

/**
 * Per-country layer names. Most countries' boundaries come from geoBoundaries
 * (adm0/adm1/h3); Germany's come from BKG instead, with its own level names.
 * "countryLevel" is the single whole-country polygon layer (treemap, tag
 * coverage, gauge figures, and indicator descriptions all come from here,
 * independent of whichever grid layer a map is currently showing).
 * "detailLevel" is the finer sub-national layer used as the default map grid.
 */
export interface CountryLayers {
  countryLevel: string;
  countryLevelLabel: string;
  // Optional extra granularity between countryLevel and detailLevel - only
  // Germany has this today (Bundesländer, between the whole-country and
  // Kreis layers), so it's undefined everywhere else.
  stateLevel?: string;
  stateLevelLabel?: string;
  detailLevel: string;
  detailLevelLabel: string;
  h3Level: string;
  h3LevelLabel: string;
}

const DEFAULT_LAYERS: CountryLayers = {
  countryLevel: "adm0",
  countryLevelLabel: "Admin 0",
  detailLevel: "adm1",
  detailLevelLabel: "Admin 1",
  h3Level: "h3",
  h3LevelLabel: "Hexagonal Grid"
};
const COUNTRY_LAYER_OVERRIDES: Record<string, CountryLayers> = {
  DEU: {
    countryLevel: "vg2500_sta",
    countryLevelLabel: "Germany",
    stateLevel: "vg2500_lan",
    stateLevelLabel: "States",
    detailLevel: "vg1000_krs",
    detailLevelLabel: "Districts",
    h3Level: "h3",
    h3LevelLabel: "Hexagonal Grid"
  }
};

export function getCountryLayers(code: string): CountryLayers {
  return COUNTRY_LAYER_OVERRIDES[code] || DEFAULT_LAYERS;
}

export interface BuildUrlsResult {
  pmtilesUrl: string;
  parquetUrl: string;
  tagDistributionUrl: string;
}

/** URLs for one (country, layer) pair - the pmtiles file is shared across all layers of a country. */
export function buildUrls(code: string, layer: string): BuildUrlsResult {
  return {
    pmtilesUrl: `https://hot.storage.heigit.org/heigit-hdx-public/ohsome-quality-country-reports/${code}/${code}_boundaries.pmtiles`,
    parquetUrl: `https://hot.storage.heigit.org/heigit-hdx-public/ohsome-quality-country-reports/${code}/${code}_${layer}_long.parquet`,
    tagDistributionUrl: `https://hot.storage.heigit.org/heigit-hdx-public/ohsome-quality-country-reports/${code}/${code}_${layer}_tag_distribution.parquet`
  };
}
