import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import MainView from './views/MainView.vue'
import 'maplibre-gl/dist/maplibre-gl.css'
import './assets/main.css'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', component: MainView }
  ]
})

const app = createApp(App)
app.use(router)
app.mount('#app')
