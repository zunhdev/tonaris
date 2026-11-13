// Dependency updates with taze (TS-07; the update-packages skill): `bun run deps:check` lists them.
// Every version is pinned exactly, so locked versions are included. A release must be 7 days old; a fix for a
// security advisory skips the wait (the skill passes `--maturity-period 0` for it).
import { defineConfig } from "taze";

export default defineConfig({
  mode: "major",
  recursive: true,
  includeLocked: true,
  maturityPeriod: 7,
  // Bun and its types move with `.bun-version` (the update-tooling skill and the workspace check).
  exclude: ["bun", "@types/bun"],
  // TanStack DB follows its 1.0 release candidates, the npm `latest` tag (TS-24).
  packageMode: { "@tanstack/db": "latest", "@tanstack/react-db": "latest" },
  // Workflow actions stay pinned to commit SHAs (TS-124).
  githubActions: { style: "sha" },
  // Node is pinned in mise.toml, which taze doesn't read (the update-tooling skill).
  nodeVersion: false,
  ignorePaths: ["**/node_modules/**", "**/dist/**", ".claude/worktrees/**"],
  // A slow metadata answer otherwise drops a package from the list without a word.
  requestTimeout: 20_000,
  retry: 4,
  force: true,
});
