// Vite runs the TanStack Start app (TS-03) under Bun: `bun --bun vite dev` on port 3000 (TS-06). `vite build`
// bundles every dependency into the server build, so the production server (server.ts) and the web image need no
// node_modules (TS-110). Help's pages are MDX (TS-136): compiled before React's plugin sees them, with their
// frontmatter as an export and an id on every heading.

import mdx from "@mdx-js/rollup";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import rehypeSlug from "rehype-slug";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdxFrontmatter from "remark-mdx-frontmatter";
import { defineConfig } from "vite";

import { helpPages } from "./scripts/help-pages.ts";

export default defineConfig(({ command }) => ({
  // `@/…` inside the app and `@tonaris/ui/…` inside the design system resolve through each tsconfig's paths.
  resolve: { tsconfigPaths: true },
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  plugins: [
    helpPages(),
    {
      enforce: "pre",
      ...mdx({
        remarkPlugins: [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter],
        rehypePlugins: [rehypeSlug],
      }),
    },
    tailwindcss(),
    tanstackStart(),
    react({ include: /\.(mdx|tsx?|jsx?)$/ }),
  ],
  ...(command === "build" ? { ssr: { noExternal: true } } : {}),
}));
