<script setup lang="ts">
import { ref, computed } from 'vue';
import { loadCSVData } from '@/utils/duckdb';
import type { CustomIndicatorDimension } from '@/composables/useRiskLogic';

const MATCH_THRESHOLD = 0.9;

const props = defineProps<{
    pcodeField: string;
    existingPcodes: string[];
    hazardPrefix: string;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'upload', payload: { pcodeColumn: string; rows: Record<string, any>[]; assignments: Record<string, CustomIndicatorDimension | 'skip'> }): void;
}>();

type Step = 'select' | 'configure';

const step = ref<Step>('select');
const selectedFile = ref<File | null>(null);
const isDragging = ref(false);
const isParsing = ref(false);
const parseError = ref<string | null>(null);

const parsedRows = ref<Record<string, any>[]>([]);
const parsedColumns = ref<string[]>([]);
const pcodeColumn = ref<string | null>(null);
const assignments = ref<Record<string, CustomIndicatorDimension | 'skip'>>({});

const existingPcodeSet = computed(() => new Set(props.existingPcodes.map(String)));

const matchCount = computed(() => {
    if (!pcodeColumn.value) return 0;
    return parsedRows.value.filter(r => existingPcodeSet.value.has(String(r[pcodeColumn.value!]))).length;
});

const matchRate = computed(() => parsedRows.value.length > 0 ? matchCount.value / parsedRows.value.length : 0);
const matchIsSufficient = computed(() => pcodeColumn.value !== null && matchRate.value >= MATCH_THRESHOLD);

const assignableColumns = computed(() => parsedColumns.value.filter(c => c !== pcodeColumn.value));

const hasAnyAssignment = computed(() => Object.values(assignments.value).some(v => v !== 'skip'));

function detectPcodeColumn(columns: string[]): string | null {
    const lowerTarget = props.pcodeField.toLowerCase();
    const exact = columns.find(c => c.toLowerCase() === lowerTarget);
    if (exact) return exact;
    const generic = columns.find(c => c.toLowerCase() === 'pcode');
    if (generic) return generic;
    return null;
}

async function parseFile(file: File) {
    isParsing.value = true;
    parseError.value = null;
    try {
        const rows = await loadCSVData(file);
        if (!rows.length) {
            parseError.value = 'The CSV file appears to be empty.';
            return;
        }
        const columns = Object.keys(rows[0]);
        const detected = detectPcodeColumn(columns);
        if (!detected) {
            parseError.value = `No PCODE column found. Expecting a column named "${props.pcodeField}" or "PCODE".`;
            return;
        }

        parsedRows.value = rows;
        parsedColumns.value = columns;
        pcodeColumn.value = detected;
        assignments.value = Object.fromEntries(columns.filter(c => c !== detected).map(c => [c, 'skip' as const]));
        step.value = 'configure';
    } catch (err) {
        console.error('Failed to parse CSV', err);
        parseError.value = 'Could not read this file. Make sure it is a valid CSV.';
    } finally {
        isParsing.value = false;
    }
}

function handleDrop(event: DragEvent) {
    isDragging.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) {
        selectedFile.value = file;
        parseFile(file);
    }
}

function handleFileInput(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
        selectedFile.value = file;
        parseFile(file);
    }
}

function backToSelect() {
    step.value = 'select';
    selectedFile.value = null;
    parsedRows.value = [];
    parsedColumns.value = [];
    pcodeColumn.value = null;
    assignments.value = {};
    parseError.value = null;
}

function handleUpload() {
    if (!pcodeColumn.value || !matchIsSufficient.value || !hasAnyAssignment.value) return;
    emit('upload', {
        pcodeColumn: pcodeColumn.value,
        rows: parsedRows.value,
        assignments: assignments.value,
    });
    emit('close');
}
</script>

<template>
    <v-dialog :model-value="true" max-width="40rem" @update:model-value="$emit('close')">
        <v-card rounded="xl" class="overflow-hidden">
            <v-card-title class="flex align-center justify-space-between px-6 py-4">
                <span class="text-xl font-weight-bold">Upload Custom Data</span>
                <v-btn icon="mdi-close" variant="text" density="comfortable" @click="$emit('close')" />
            </v-card-title>

            <v-divider />

            <v-card-text class="px-6 py-6">
                <!-- Step 1: Select file -->
                <div v-if="step === 'select'">
                    <div class="upload-dropzone" :class="{ 'upload-dropzone--active': isDragging }"
                        @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false"
                        @drop.prevent="handleDrop">
                        <v-icon icon="mdi-tray-arrow-up" size="40" class="mb-3 text-heigit-red" />
                        <p class="text-body-2 font-weight-medium mb-1">
                            Drag and drop a CSV here, or
                            <label class="text-heigit-red font-weight-bold" style="cursor: pointer">
                                browse
                                <input type="file" accept=".csv" class="d-none" @change="handleFileInput" />
                            </label>
                        </p>
                        <p class="text-caption text-medium-emphasis">
                            Must include a PCODE column matching "{{ pcodeField }}"
                        </p>

                        <div v-if="isParsing" class="mt-4 text-caption text-medium-emphasis">Parsing file...</div>

                        <div v-if="selectedFile && !isParsing" class="mt-4 d-flex align-center justify-center">
                            <v-chip closable @click:close="selectedFile = null">
                                <v-icon icon="mdi-file-document-outline" start />
                                {{ selectedFile.name }}
                            </v-chip>
                        </div>
                    </div>

                    <v-alert v-if="parseError" type="error" variant="tonal" density="compact" class="mt-4">
                        {{ parseError }}
                    </v-alert>
                </div>

                <!-- Step 2: Configure & assign dimensions -->
                <div v-else>
                    <v-alert
                        :type="matchIsSufficient ? 'success' : 'error'"
                        variant="tonal"
                        density="compact"
                        class="mb-4"
                    >
                        <span v-if="matchIsSufficient">
                            {{ matchCount }}/{{ parsedRows.length }} PCODEs matched this country's boundaries (using column "{{ pcodeColumn }}").
                        </span>
                        <span v-else>
                            Only {{ matchCount }}/{{ parsedRows.length }} PCODEs matched (using column "{{ pcodeColumn }}"). At least {{ Math.round(MATCH_THRESHOLD * 100) }}% must match to continue.
                        </span>
                    </v-alert>

                    <p class="text-caption text-medium-emphasis mb-3">
                        Assign each column to a risk dimension so it can be weighted in the model. Columns left as "Skip" are ignored.
                    </p>

                    <div class="d-flex flex-column" style="gap: 12px; max-height: 20rem; overflow-y: auto;">
                        <div v-for="col in assignableColumns" :key="col" class="d-flex align-center justify-space-between" style="gap: 12px;">
                            <span class="text-body-2 font-weight-medium text-truncate">{{ col }}</span>
                            <select
                                v-model="assignments[col]"
                                class="dimension-select"
                            >
                                <option value="skip">Skip</option>
                                <option value="vul">Vulnerability</option>
                                <option value="cop">Coping Capacity</option>
                                <option value="exp">Exposure</option>
                            </select>
                        </div>
                        <div v-if="assignableColumns.length === 0" class="text-caption text-medium-emphasis text-center py-2">
                            No additional columns found besides the PCODE column.
                        </div>
                    </div>
                </div>
            </v-card-text>

            <v-divider />

            <v-card-actions class="px-6 py-4">
                <v-btn v-if="step === 'configure'" variant="text" @click="backToSelect">Back</v-btn>
                <v-spacer />
                <v-btn variant="text" @click="$emit('close')">Cancel</v-btn>
                <v-btn
                    v-if="step === 'configure'"
                    color="primary"
                    :disabled="!matchIsSufficient || !hasAnyAssignment"
                    @click="handleUpload"
                >
                    Upload
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<style scoped>
.upload-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 2.5rem 1.5rem;
    border: 2px dashed rgb(var(--v-theme-surface-variant, 226 232 240));
    border-color: #e2e8f0;
    border-radius: 12px;
    transition: border-color 0.2s ease, background-color 0.2s ease;
}

.upload-dropzone--active {
    border-color: #ca2333;
    background-color: #fdf2f3;
}

.dimension-select {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #334155;
    background: #f8fafc;
    cursor: pointer;
}
</style>
