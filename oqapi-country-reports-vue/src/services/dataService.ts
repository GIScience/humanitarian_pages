import { initDuckDB, registerParquetFile, runQuery } from "../utils/duckdb";
import { PMTiles } from "pmtiles";
import { CANDIDATE_COUNTRIES } from "../config/countries";

export interface Country {
  code: string;
  name: string;
}

// The pipeline writes this exact sentinel into `value`/`quality_class`
// columns for a region it couldn't compute an indicator for, rather than
// leaving the cell null - treated the same as null everywhere a value or
// quality_class is read, so a boundary with no real data is excluded from
// lookups/averages the same way either representation would be.
const NO_DATA_VALUE = -999;
function isNoDataValue(v: unknown): boolean {
  return v == null || Number(v) === NO_DATA_VALUE;
}

/** Cheap existence check for any file this app reads from S3 - a plain HEAD
 * request, no listing permission needed. Used both for one layer's parquet
 * file (not every grid layer has been processed for every country yet, and
 * selecting one that isn't just leaves the map flat gray with no indication
 * why) and, in fetchAvailableCountries() below, for a candidate country's
 * boundaries file. */
export async function checkParquetExists(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: "HEAD" });
    return resp.ok;
  } catch {
    return false;
  }
}

async function loadCountryYaml(): Promise<Record<string, any>> {
  const yamlUrl = "https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/countries/countries.yaml";
  try {
    const respYaml = await fetch(yamlUrl);
    const textYaml = await respYaml.text();
    const yamlModule = await import("js-yaml");
    return yamlModule.load(textYaml) as Record<string, any>;
  } catch (e) {
    console.warn("Could not load YAML, using fallback");
    return {};
  }
}

export async function fetchAvailableCountries(): Promise<Country[]> {
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

  // The display-name YAML and the per-country existence checks are
  // independent network calls - run them together instead of making the
  // existence checks (which gate the very first map render) wait behind the
  // YAML fetch and its dynamic js-yaml import.
  const [countryYamlData, existenceChecks] = await Promise.all([
    loadCountryYaml(),
    // Checking each maintained candidate directly (see config/countries.ts)
    // instead of listing the bucket: a HEAD request needs no special S3
    // permission, unlike the ListBucket call a bucket listing would need.
    Promise.all(
      CANDIDATE_COUNTRIES.map(async (code) => {
        const url = `https://hot.storage.heigit.org/heigit-hdx-public/ohsome-quality-country-reports/${code}/${code}_boundaries.pmtiles`;
        return (await checkParquetExists(url)) ? code : null;
      })
    )
  ]);

  const countries = existenceChecks
    .filter((code): code is string => code !== null)
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

    const schema = await runQuery(conn,`DESCRIBE SELECT * FROM read_parquet('${tableName}')`);
    const schemaArray = toArray(schema);
    const cols = schemaArray.map((r: any) => r.column_name);

    const topicCol = cols.includes("topic")
      ? "topic"
      : cols.includes("topic_name")
        ? "topic_name"
        : null;

    if (!topicCol) return [];

    const result = await runQuery(conn,`
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

    const schema = await runQuery(conn,`DESCRIBE SELECT * FROM read_parquet('${tableName}')`);
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

    const result = await runQuery(conn,`
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
  // Same shape as `lookup`, keyed off the pipeline's own discretized
  // 1-5 quality_class column instead of the raw `value`. Only mapping-
  // saturation's map coloring uses this today (its raw value can exceed
  // 1.0 - a saturated area can "overshoot" 100% - which the fixed
  // 0/25/75% color steps don't handle meaningfully); every other
  // indicator ignores this field. A region missing a quality_class value
  // (null in the source data) is simply absent from this lookup, same
  // convention as `lookup`.
  qualityClassLookup: Record<string, number>;
  avg: number;
  // Average of quality_class across every matched row - for a country-level
  // (single-feature) parquet this is just that one row's own class, not a
  // mean across many regions. null if no row had a quality_class value.
  qualityClassAvg: number | null;
  description: string;
  // True as soon as at least one boundary in this layer has a real (non
  // -999/null) value - false means every single boundary came back with no
  // data, which is the "disable this indicator, nothing to show" case
  // rather than a boundary-by-boundary gap (those still just render grey,
  // see `lookup`).
  hasData: boolean;
}

export interface RegionIndicatorValue {
  value: number;
  description: string;
  qualityClass: number | null;
  // False when this region's own row is missing or holds the pipeline's
  // -999 "not computed" sentinel - `value` is meaningless (0) in that case,
  // not a genuine zero reading.
  hasData: boolean;
}

/**
 * Same (topic, indicator) values loadIndicatorLookups reads for the whole
 * layer, but scoped down to one region's own row - used to make the
 * indicator cards/chips, attribute-completeness bars and hero band reflect
 * a clicked map polygon instead of the country-wide average.
 */
export async function loadRegionIndicatorValues(
  parquetUrl: string,
  topic: string,
  geomId: string,
  indicatorNames: string[]
): Promise<Record<string, RegionIndicatorValue>> {
  if (indicatorNames.length === 0) return {};

  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);
    const indicatorFilter = indicatorNames.map(n => `'${n}'`).join(", ");

    const result = await runQuery(conn, `
      SELECT indicator, value, quality_class, description
      FROM read_parquet('${tableName}')
      WHERE topic = '${topic}' AND geomID = '${geomId}' AND indicator IN (${indicatorFilter})
    `);

    const resultArray = toArray(result);
    const out: Record<string, RegionIndicatorValue> = {};
    resultArray.forEach((r: any) => {
      out[String(r.indicator)] = {
        value: isNoDataValue(r.value) ? 0 : Number(r.value),
        qualityClass: isNoDataValue(r.quality_class) ? null : Number(r.quality_class),
        description: r.description || '',
        hasData: !isNoDataValue(r.value)
      };
    });
    return out;
  } catch (e) {
    console.error("Failed to load region indicator values:", e);
    return {};
  }
}

export async function loadIndicatorLookups(
  parquetUrl: string,
  topicName: string,
  indicatorNames: string[]
): Promise<IndicatorLookup[]> {
  if (indicatorNames.length === 0) return [];

  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);

    const topicFilter = `topic = '${topicName}'`;
    const indicatorFilter = indicatorNames.map(n => `'${n}'`).join(", ");

    const result = await runQuery(conn,`
      SELECT indicator, geomID, value, quality_class, description
      FROM read_parquet('${tableName}')
      WHERE ${topicFilter}
        AND indicator IN (${indicatorFilter})
    `);

    const resultArray = toArray(result);

    const groups: Record<string, { sum: number; count: number; qcSum: number; qcCount: number; description: string; lookup: Record<string, number>; qualityClassLookup: Record<string, number> }> = {};
    for (const name of indicatorNames) {
      groups[name] = { sum: 0, count: 0, qcSum: 0, qcCount: 0, description: "", lookup: {}, qualityClassLookup: {} };
    }

    resultArray.forEach((r: any) => {
      const indicator = String(r.indicator);
      if (!groups[indicator]) return;

      // Every row in a country-level (single-feature) parquet already represents
      // country level, so any non-empty description is the one we want - no more
      // "is this the adm0 row" substring check needed (that heuristic assumed one
      // combined file with every layer's rows mixed together; layers are now
      // separate files).
      if (r.description) {
        groups[indicator].description = r.description;
      }

      const geomID = String(r.geomID);

      if (!isNoDataValue(r.quality_class)) {
        const qualityClass = Number(r.quality_class);
        if (!isNaN(qualityClass)) {
          groups[indicator].qualityClassLookup[geomID] = qualityClass;
          if (geomID.includes("_")) {
            const suffix = geomID.split("_").pop();
            if (suffix) groups[indicator].qualityClassLookup[suffix] = qualityClass;
          }
          groups[indicator].qcSum += qualityClass;
          groups[indicator].qcCount++;
        }
      }

      // A -999/null value means this boundary has no data - left out of
      // `lookup` (and therefore uncolored on the map, same as any other gap
      // in the data - see MetricMap's default grey fill) rather than
      // plotted as a real zero.
      if (isNoDataValue(r.value)) return;
      const value = Number(r.value);
      if (isNaN(value)) return;

      groups[indicator].lookup[geomID] = value;

      if (geomID.includes("_")) {
        const parts = geomID.split("_");
        const suffix = parts[parts.length - 1];
        if (suffix && suffix.length > 0) {
          groups[indicator].lookup[suffix] = value;
        }
      }

      groups[indicator].sum += value;
      groups[indicator].count++;
    });

    return indicatorNames.map(name => {
      const g = groups[name];
      return {
        lookup: g.lookup,
        qualityClassLookup: g.qualityClassLookup,
        avg: g.count > 0 ? g.sum / g.count : 0,
        qualityClassAvg: g.qcCount > 0 ? g.qcSum / g.qcCount : null,
        description: g.description,
        hasData: g.count > 0
      };
    });
  } catch (e) {
    console.error("Failed to load indicator lookups:", e);
    return indicatorNames.map(() => ({ lookup: {}, qualityClassLookup: {}, avg: 0, qualityClassAvg: null, description: "", hasData: false }));
  }
}

export interface PMTilesBounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * The tag-distribution parquet carries an ISO-8601 `timestamp` column (a
 * varchar, one value per pipeline run recorded in that file) - MAX() sorts
 * correctly on it as-is since ISO-8601 strings compare lexicographically in
 * chronological order. This is the actual "when was this data computed"
 * moment, unlike the object storage's HTTP Last-Modified header (which only
 * reflects when the file was last uploaded/copied, not a same thing).
 */
export async function loadLatestTimestamp(tagDistributionUrl: string): Promise<string | null> {
  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(tagDistributionUrl, db);
    // Deliberately not MAX(timestamp): this duckdb-wasm build silently
    // truncates a MAX()/MIN() aggregate over a VARCHAR column (confirmed -
    // it returned "2026-09-" instead of the real "2026-09-11T13:13:51Z",
    // exactly the kind of corruption an aggregate copying only a DuckDB
    // string_t's inline prefix, not the full out-of-line data, would
    // produce). A plain row projection isn't an aggregate and reads
    // correctly, same as every other varchar column this app already reads.
    const result = await runQuery(conn, `
      SELECT timestamp AS latest
      FROM read_parquet('${tableName}')
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    const resultArray = toArray(result);
    return resultArray[0]?.latest ?? null;
  } catch (e) {
    console.error("Failed to load latest timestamp:", e);
    return null;
  }
}

export async function getPMTilesBounds(url: string): Promise<PMTilesBounds | null> {
  try {
    const pmtilesFile = new PMTiles(url);
    const metadata = await pmtilesFile.getMetadata() as any;
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
      WHERE indicator LIKE 'attribute-completeness_%'
    `;

    const result = await runQuery(conn,query);
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

export interface TagDistributionMeasure {
  treemap: any | null;
  sumValue: number | null;
}

// The pipeline's treemap figures always label values "km" regardless of the
// actual measure - "count" isn't a distance at all, and "length"/"area" are
// raw meters/m² (ohsome-api's default units), not km/km². Correct both the
// displayed unit and the underlying values (dividing every value by the same
// factor doesn't change a treemap's proportions, only the number shown).
const TREEMAP_UNIT_BY_MEASURE: Record<string, { divisor: number; unit: string } | null> = {
  count: null,
  length: { divisor: 1000, unit: "km" },
  area: { divisor: 1_000_000, unit: "km²" }
};

// Plotly sometimes serializes a numeric array as a compact
// { dtype, bdata: base64 } object instead of a plain array - decode it so
// the values can be rescaled, same as if it were already a plain array.
function decodeTreemapValues(values: any): number[] | null {
  if (Array.isArray(values)) return values;
  if (!values || typeof values.bdata !== "string") return null;

  const binary = atob(values.bdata);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  switch (values.dtype) {
    case "f8": return Array.from(new Float64Array(bytes.buffer));
    case "f4": return Array.from(new Float32Array(bytes.buffer));
    case "i1": return Array.from(new Int8Array(bytes.buffer));
    case "u1": return Array.from(new Uint8Array(bytes.buffer));
    case "i2": return Array.from(new Int16Array(bytes.buffer));
    case "u2": return Array.from(new Uint16Array(bytes.buffer));
    case "i4": return Array.from(new Int32Array(bytes.buffer));
    case "u4": return Array.from(new Uint32Array(bytes.buffer));
    default: return null;
  }
}

function fixTreemapUnits(fig: any, measure: string): any {
  if (!fig?.data) return fig;
  const conversion = TREEMAP_UNIT_BY_MEASURE[measure] ?? null;

  fig.data.forEach((trace: any) => {
    if (typeof trace.texttemplate === "string") {
      trace.texttemplate = trace.texttemplate.replace(
        "%{value:,.0f} km",
        conversion ? `%{value:,.0f} ${conversion.unit}` : "%{value:,.0f}"
      );
    }
    if (typeof trace.hovertemplate === "string") {
      trace.hovertemplate = trace.hovertemplate.replace(
        "value=%{value}<br>",
        conversion ? `value=%{value} ${conversion.unit}<br>` : "value=%{value}<br>"
      );
    }
    if (conversion) {
      const values = decodeTreemapValues(trace.values);
      if (values) {
        trace.values = values.map((v: number) => v / conversion.divisor);
      }
    }
  });

  return fig;
}

/**
 * Reads the pre-rendered per-measure treemap + total for one (topic, groupingKey)
 * pair from a country's tag-distribution parquet, keyed by measure ("count",
 * "area", "length" - whichever the topic has).
 */
export async function loadTagDistribution(
  parquetUrl: string,
  topic: string,
  groupingKey: string,
  // When given, scopes the treemap to one region's own row - parquetUrl must
  // then point at that region's grid layer file, same convention as
  // loadIndicatorFigure's geomId.
  geomId?: string | null
): Promise<Record<string, TagDistributionMeasure>> {
  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);
    const geomFilter = geomId ? ` AND geomID = '${geomId}'` : '';

    const result = await runQuery(conn,`
      SELECT measure, treemap, sum_value
      FROM read_parquet('${tableName}')
      WHERE topic = '${topic}' AND grouping_key = '${groupingKey}'${geomFilter}
    `);

    const resultArray = toArray(result);
    const byMeasure: Record<string, TagDistributionMeasure> = {};

    resultArray.forEach((r: any) => {
      let treemap: any = null;
      if (r.treemap) {
        try {
          treemap = fixTreemapUnits(JSON.parse(r.treemap), String(r.measure));
        } catch {
          treemap = null;
        }
      }
      byMeasure[String(r.measure)] = {
        treemap,
        sumValue: r.sum_value != null ? Number(r.sum_value) : null
      };
    });

    return byMeasure;
  } catch (e) {
    console.error("Failed to load tag distribution:", e);
    return {};
  }
}

/**
 * Every region's own feature count for one (topic, groupingKey) pair, read
 * from the same tag-distribution parquet loadTagDistribution() uses - the
 * "count" measure's sum_value, one row per region, rather than scoped down
 * to a single region or aggregated to the whole layer. Used to color the
 * map when Tag Distribution is the active indicator (there's no dedicated
 * per-topic "feature count" indicator otherwise): the same count that feeds
 * the treemap's totals, just broken out per boundary instead of summed.
 */
export async function loadFeatureCountLookup(
  parquetUrl: string,
  topic: string,
  groupingKey: string
): Promise<Record<string, number>> {
  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);

    const result = await runQuery(conn, `
      SELECT geomID, sum_value
      FROM read_parquet('${tableName}')
      WHERE topic = '${topic}' AND grouping_key = '${groupingKey}' AND measure = 'count'
    `);

    const resultArray = toArray(result);
    const lookup: Record<string, number> = {};

    resultArray.forEach((r: any) => {
      if (isNoDataValue(r.sum_value)) return;
      const value = Number(r.sum_value);
      if (isNaN(value)) return;

      const geomID = String(r.geomID);
      lookup[geomID] = value;

      // Same suffix-aliasing convention as loadIndicatorLookups(), for
      // geomIDs like "DEU_12345" that also need to match on their bare
      // regional suffix.
      if (geomID.includes("_")) {
        const suffix = geomID.split("_").pop();
        if (suffix) lookup[suffix] = value;
      }
    });

    return lookup;
  } catch (e) {
    console.error("Failed to load feature count lookup:", e);
    return {};
  }
}

/**
 * Reads one indicator's pre-rendered gauge-chart Plotly figure (the "figure"
 * column) for a given topic from the country-level indicator parquet.
 */
export async function loadIndicatorFigure(
  parquetUrl: string,
  topic: string,
  indicator: string,
  // When given, scopes the figure to one region's row instead of the file's
  // single whole-area row - parquetUrl must then point at the same grid
  // layer's file the geomID actually belongs to (the country-level file
  // only ever has the one country-wide row).
  geomId?: string | null
): Promise<any | null> {
  const { db, conn } = await initDuckDB();

  try {
    const tableName = await registerParquetFile(parquetUrl, db);
    const geomFilter = geomId ? ` AND geomID = '${geomId}'` : '';

    const result = await runQuery(conn,`
      SELECT figure
      FROM read_parquet('${tableName}')
      WHERE topic = '${topic}' AND indicator = '${indicator}' AND figure IS NOT NULL${geomFilter}
      LIMIT 1
    `);

    const resultArray = toArray(result);
    if (resultArray.length === 0 || !resultArray[0].figure) return null;

    try {
      return JSON.parse(resultArray[0].figure);
    } catch {
      return null;
    }
  } catch (e) {
    console.error("Failed to load indicator figure:", e);
    return null;
  }
}
