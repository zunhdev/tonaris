// The API's pre-deploy step on Render (TS-17, TS-71, TS-110): `bun bin/predeploy.js` in the API image runs
// `bin/migrate.js`, then `bin/seed-creator.js`, beside it, and stops at the first that fails. It is one command with no
// shell syntax because Render runs the pre-deploy command without a shell and keeps its quotes: `sh -c "a && b"`
// looked for a program named `a && b`.

import path from "node:path";

if (import.meta.main) {
  for (const script of ["migrate.js", "seed-creator.js"]) {
    const { exitCode } = Bun.spawnSync([process.execPath, path.join(import.meta.dir, script)], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (exitCode !== 0) process.exit(exitCode ?? 1);
  }
}
