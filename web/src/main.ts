import { mount } from "svelte";

import "./app.css";
import "maplibre-gl/dist/maplibre-gl.css";

import App from "./App.svelte";
import { installRouter } from "./lib/router.svelte";
import { connectDb, disconnectDb } from "./lib/connection.svelte";
import { installDemoData } from "./lib/demo-install.svelte";
import { isDemoModeRequested } from "./lib/demo-mode";
import { initTheme } from "./lib/theme.svelte";
import { installDashboardFlushVisibilityHook } from "./lib/dashboard-flush";
import {
  applyStoredUpdateCadence,
  installDashboardFlushCadence,
} from "./lib/update-interval.svelte";
import { refreshRemoteReadiness } from "./lib/readiness.svelte";
import { bootstrapMobileLayout, initMobileShell } from "./lib/mobile-layout";

const target = document.getElementById("app");
if (!target) {
  throw new Error("missing #app root");
}

initTheme();
bootstrapMobileLayout();
installRouter();
installDashboardFlushVisibilityHook();
installDashboardFlushCadence();
applyStoredUpdateCadence();

const app = mount(App, { target });

async function hideNativeSplashWhenReady(): Promise<void> {
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* web-only or plugin unavailable */
  }
}

void initMobileShell().then(() => {
  void refreshRemoteReadiness();
  return hideNativeSplashWhenReady();
});

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
