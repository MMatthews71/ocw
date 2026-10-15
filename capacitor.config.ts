import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.maxma.opencourse",
  appName: "OpenCourse",
  webDir: "dist",
  android: {
    // Allow the WebView to load YouTube embeds and archive.org video over https.
    allowMixedContent: false,
  },
};

export default config;
