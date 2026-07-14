import { defineStore } from "pinia";
import {
  BASE_RISK_DIMENSIONS,
  getRiskDimension,
  type RiskDimensionConfig,
} from "@/enums/dimensions";
import { getDimensionColumns } from "@/utils/riskCalculation";
import type { Country } from "@/services/dataService";

export const useRiskMapStore = defineStore("riskMap", {
  state: () => ({
    initialized: false as boolean,
    selectedCountry: "" as string,
    selectedDisaster: "" as string,
    disasters: [] as string[],
    countries: [] as Country[],
    pmtilesUrl: "" as string,
    pcodeField: "" as string,
    matchArray: [] as [string, string, number][],
    isLoading: false as boolean,
    error: null as string | null,
    uploadError: null as string | null,
    lastLoadedData: [] as any[],
    rawOriginalData: [] as any[],
    lastLoadedCountry: "" as string,
    highlightedPcode: null as string | null,
    indicatorWeights: {} as Record<string, number>,
    viewMode: "HOME" as "HOME" | "DASHBOARD",
    showAnalysis: false as boolean,
    showAboutModal: false as boolean,
    showUploadModal: false as boolean,
    showCustomDataInfo: false as boolean,
    pendingCustomDataCountry: null as string | null,
    riskViewMode: "total" as string,
    dimensions: [...BASE_RISK_DIMENSIONS] as RiskDimensionConfig[],
    selectedCountryPcodeFieldMap: [] as Array<string>,
  }),

  getters: {
    dimensionColumns(state) {
      return getDimensionColumns(state.lastLoadedData, state.selectedDisaster);
    },
    activeValueColumn(state): string {
      const dimension = getRiskDimension(state.riskViewMode, state.dimensions);
      return dimension.resolveColumn({
        disaster: state.selectedDisaster,
        dimensionColumns: this.dimensionColumns,
      });
    },
    riskViewLabel(state): string {
      return getRiskDimension(state.riskViewMode, state.dimensions).legendLabel;
    },
    selectedCountryName(state): string {
      return (
        state.countries.find((c) => c.code === state.selectedCountry)?.name ||
        ""
      );
    },
    existingPcodes(state): string[] {
      if (!state.pcodeField) return [];
      return state.lastLoadedData.map((d) => String(d[state.pcodeField]));
    },
  },

  actions: {
    markInitialized() {
      this.initialized = true;
    },

    setSelectedCountry(value: string) {
      this.selectedCountry = value;
    },
    setSelectedDisaster(value: string) {
      this.selectedDisaster = value;
    },
    setDisasters(value: string[]) {
      this.disasters = value;
    },
    setCountries(value: Country[]) {
      this.countries = value;
    },
    setPmtilesUrl(value: string) {
      this.pmtilesUrl = value;
    },
    setPcodeField(value: string) {
      this.pcodeField = value;
    },
    setMatchArray(value: [string, string, number][]) {
      this.matchArray = value;
    },
    setLoading(value: boolean) {
      this.isLoading = value;
    },
    setError(value: string | null) {
      this.error = value;
    },
    setUploadError(value: string | null) {
      this.uploadError = value;
    },
    setLastLoadedData(value: any[]) {
      this.lastLoadedData = value;
    },
    setRawOriginalData(value: any[]) {
      this.rawOriginalData = value;
    },
    setLastLoadedCountry(value: string) {
      this.lastLoadedCountry = value;
    },
    setHighlightedPcode(value: string | null) {
      this.highlightedPcode = value;
    },
    setIndicatorWeights(value: Record<string, number>) {
      this.indicatorWeights = value;
    },
    setViewMode(value: "HOME" | "DASHBOARD") {
      this.viewMode = value;
    },
    setShowAnalysis(value: boolean) {
      this.showAnalysis = value;
    },
    setShowAboutModal(value: boolean) {
      this.showAboutModal = value;
    },
    setShowUploadModal(value: boolean) {
      this.showUploadModal = value;
    },
    setShowCustomDataInfo(value: boolean) {
      this.showCustomDataInfo = value;
    },
    setPendingCustomDataCountry(value: string | null) {
      this.pendingCustomDataCountry = value;
    },
    setRiskViewMode(value: string) {
      this.riskViewMode = value;
    },

    setSelectedCountryPcodeFieldMap(value: Array<string>) {
      this.selectedCountryPcodeFieldMap = value;
    },

    // Reset the store to its initial state when switching to a new country
    resetForNewCountry() {
      this.matchArray = [];
      this.indicatorWeights = {};
      this.uploadError = null;
      this.showCustomDataInfo = false;
      this.pendingCustomDataCountry = null;
      this.showAnalysis = true;
    },

    // Reset the store to its initial state when returning to the home view
    resetToHome() {
      this.viewMode = "HOME";
      this.lastLoadedCountry = "";
      this.pmtilesUrl = "";
      this.matchArray = [];
      this.lastLoadedData = [];
      this.rawOriginalData = [];
      this.selectedDisaster = "";
      this.disasters = [];
      this.pcodeField = "";
      this.indicatorWeights = {};
      this.riskViewMode = "total";
      this.uploadError = null;
      this.showAnalysis = true;
    },
  },
});
