<script setup lang="ts">
import { ref, computed, watch } from "vue";

const props = defineProps<{
  data: any[];
  selectedDisaster: string;
  pcodeField: string;
  disasterLabel: string;
  indicatorCols: string[];
  formatColName: (col: string) => string;
}>();

const emit = defineEmits<{
  (e: "region-hover", pcode: string | null): void;
}>();

const sortKey = ref<string>("");
const sortOrder = ref<"asc" | "desc">("desc");
const currentPage = ref(1);
const itemsPerPage = 50;

const sortedData = computed(() => {
  if (!props.data || props.data.length === 0) return [];

  const key = sortKey.value || props.selectedDisaster;

  return [...props.data].sort((a, b) => {
    const valA = a[key];
    const valB = b[key];

    const numA = Number(valA);
    const numB = Number(valB);

    if (
      valA !== null &&
      valA !== undefined &&
      valB !== null &&
      valB !== undefined &&
      !isNaN(numA) &&
      !isNaN(numB) &&
      valA !== "" &&
      valB !== ""
    ) {
      if (numA < numB) return sortOrder.value === "asc" ? -1 : 1;
      if (numA > numB) return sortOrder.value === "asc" ? 1 : -1;
      return 0;
    } else {
      const strA = String(valA || "");
      const strB = String(valB || "");
      if (strA < strB) return sortOrder.value === "asc" ? -1 : 1;
      if (strA > strB) return sortOrder.value === "asc" ? 1 : -1;
      return 0;
    }
  });
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(sortedData.value.length / itemsPerPage));
});

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return sortedData.value.slice(start, start + itemsPerPage);
});

watch(
  [sortKey, sortOrder, () => props.data],
  () => {
    currentPage.value = 1;
  },
  { deep: true },
);

const toggleSort = (key: string) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = key;
    sortOrder.value = "desc";
  }
};
</script>

<template>
  <section class="w-full h-full flex flex-col min-h-0 relative">
    <div class="flex justify-between items-center mb-2 shrink-0">
      <div class="text-sm font-bold text-slate-700">
        {{ sortedData.length }} Regions
      </div>
    </div>

    <div
      class="flex-1 overflow-auto border border-slate-200 rounded-lg custom-scrollbar bg-white"
    >
      <table
        class="w-full text-left text-sm text-slate-600 relative border-collapse"
      >
        <thead
          class="text-xs text-slate-500 uppercase sticky top-0 z-10 shadow-sm border-b border-slate-200"
        >
          <tr>
            <th
              class="px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 whitespace-nowrap border-b border-slate-200"
              @click="toggleSort(pcodeField)"
            >
              PCODE
              <span v-if="sortKey === pcodeField">{{
                sortOrder === "asc" ? "↑" : "↓"
              }}</span>
            </th>
            <th
              class="px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 whitespace-nowrap border-b border-slate-200"
              @click="toggleSort(selectedDisaster)"
            >
              {{ disasterLabel }} Risk
              <span v-if="sortKey === selectedDisaster || sortKey === ''">{{
                sortOrder === "asc" ? "↑" : "↓"
              }}</span>
            </th>
            <th
              v-for="col in indicatorCols"
              :key="col"
              class="px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 whitespace-nowrap border-b border-slate-200"
              @click="toggleSort(col)"
            >
              {{ formatColName(col) }}
              <span v-if="sortKey === col">{{
                sortOrder === "asc" ? "↑" : "↓"
              }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in paginatedData"
            :key="row[pcodeField]"
            class="hover:bg-slate-50"
            @mouseenter="emit('region-hover', row[pcodeField])"
            @mouseleave="emit('region-hover', null)"
          >
            <td
              class="px-4 py-2 font-medium text-slate-900 whitespace-nowrap border-b border-slate-100"
            >
              {{ row[pcodeField] }}
            </td>
            <td
              class="px-4 py-2 font-bold whitespace-nowrap border-b border-slate-100"
            >
              {{
                row[selectedDisaster] !== undefined &&
                row[selectedDisaster] !== null &&
                row[selectedDisaster] !== "" &&
                !isNaN(Number(row[selectedDisaster]))
                  ? Number(row[selectedDisaster]).toFixed(3)
                  : "N/A"
              }}
            </td>
            <td
              v-for="col in indicatorCols"
              :key="col"
              class="px-4 py-2 whitespace-nowrap text-slate-600 border-b border-slate-100"
            >
              {{
                row[col] !== undefined &&
                row[col] !== null &&
                row[col] !== "" &&
                !isNaN(Number(row[col]))
                  ? Number(row[col]).toFixed(3)
                  : row[col] || "-"
              }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination Controls -->
    <div
      class="flex justify-between items-center mt-3 shrink-0"
      v-if="totalPages > 1"
    >
      <button
        @click="currentPage--"
        :disabled="currentPage === 1"
        class="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded-md disabled:opacity-40 hover:bg-slate-200 transition-colors cursor-pointer"
      >
        Previous
      </button>
      <span class="text-xs font-bold text-slate-500 tracking-wider">
        PAGE {{ currentPage }} OF {{ totalPages }}
      </span>
      <button
        @click="currentPage++"
        :disabled="currentPage === totalPages"
        class="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-600 rounded-md disabled:opacity-40 hover:bg-slate-200 transition-colors cursor-pointer"
      >
        Next
      </button>
    </div>
  </section>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #8b4c4c; /* HeiGIT Red */
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #8b4c4c; /* Darker HeiGIT Red */
}
</style>
