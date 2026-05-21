import type { CapacitorConfig } from "@capacitor/cli";

const liveReloadUrl = process.env.CAPACITOR_SERVER_URL?.trim();

/** Hosts the WebView may navigate to (dev LAN, cloud STDB, ingest). */
const allowNavigation = [
  "localhost",
  "127.0.0.1",
  "10.0.2.2",
  "*.spacetimedb.com",
  "maincloud.spacetimedb.com",
];

const config: CapacitorConfig = {
  appId: "com.openatlas.app",
  appName: "OpenAtlas",
  webDir: "dist",
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: "#09090b",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#09090b",
    },
  },
  android: {
    allowMixedContent: true,
  },
  ios: {
    contentInset: "automatic",
    scheme: "openatlas",
  },
  server: liveReloadUrl
    ? {
        url: liveReloadUrl,
        cleartext: liveReloadUrl.startsWith("http://"),
        androidScheme: "https",
        allowNavigation,
      }
    : {
        cleartext: true,
        androidScheme: "https",
        allowNavigation,
      },
};

export default config;
