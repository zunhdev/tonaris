// The parts of Sentry the web app uses, loaded only when error reports are on (src/observability.ts): naming them
// here keeps the rest, such as session replay, out of the chunk.

export { breadcrumbsIntegration, captureException, init } from "@sentry/browser";
