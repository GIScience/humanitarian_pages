#install.packages("ripc")

library(ripc)
library(sf)

Sys.setenv(IPC_API_KEY = "5f500695-6c95-40a9-8f72-1ab2889c3ee9") # API key here

outdir <- "/Users/ferdinandseyffer/Desktop/HeiGIT/Food_insecurity_comparison/IPC_p2_all" # enter output directory
dir.create(outdir, showWarnings = FALSE, recursive = TRUE)

# Define request parameters for analysis ID (ISO code and IPC phase)
anl_all <- ipc_get_analyses(country = "SO", type = "A")


# request analysis ID and perform data request for it
for (i in seq_len(nrow(anl_all))) {
  areas <- try(ipc_get_areas(
    id = anl_all$analysis_id[i],
    period = "A",
    return_format = "geojson"
  ), silent = TRUE)

  # Extract date for file name
  if (!inherits(areas, "try-error")) {
    month_year <- str_extract(anl_all$title[i], "[A-Za-z]+\\s[0-9]{4}")
    month_year <- gsub(" ", "_", month_year)

    # write requested file to folder
    st_write(
      areas,
      file.path(outdir, paste0("SO_A_", month_year, "_", anl_all$analysis_id[i], "_C.geojson")),
      driver = "GeoJSON",
      delete_dsn = TRUE
    )
  }
}

