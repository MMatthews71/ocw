import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Capacitor serves the built app from the device filesystem, so all asset
// URLs must be relative (base: "./") rather than absolute from the server root.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "dist",
    // Course PDFs can be large; don't warn about chunk size for the bundled viewer.
    chunkSizeWarningLimit: 2000,
  },
});
