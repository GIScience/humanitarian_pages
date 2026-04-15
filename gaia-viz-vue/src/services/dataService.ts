import jsyaml from "js-yaml";

export interface Country {
  code: string;
  name: string;
}

export async function fetchCountries(): Promise<Country[]> {
  try {
    // 1. Fetch the pre-generated list of available countries
    const resJson = await fetch(`${import.meta.env.BASE_URL}data/available_countries.json`);
    if (!resJson.ok) throw new Error("Failed to load available_countries.json");
    const validCodes: string[] = await resJson.json();

    // 2. Fetch the YAML metadata to get proper country names
    const yamlUrl = "https://hot.storage.heigit.org/heigit-hdx-public/oqapi_hdx/countries/countries.yaml";
    const respYaml = await fetch(yamlUrl);
    const textYaml = await respYaml.text();
    const countryYamlData = jsyaml.load(textYaml) as Record<string, { slug: string }>;

    function prettifySlug(slug: string) {
      if (!slug) return "";
      return slug.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    }

    const result = validCodes.map(code => {
      const slug = countryYamlData[code]?.slug;
      return {
        code,
        name: slug ? prettifySlug(slug) : code
      };
    });

    return result.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Failed to fetch available countries", error);
    return [];
  }
}

export async function checkFileExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}
