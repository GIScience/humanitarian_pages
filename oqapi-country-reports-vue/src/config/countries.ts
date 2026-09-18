/**
 * The maintained list of countries this dashboard offers in its country
 * picker. Add a country's 3-letter code here once the pipeline has actually
 * uploaded its data to S3 - fetchAvailableCountries() in dataService.ts
 * checks each one directly (a plain HEAD request against its boundaries
 * file, no special S3 permissions needed) and silently drops any that
 * aren't there yet. So adding a code here a little early isn't harmful, it
 * just won't show up in the dropdown until its data actually exists.
 *
 * Why a hand-maintained list instead of asking S3 which countries exist:
 * that would need a ListBucket call against the bucket root, which is
 * currently blocked by a bucket-policy issue on the infrastructure side
 * (see MAINTAINER_GUIDE.html, "Before you touch anything"). Once that's
 * fixed, auto-discovery could replace this list - until then, this is the
 * one place to add a country.
 */
export const CANDIDATE_COUNTRIES: string[] = [
  "DEU",
  "KEN",
  "NPL",
  "MWI",
  "NGA",
  "TZA",
  "VEN",
];
