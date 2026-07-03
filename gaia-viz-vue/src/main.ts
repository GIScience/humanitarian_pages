import { createApp } from "vue";
import "./assets/styles/main.css";
import App from "./App.vue";
import router from "./router";
import { registerGlobalComponents } from "@/plugins/globalComponents";

const app = createApp(App);
app.use(router);
registerGlobalComponents(app);
app.mount("#app");
