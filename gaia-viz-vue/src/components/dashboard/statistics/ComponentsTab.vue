<script setup lang="ts">
import { computed, onMounted, nextTick, watch } from "vue";
import Plotly from "plotly.js-dist-min";
import { getDimensionColumns } from "@/utils/riskCalculation";

const props = defineProps<{
  data: any[];
  selectedDisaster: string;
  pcodeField: string;
}>();

const emit = defineEmits<{
  (e: "region-hover", pcode: string | null): void;
}>();

const componentCols = computed(() =>
  getDimensionColumns(props.data, props.selectedDisaster),
);

const renderComponents = async () => {
  await nextTick();
  const graphDiv = document.getElementById("components-chart");
  if (!graphDiv || !props.data.length) return;

  // Top 5 regions by risk
  const topData = [...props.data]
    .filter((d) => !isNaN(Number(d[props.selectedDisaster])))
    .sort(
      (a, b) =>
        Number(b[props.selectedDisaster]) - Number(a[props.selectedDisaster]),
    )
    .slice(0, 5);

  const pcodes = topData.map((d) => d[props.pcodeField]);
  const { exp, vul, cop } = componentCols.value;

  const traces = [];
  const colors = {
    exp: "#ca2333",
    vul: "#E77480",
    cop: "#F4C2C7",
  };

  if (exp) {
    traces.push({
      x: pcodes,
      y: topData.map((d) => Number(d[exp]) || 0),
      name: "Exposure",
      type: "bar",
      marker: { color: colors.exp },
    });
  }
  if (vul) {
    traces.push({
      x: pcodes,
      y: topData.map((d) => Number(d[vul]) || 0),
      name: "Vulnerability",
      type: "bar",
      marker: { color: colors.vul },
    });
  }
  if (cop) {
    traces.push({
      x: pcodes,
      y: topData.map((d) => Number(d[cop]) || 0),
      name: "Lack of Coping Capacity",
      type: "bar",
      marker: { color: colors.cop },
    });
  }

  const layout = {
    font: { family: "inherit", color: "#475569" },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    barmode: "group",
    xaxis: {
      title: "Region (PCODE)",
      gridcolor: "#e2e8f0",
      tickfont: { size: 10, color: "#475569" },
      automargin: true,
    },
    yaxis: {
      title: "Index Value",
      gridcolor: "#e2e8f0",
      zerolinecolor: "#e2e8f0",
      automargin: true,
      range: [
        0,
        Math.max(
          1,
          ...topData.map((d) =>
            Math.max(
              Number(d[exp]) || 0,
              Number(d[vul]) || 0,
              Number(d[cop]) || 0,
            ),
          ),
        ),
      ],
    },
    margin: { t: 10, r: 10, b: 100, l: 10 },
    legend: { orientation: "h" },
  };

  try {
    await Plotly.newPlot(graphDiv as any, traces as any, layout as any, {
      responsive: true,
      displayModeBar: false,
    });
    (graphDiv as any).on("plotly_hover", (data: any) => {
      if (data.points && data.points.length > 0) {
        emit("region-hover", data.points[0].x); 
      }
    });
    (graphDiv as any).on("plotly_unhover", () => emit("region-hover", null));
  } catch (e) {
    console.error("Plotly Components Error:", e);
  }
};

onMounted(() => {
  renderComponents();
});

watch(
  [() => props.data, () => props.selectedDisaster],
  () => {
    renderComponents();
  },
  { deep: true },
);
</script>

<template>
  <section class="h-full min-h-[400px] flex flex-col">
    <h3
      class="text-lg font-extrabold text-slate-900 mb-1 mt-2 px-2 tracking-tight"
    >
      Top 5 Regions
    </h3>
    <div class="mb-2 px-2 text-xs text-slate-500 font-medium">
      Risk breakdown of top vulnerable areas based on formula factors.
    </div>
    <div id="components-chart" class="w-full flex-1"></div>
  </section>
</template>
