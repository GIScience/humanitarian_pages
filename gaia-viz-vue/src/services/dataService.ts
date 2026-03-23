import jsyaml from "js-yaml";

export interface Country {
  code: string;
  name: string;
}

export async function fetchCountries(): Promise<Country[]> {
  const CACHE_KEY = "gaia_countries_cache";
  const CACHE_TIME_KEY = "gaia_countries_cache_time";
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const cacheTime = localStorage.getItem(CACHE_TIME_KEY);
    if (cached && cacheTime && (Date.now() - Number(cacheTime) < 12 * 60 * 60 * 1000)) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn("Could not read cache", e);
  }

  const yamlUrl = "https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/countries/countries.yaml";
  const respYaml = await fetch(yamlUrl);
  const textYaml = await respYaml.text();
  const countryYamlData = jsyaml.load(textYaml) as Record<string, { slug: string }>;

  function prettifySlug(slug: string) {
    if (!slug) return "";
    return slug.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  }

  function getCountryName(code: string) {
    const slug = countryYamlData[code]?.slug;
    return slug ? prettifySlug(slug) : code;
  }

  // Fetch all keys without delimiter to see which folders actually have the required files
  const baseS3Url = "https://hot.storage.heigit.org/heigit-hdx-public?list-type=2&prefix=risk_assessment_inputs/&max-keys=1000";
  const keys: string[] = [];
  let isTruncated = true;
  let continuationToken = "";

  while (isTruncated) {
    const url = continuationToken ? `${baseS3Url}&continuation-token=${encodeURIComponent(continuationToken)}` : baseS3Url;
    const resS3 = await fetch(url);
    const textS3 = await resS3.text();
    const xml = new DOMParser().parseFromString(textS3, "application/xml");
    
    Array.from(xml.querySelectorAll("Key")).forEach(el => {
      if (el.textContent) keys.push(el.textContent);
    });

    const isTruncatedNode = xml.querySelector("IsTruncated");
    isTruncated = isTruncatedNode ? isTruncatedNode.textContent === "true" : false;
    
    if (isTruncated) {
      const nextTokenNode = xml.querySelector("NextContinuationToken");
      continuationToken = nextTokenNode ? nextTokenNode.textContent || "" : "";
    }
  }

  // Group keys by country code and check for presence of required files
  const countryFiles = new Map<string, Set<string>>();
  keys.forEach(key => {
    const parts = key.split("/");
    if (parts.length >= 3) {
      const countryCode = parts[1].toUpperCase();
      const filename = parts[2];
      if (!countryFiles.has(countryCode)) countryFiles.set(countryCode, new Set());
      countryFiles.get(countryCode)?.add(filename);
    }
  });

  const validCountries: Country[] = [];
  countryFiles.forEach((files, code) => {
    const hasPmtiles = Array.from(files).some(f => f.endsWith(".pmtiles"));
    const hasParquet = Array.from(files).some(f => f.endsWith("_risk.parquet"));
    
    if (hasPmtiles && hasParquet) {
      validCountries.push({ code, name: getCountryName(code) });
    }
  });

  const result = validCountries.sort((a, b) => a.name.localeCompare(b.name));
  
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
  } catch(e) {
    console.warn("Could not write cache", e);
  }

  return result;
}

export async function checkFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}
