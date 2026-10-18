// Zod, as every domain module imports it. In browsers the web app's CSP forbids eval (TS-101), so Zod runs
// without its compiled parsers there; otherwise its probe for `new Function` is reported as a CSP violation on
// every page. Zod decides when a schema is built, hence one module that every schema module imports first.
// Servers keep the compiled parsers.

import { z } from "zod";

if ("document" in globalThis) z.config({ jitless: true });

export { z };
