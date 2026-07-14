<script lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import PageLayout from "@/layout/PageLayout.vue";

export default {
  setup() {
    const router = useRouter();

    onMounted(() => {
      router.push("/story-map/vulnerability");
    });
  },
};
</script>

<template></template>

<style scoped></style>
