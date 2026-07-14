<script setup lang="ts">
import { onMounted, nextTick, watch } from "vue";
import Plotly from "plotly.js-dist-min";

const props = defineProps<{
  data: any[];
  selectedDisaster: string;
  pcodeField: string;
}>();

const emit = defineEmits<{
  (e: "region-hover", pcode: string | null): void;
}>();


const renderRanking = async () => {
  await nextTick();
  const graphDiv = document.getElementById("ranking-chart");
  if (!graphDiv || !props.data.length || !props.selectedDisaster) return;

  // Get top 15 highest risk
  const topData = [...props.data]
    .filter((d) => !isNaN(Number(d[props.selectedDisaster])))
    .sort(
      (a, b) =>
        Number(b[props.selectedDisaster]) - Number(a[props.selectedDisaster]),
    )
    .slice(0, 15)
    .reverse(); // Reverse for Plotly horizontal bar chart (bottom to top)

  const yValues = topData.map((d) => d[props.pcodeField]);
  const xValues = topData.map((d) => Number(d[props.selectedDisaster]));

  const trace = {
    x: xValues,
    y: yValues,
    type: "bar",
    orientation: "h",
    marker: {
      color: xValues,
      colorscale: [
        [0, "#F9D6C1"],
        [0.5, "#F28C82"],
        [1, "#8B4C4C"],
      ],
    },
    text: xValues.map((v) => v.toFixed(3)),
    textposition: "auto",
    hoverinfo: "y+text",
  };

  const layout = {
    font: { family: "inherit", color: "#475569" },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: {
      title: "Risk Score",
      gridcolor: "#e2e8f0",
      zerolinecolor: "#e2e8f0",
      automargin: true,
    },
    yaxis: {
      automargin: true,
      tickfont: { size: 10, color: "#475569" },
    },
    margin: { t: 10, r: 10, b: 10, l: 10 },
  };

  try {
    await Plotly.newPlot(graphDiv as any, [trace] as any, layout as any, {
      responsive: true,
      displayModeBar: false,
    });
    (graphDiv as any).on("plotly_hover", (data: any) => {
      if (data.points && data.points.length > 0) {
        emit("region-hover", data.points[0].y); // Horizontal bar, so y is the PCODE
      }
    });
    (graphDiv as any).on("plotly_unhover", () => emit("region-hover", null));
  } catch (e) {
    console.error("Plotly Ranking Error:", e);
  }
};

onMounted(() => {
  renderRanking();
});

watch(
  [() => props.data, () => props.selectedDisaster],
  () => {
    renderRanking();
  },
  { deep: true },
);
</script>

<template>
  <section class="h-full min-h-[400px] flex flex-col">
    <h3
      class="text-lg font-extrabold text-slate-900 mb-2 mt-2 px-2 tracking-tight"
    >
      Top 15 Regions
    </h3>
    <div id="ranking-chart" class="flex-1 w-[45rem]"></div>
  </section>
</template>
