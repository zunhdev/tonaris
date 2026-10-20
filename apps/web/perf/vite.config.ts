// The perf page (TON-21): a production build of perf/, served by `vite preview` on port 3200 for the Playwright
// perf suite (playwright.perf.config.ts). It is not part of the web app's build.

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  resolve: { tsconfigPaths: true },
  build: { outDir: "dist", emptyOutDir: true },
  preview: { port: 3200, strictPort: true },
  plugins: [react()],
});
