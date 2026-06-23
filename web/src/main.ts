import { mount } from "svelte";

import "./app.css";


import App from "./App.svelte";
import { installRouter } from "./lib/router.svelte";
import { connectDb, disconnectDb } from "./lib/connection.svelte";
import { installDemoData } from "./lib/demo-install.svelte";
import { isDemoModeRequested } from "./lib/demo-mode";
import { bakedEnvSummary } from "./lib/mobile-build-env";
import {
  deploymentConfigEnabled,
  loadMobileRuntimeConfig,
  profileWantsDemo,
  seedRuntimeConfigFromBuildEnv,
} from "./lib/mobile-runtime-config";
import { initTheme } from "./lib/theme.svelte";
import { installDashboardFlushVisibilityHook } from "./lib/dashboard-flush";
import {
  applyStoredUpdateCadence,
  installDashboardFlushCadence,
} from "./lib/update-interval.svelte";
import { appendOpsLog } from "./lib/observability/log-stream";
import { refreshRemoteReadiness } from "./lib/readiness.svelte";
import { bootstrapMobileLayout, initMobileShell, isNativeApp } from "./lib/mobile-layout";

const target = document.getElementById("app");
if (!target) {
  throw new Error("missing #app root");
}

initTheme();
bootstrapMobileLayout();
installRouter();
const flushVisibilityTeardown = installDashboardFlushVisibilityHook();
installDashboardFlushCadence();
applyStoredUpdateCadence();

if (deploymentConfigEnabled()) {
  seedRuntimeConfigFromBuildEnv();
}

const app = mount(App, { target });

async function hideNativeSplashWhenReady(): Promise<void> {
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {

  }
}

appendOpsLog(
  "info",
  "app",
  `OpenAtlas UI started · ${isNativeApp() ? "native" : "web"} · demo=${isDemoModeRequested() ? "yes" : "no"} · ${import.meta.env.MODE}${isNativeApp() ? ` · ${bakedEnvSummary()}` : ""}`,
);

void initMobileShell().then(() => {
  void refreshRemoteReadiness().catch(() => {});
  return hideNativeSplashWhenReady();
}).catch(() => {});

function shouldBootDemo(): boolean {
  if (isDemoModeRequested()) return true;
  if (deploymentConfigEnabled() && profileWantsDemo(loadMobileRuntimeConfig())) {
    return true;
  }
  return false;
}

if (shouldBootDemo()) {
  localStorage.setItem("openatlas-demo-mode", "1");
  installDemoData();
} else {
  connectDb();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    flushVisibilityTeardown();
    disconnectDb();
  });
}

export default app;
