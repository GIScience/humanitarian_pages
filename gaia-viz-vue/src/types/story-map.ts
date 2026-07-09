// Types for the story-map JSON config.
// Text fields may contain inline markdown (**bold** -> accent, [label](href) -> link).

export interface StoryMapConfig {
  meta: Meta;
  app: AppConfig;
  storyMap: StoryMapContent;
  footer: FooterConfig;
}

export interface Meta {
  id: string;
  type: string;
  version: number;
  locale: string;
  updatedAt: string;
  notes?: string;
}

export interface AppConfig {
  brand: { name: string; tagline: string };
  nav: { items: NavItem[]; context: CountrySelector };
}
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  active?: boolean;
}
export interface CountrySelector {
  type: string;
  icon: string;
  value: string;
  label: string;
}

export interface StoryMapContent {
  backLink: LinkRef;
  sidebar: Sidebar;
  header: Header;
  sections: Section[];
}
export interface LinkRef {
  label: string;
  href: string;
  external?: boolean;
}

export interface Sidebar {
  icon: string;
  title: string;
  subtitle: string;
  steps: SidebarStep[];
  aside: Aside;
}
export interface SidebarStep {
  number: number;
  sectionRef: string;
  title: string;
  body: string;
}
export interface Aside {
  variant: string;
  icon: string;
  title: string;
  body: string;
}

export interface Header {
  title: string;
  description: string;
  equation: { terms: EquationTerm[] };
}
export type EquationTerm =
  | {
      kind: "operand" | "result";
      image: string;
      alt: string;
      label: string;
      sublabel: string | null;
    }
  | { kind: "operator"; symbol: string };

export interface Section {
  id: string;
  number: number;
  title: string;
  hasInfoIcon?: boolean;
  control?: Control;
  note?: Note;
  dataset?: Dataset;
  legend?: Legend;
  map: MapConfig;
}

export interface layerConfigType {
  type?: string;
  layerId: string;
  colorScheme?: string;
  mode?: "rgb" | "ramp" | "categorical";
  sourceUrl?: string;
}

export type Control = SegmentedControl | SliderControl;
export interface SegmentedControl {
  type: "segmented";
  id: string;
  variant?: "cards";
  options: SegmentedOption[];
}
export interface SegmentedOption {
  value: string;
  label: string;
  icon?: string;
  selected?: boolean;
  layerConfig?: layerConfigType;
}
export interface SliderControl {
  type: "slider";
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  value: number;
  ticks: SliderTick[];
}
export interface SliderTick {
  value: number;
  label: string;
  selected?: boolean;
}

export interface Note {
  variant: string;
  icon: string;
  body: string;
}
export interface Dataset {
  icon: string;
  title: string;
  source: string;
}

export interface Legend {
  title: string;
  type: "categorical" | "graduated";
  items: LegendItem[];
}
export interface LegendItem {
  color: string;
  label: string;
  excluded?: boolean;
}

export interface MapConfig {
  layerId: string;
  caption?: { icon?: string; label: string; sublabel?: string };
  legend?: Legend;
  controls?: string[];
  results?: Results;
}
export interface Results {
  title: string;
  unit: string;
  rows: ResultRow[];
  link?: LinkRef;
}
export interface ResultRow {
  name: string;
  value: number;
}

export interface FooterConfig {
  callouts: Callout[];
}
export interface Callout {
  variant: "positive" | "warning";
  icon: string;
  title: string;
  body?: string;
  items?: string[];
}
