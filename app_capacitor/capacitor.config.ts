import type { CapacitorConfig } from "@capacitor/cli";
import { FRONTEND_HOST, FRONTEND_URL } from "./src/config.ts";

const config: CapacitorConfig = {
  appId: "info.tigerbot.app",
  appName: "TigerBot",
  webDir: "www",
  loggingBehavior: "debug",
  backgroundColor: "#101323",
  server: {
    url: FRONTEND_URL,
    cleartext: false,
    allowNavigation: [FRONTEND_HOST],
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#101323",
    allowMixedContent: false,
    captureInput: true,
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#101323",
    },
  },
};

export default config;
