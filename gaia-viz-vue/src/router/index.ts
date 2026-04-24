import { createRouter, createWebHashHistory } from 'vue-router'
import AppSwitcher from '../views/AppSwitcher.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: AppSwitcher
    }
  ]
})

export default router
