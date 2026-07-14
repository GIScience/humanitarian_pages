<script setup lang="ts">
import { onMounted, nextTick, watch } from "vue";
import Plotly from "plotly.js-dist-min";

const props = defineProps<{
  data: any[];
}>();

const renderDemographics = async () => {
  await nextTick();
  const graphDiv = document.getElementById("demographics-chart");
  if (!graphDiv || !props.data.length) return;

  const cols = Object.keys(props.data[0]);
  const demoCols = cols.filter(
    (c) => c.startsWith("vul_") && !c.includes("perc") && !c.includes("rural"),
  );

  if (demoCols.length === 0) {
    Plotly.purge(graphDiv as any);
    return;
  }

  const totals: Record<string, number> = {};
  demoCols.forEach((col) => {
    totals[col] = props.data.reduce(
      (sum, row) => sum + (Number(row[col]) || 0),
      0,
    );
  });

  // Remove total female/pop just to not skew the chart, or keep it as specific groups
  const selectedDemoCols = demoCols.filter(
    (c) => !c.includes("pop") || c.includes("rural_pop"),
  );

  const labels = selectedDemoCols.map((c) =>
    c.replace("vul_", "").replace(/_/g, " ").toUpperCase(),
  );
  const values = selectedDemoCols.map((c) => totals[c]);

  const trace = {
    labels: labels,
    values: values,
    type: "pie",
    hole: 0.4,
    textinfo: "percent",
    textposition: "inside",
    insidetextorientation: "radial",
    marker: {
      colors: [
        "#8B1824", // Shade (Dark Red)
        "#E77480", // Tint (Soft Red/Rose)
        "#2C3E50", // Base (Midnight Navy)
        "#5D6D7E", // Tint (Steel Blue)
        "#1B2838", // Shade (Deep Night Blue)
        "#CA2333", // Base (Your Main Red)
      ],
    },
  };

  const layout = {
    font: { family: "inherit", color: "#475569" },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    margin: { t: 10, r: 10, b: 100, l: 10 },
    showlegend: true,
    legend: { orientation: "h" },
  };

  try {
    await Plotly.newPlot(graphDiv as any, [trace] as any, layout as any, {
      responsive: true,
      displayModeBar: false,
    });
  } catch (e) {
    console.error("Plotly Demographics Error:", e);
  }
};

onMounted(() => {
  renderDemographics();
});

watch(
  () => props.data,
  () => {
    renderDemographics();
  },
  { deep: true },
);
</script>

<template>
  <section class="h-full min-h-[400px] flex flex-col">
    <h3
      class="text-lg font-extrabold text-slate-900 mb-2 mt-2 px-2 tracking-tight"
    >
      Vulnerable Demographics
    </h3>
    <div id="demographics-chart" class="w-full flex-1"></div>
  </section>
</template>
