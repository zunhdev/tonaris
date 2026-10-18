// Writes the committed OpenAPI document, or with `--check` fails when it differs from the routes (TS-09).
// `bun run openapi:generate` and `bun run openapi:check`; CI diffs it too (TS-124).

import path from "node:path";

import { createDatabase } from "@tonaris/db";

import { createApp } from "./app";
import { createAuth } from "./auth/auth";
import { apiConfig } from "./config";
import { committedDocumentPath, openApiDocument, serializeDocument } from "./openapi";

/**
 * The document as the current routes generate it, in its committed text form. The app is built on the local
 * defaults and never handles a request, so no database or mail server is needed.
 */
export function generatedDocument(): string {
  const config = apiConfig({});
  const email = { send: () => Promise.resolve() };
  const app = createApp({ config, auth: createAuth({ config, db: createDatabase(), email }) });
  return serializeDocument(openApiDocument(app));
}

if (import.meta.main) {
  const generated = generatedDocument();
  const relative = path.relative(process.cwd(), committedDocumentPath);
  const committed = Bun.file(committedDocumentPath);
  const current = (await committed.exists()) ? await committed.text() : undefined;

  if (process.argv.includes("--check")) {
    if (current !== generated) {
      console.error(
        `${relative} is out of date with the routes. Run \`bun run openapi:generate\`, review the diff and commit it.`,
      );
      process.exit(1);
    }
    console.log(`${relative} matches the routes.`);
  } else if (current === generated) {
    console.log(`${relative} is up to date.`);
  } else {
    await Bun.write(committedDocumentPath, generated);
    console.log(`Wrote ${relative}.`);
  }
}
