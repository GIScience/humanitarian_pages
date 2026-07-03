import { createRouter, createWebHashHistory } from "vue-router";

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/views/AppSwitcher.vue"),
    },
    {
      path: "/story-map/:id/:section?",
      name: "Product",
      component: () => import("@/views/story-map/StoryMapView.vue"),
    },
  ],
});

export default router;
