// The root of @tonaris/ui, the Tonaris design system (DS-10–DS-29), so the package resolves by its bare name, as a
// declared workspace dependency must (tooling/src/workspace-check.ts). Components are imported by path
// (`@tonaris/ui/components/button`), class merging as `@tonaris/ui/lib/utils` and the styles as
// `@tonaris/ui/globals.css`.

export { cn } from "./lib/utils";
