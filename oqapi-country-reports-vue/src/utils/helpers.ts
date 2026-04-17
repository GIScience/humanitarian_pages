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

export interface CountryInfo {
  code: string;
  name: string;
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
  "roads-all-highways": {
    comparisonIndicator: "road-comparison",
    comparisonLabel: "Road Completeness",
    currentnessLabel: "Road Currentness",
    completenessIndicator: "attribute-completeness_surface",
    completenessLabel: "Attribute Completeness",
    completenessFigure: "attribute-completeness_surface"
  },
  "building-area": {
    comparisonIndicator: "building-comparison",
    comparisonLabel: "Building Completeness",
    currentnessLabel: "Building Currentness",
    completenessIndicator: "user-activity",
    completenessLabel: "User Activity",
    completenessFigure: "user-activity"
  }
};

export const defaultIndicators: Record<string, { tile6: string; tile7: string; tile8: string }> = {
  "roads-all-highways": {
    tile6: "road-comparison",
    tile7: "currentness",
    tile8: "attribute-completeness_surface"
  },
  "building-area": {
    tile6: "building-comparison",
    tile7: "currentness",
    tile8: "user-activity"
  }
};

let currentSchoolSubTopic = "operator";

export function getCurrentSchoolSubTopic(): string {
  return currentSchoolSubTopic;
}

export function setCurrentSchoolSubTopic(subTopic: string): void {
  currentSchoolSubTopic = subTopic;
}

export function getTreemapTopic(topic: string): string {
  if (!topic) return "";
  const topicLower = topic.toLowerCase();

  if (topicLower.startsWith("roads")) return "highway";

  if (topicLower.startsWith("school")) {
    return "school_" + currentSchoolSubTopic;
  }

  if (topicLower.startsWith("hospital")) {
    const sub = currentSchoolSubTopic === "isced" ? "speciality" : "operator";
    return "hospital_" + sub;
  }

  if (topicLower.startsWith("healthcare-primary")) {
    const sub = currentSchoolSubTopic === "isced" ? "speciality" : "operator";
    return "healthcare-primary_" + sub;
  }

  const topicMain = topic.split("-")[0].toLowerCase();
  return topicMain;
}

export function getFigureTopic(topic: string): string {
  const topicLower = topic.toLowerCase();
  if (topicLower.startsWith("hospital")) return "hospitals";
  if (topicLower.startsWith("school")) return "school";
  return topic || "";
}

export interface BuildUrlsResult {
  pmtilesUrl: string;
  parquetUrl: string;
  treemapUrl: string;
  countUrl: string;
  figureBase: string;
}

export function buildUrls(code: string, topic: string): BuildUrlsResult {
  const distributionKey = getTreemapTopic(topic);
  let countKey = distributionKey;

  const topicLower = topic.toLowerCase();
  if (topicLower.startsWith("hospital")) {
    countKey = "hospital_count";
  } else if (topicLower.startsWith("healthcare-primary")) {
    countKey = "healthcare-primary_count";
  } else if (topicLower.startsWith("school")) {
    countKey = "school_isced";
  }

  return {
    pmtilesUrl: `https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/downloads/${code}/${code}_boundaries.pmtiles`,
    parquetUrl: `https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/downloads/${code}/${code}_long.parquet`,
    treemapUrl: `https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/osm_stats/${code}/${code}_${distributionKey}_tag_distribution.json.gz`,
    countUrl: `https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/osm_stats/${code}/${code}_${countKey}_tag_distribution.json.gz`,
    figureBase: `https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/figures/${code}`
  };
}

export function getTopicsForQuery(topic: string): string[] {
  return [topic];
}
