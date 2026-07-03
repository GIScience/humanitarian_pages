<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'upload', file: File): void;
}>();

const selectedFile = ref<File | null>(null);
const isDragging = ref(false);

function handleDrop(event: DragEvent) {
    isDragging.value = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) selectedFile.value = file;
}

function handleFileInput(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) selectedFile.value = file;
}

function handleUpload() {
    if (!selectedFile.value) return;
    emit('upload', selectedFile.value);
    emit('close');
}
</script>

<template>
    <v-dialog :model-value="true" max-width="35rem" @update:model-value="$emit('close')">
        <v-card rounded="xl" class="overflow-hidden">
            <v-card-title class="flex align-center justify-space-between px-6 py-4">
                <span class="text-xl font-weight-bold">Upload Custom Data</span>
                <v-btn icon="mdi-close" variant="text" density="comfortable" @click="$emit('close')" />
            </v-card-title>

            <v-divider />
            
            <v-card-text class="px-6 py-6">
                <div class="upload-dropzone" :class="{ 'upload-dropzone--active': isDragging }"
                    @dragover.prevent="isDragging = true" @dragleave.prevent="isDragging = false"
                    @drop.prevent="handleDrop">
                    <v-icon icon="mdi-tray-arrow-up" size="40" class="mb-3 text-heigit-red" />
                    <p class="text-body-2 font-weight-medium mb-1">
                        Drag and drop a file here, or
                        <label class="text-heigit-red font-weight-bold" style="cursor: pointer">
                            browse
                            <input type="file" accept=".csv,.parquet" class="d-none" @change="handleFileInput" />
                        </label>
                    </p>
                    <p class="text-caption text-medium-emphasis">CSV supported</p>

                    <div v-if="selectedFile" class="mt-4 d-flex align-center justify-center">
                        <v-chip closable @click:close="selectedFile = null">
                            <v-icon icon="mdi-file-document-outline" start />
                            {{ selectedFile.name }}
                        </v-chip>
                    </div>
                </div>
            </v-card-text>

            <v-divider />

            <v-card-actions class="px-6 py-4">
                <v-spacer />
                <v-btn variant="text" @click="$emit('close')">Cancel</v-btn>
                <v-btn color="primary" :disabled="!selectedFile" @click="handleUpload">Upload</v-btn>
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
</style>
