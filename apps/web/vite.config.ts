// Vite runs the TanStack Start app (TS-03) under Bun: `bun --bun vite dev` on port 3000 (TS-06).

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // `@/…` inside the app and `@tonaris/ui/…` inside the design system resolve through each tsconfig's paths.
  resolve: { tsconfigPaths: true },
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  plugins: [tailwindcss(), tanstackStart(), react()],
});
