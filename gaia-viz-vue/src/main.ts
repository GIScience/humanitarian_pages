import { createApp } from "vue";
import { createPinia } from "pinia";
import "./assets/styles/main.css";
import App from "./App.vue";
import router from "./router";
import vuetify from "@/plugins/vuetify";
import { registerGlobalComponents } from "@/plugins/globalComponents";

const pinia = createPinia();
const app = createApp(App);

app.use(router);
// Register Pinia and Vuetify plugins
app.use(pinia);
app.use(vuetify);

// Register global components for markdown rendering
registerGlobalComponents(app);
app.mount("#app");
