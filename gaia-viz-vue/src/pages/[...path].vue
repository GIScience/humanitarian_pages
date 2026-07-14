<script setup lang="ts">
import { useRouter } from "vue-router";
import PageLayout from "@/layout/PageLayout.vue";

const router = useRouter();

function goHome() {
  router.push("/");
}
</script>

<template>
  <PageLayout title="Page Not Found" :fullHeight="true">
    <div class="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p class="text-4xl font-extrabold text-heigit-red">404</p>
      <h1 class="text-2xl font-semibold text-gray-800">
        We couldn't find that page
      </h1>
      <p class="max-w-md text-gray-500">
        The page you're looking for doesn't exist, may have been moved, or the
        link might be broken.
      </p>
      <button
        class="flex items-center rounded-md bg-heigit-red px-4 py-2 text-white transition hover:opacity-90"
        @click="goHome"
      >
        Back to home
      </button>
    </div>
  </PageLayout>
</template>
