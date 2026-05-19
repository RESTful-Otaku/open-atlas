import { mount } from "svelte";

import "./app.css";
import "maplibre-gl/dist/maplibre-gl.css";

import App from "./App.svelte";
import { connectDb, disconnectDb } from "./lib/connection.svelte";
import { installDemoData } from "./lib/demo-install.svelte";
import { isDemoModeRequested } from "./lib/demo-mode";
import { initTheme } from "./lib/theme.svelte";

const target = document.getElementById("app");
if (!target) {
  throw new Error("missing #app root");
}

initTheme();

const app = mount(App, { target });
if (isDemoModeRequested()) {
  if (new URLSearchParams(window.location.search).get("demo") === "1") {
    try {
      localStorage.setItem("openatlas-demo-mode", "1");
    } catch {
      /* private mode */
    }
  }
  installDemoData();
} else {
  connectDb();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disconnectDb();
  });
}

export default app;
