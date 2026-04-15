import { initDuckDB, registerParquetFile } from "../utils/duckdb";

export interface Country {
  code: string;
  name: string;
}

export async function fetchAvailableCountries(): Promise<Country[]> {
  const yamlUrl = "https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/countries/countries.yaml";

  let countryYamlData: Record<string, any> = {};

  try {
    const respYaml = await fetch(yamlUrl);
    const textYaml = await respYaml.text();
    const yamlModule = await import("js-yaml");
    countryYamlData = yamlModule.load(textYaml) as Record<string, any>;
  } catch (e) {
    console.warn("Could not load YAML, using fallback");
  }

  const countryExceptions: Record<string, string> = {
    "cote-d-ivoire": "Côte d'Ivoire",
    "sri-lanka": "Sri Lanka",
    "united-arab-emirates": "United Arab Emirates",
    "sao-tome-and-principle": "São Tomé and Príncipe",
    "bahamas": "The Bahamas",
    "gambia": "The Gambia",
    "congo-brazzaville": "Congo (Brazzaville)",
    "congo-kinshasa": "Congo (Kinshasa)"
  };

  function prettifySlug(slug: string): string {
    if (!slug) return "";
    if (countryExceptions[slug]) return countryExceptions[slug];
    return slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  const urlS3 = "https://hot.storage.heigit.org/heigit-hdx-public?list-type=2&delimiter=/&prefix=oqapi_hdx/downloads/";
  const resS3 = await fetch(urlS3);
  const textS3 = await resS3.text();
  const xml = new DOMParser().parseFromString(textS3, "application/xml");

  const prefixes = [...xml.querySelectorAll("CommonPrefixes > Prefix")]
    .map((el) => el.textContent?.replace("oqapi_hdx/downloads/", "").replace("/", "") || "")
    .filter(Boolean);

  const countries = prefixes
    .map((code) => {
      const rawSlug = countryYamlData[code]?.slug || code;
      return { code, name: prettifySlug(rawSlug) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return countries;
}

function toArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (typeof result.toArray === 'function') return result.toArray();
  if (typeof result.map === 'function') return result.map((x: any) => x);
  return [];
}

export async function loadAvailableTopics(parquetUrl: string): Promise<string[]> {
  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);

    const schema = await conn.query(`DESCRIBE SELECT * FROM read_parquet('${tableName}')`);
    const schemaArray = toArray(schema);
    const cols = schemaArray.map((r: any) => r.column_name);

    const topicCol = cols.includes("topic")
      ? "topic"
      : cols.includes("topic_name")
        ? "topic_name"
        : null;

    if (!topicCol) return [];

    const result = await conn.query(`
      SELECT DISTINCT ${topicCol} AS topic
      FROM read_parquet('${tableName}')
      ORDER BY ${topicCol}
    `);

    const resultArray = toArray(result);
    return resultArray.map((r: any) => r.topic).filter(Boolean);
  } catch (e) {
    console.error("Failed to load topics:", e);
    return [];
  }
}

export async function loadIndicators(parquetUrl: string, topicName: string): Promise<string[]> {
  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);

    const schema = await conn.query(`DESCRIBE SELECT * FROM read_parquet('${tableName}')`);
    const schemaArray = toArray(schema);
    const cols = schemaArray.map((r: any) => r.column_name);

    const topicCol = cols.includes("topic")
      ? "topic"
      : cols.includes("topic_name")
        ? "topic_name"
        : null;

    const indicatorCol = cols.includes("indicator")
      ? "indicator"
      : cols.includes("Indicator")
        ? "Indicator"
        : null;

    if (!topicCol || !indicatorCol) {
      console.warn("No topic or indicator column found in parquet");
      return [];
    }

    const topics = [topicName];

    const topicFilter = topics
      .map((t) => `lower(trim(${topicCol})) = '${t.toLowerCase()}'`)
      .join(" OR ");

    const result = await conn.query(`
      SELECT DISTINCT ${indicatorCol} AS indicator
      FROM read_parquet('${tableName}')
      WHERE ${topicFilter}
      ORDER BY ${indicatorCol}
    `);

    const resultArray = toArray(result);
    return resultArray.map((r: any) => r.indicator).filter(Boolean);
  } catch (e) {
    console.error("Failed to load indicators:", e);
    return [];
  }
}

export interface IndicatorLookup {
  lookup: Record<string, number>;
  avg: number;
  description: string;
}

export async function loadIndicatorLookup(
  parquetUrl: string,
  topicName: string,
  indicatorName: string
): Promise<IndicatorLookup> {
  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);

    const topics = [topicName];

    const topicFilter = topics.map((t) => `topic = '${t}'`).join(" OR ");

    const result = await conn.query(`
      SELECT *
      FROM read_parquet('${tableName}')
      WHERE (${topicFilter})
        AND indicator = '${indicatorName}'
    `);

    const resultArray = toArray(result);
    const lookup: Record<string, number> = {};
    let sum = 0;
    let count = 0;
    let adm0Description = "";

    resultArray.forEach((r: any) => {
      const value = Number(r.value);
      const geomID = String(r.geomID);

      lookup[geomID] = value;

      if (geomID.includes("_")) {
        const parts = geomID.split("_");
        const suffix = parts[parts.length - 1];
        if (suffix && suffix.length > 0) {
          lookup[suffix] = value;
        }
      }

      if (!isNaN(value)) {
        sum += value;
        count++;
      }

      if (geomID.toLowerCase().includes("adm0") && r.description) {
        adm0Description = r.description;
      }
    });

    const avg = count > 0 ? sum / count : 0;

    return { lookup, avg, description: adm0Description };
  } catch (e) {
    console.error("Failed to load indicator lookup:", e);
    return { lookup: {}, avg: 0, description: "" };
  }
}

export interface PMTilesBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export async function getPMTilesBounds(url: string): Promise<PMTilesBounds | null> {
  try {
    if (typeof window.pmtiles === 'undefined') {
      console.error('PMTiles not loaded');
      return null;
    }
    const pmtilesFile = new window.pmtiles.PMTiles(url);
    const metadata = await pmtilesFile.getMetadata();
    const boundsStr = metadata.bounds || metadata.antimeridian_adjusted_bounds;
    if (!boundsStr) return null;
    const [minLon, minLat, maxLon, maxLat] = boundsStr.split(",").map(Number);
    return { minLon, minLat, maxLon, maxLat };
  } catch (e) {
    console.error("Failed to get PMTiles bounds:", e);
    return null;
  }
}

export interface TagCoverageItem {
  indicator: string;
  value: number;
}

export async function loadTagCoverage(parquetUrl: string): Promise<TagCoverageItem[]> {
  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);

    const query = `
      SELECT indicator, value
      FROM read_parquet('${tableName}')
      WHERE geomID LIKE '%adm0%'
        AND indicator LIKE 'attribute-completeness_%'
    `;

    const result = await conn.query(query);
    const resultArray = toArray(result);

    const lookup: Record<string, number> = {};
    resultArray.forEach((r: any) => {
      lookup[r.indicator] = Number(r.value) || 0;
    });

    const sortedIndicators = Object.entries(lookup)
      .sort((a, b) => b[1] - a[1]);

    return sortedIndicators.map(([indicator, value]) => ({ indicator, value }));
  } catch (e) {
    console.error("Failed to load tag coverage:", e);
    return [];
  }
}
