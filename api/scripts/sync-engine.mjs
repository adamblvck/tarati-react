#!/usr/bin/env node
// Vendors the pure Tarati rules engine (src/GameBoard.js + src/AI.js) into
// api/src/lib/engine/ so the server can validate moves authoritatively with the
// exact same logic as the client (and, transitively, the Python engine that the
// parity fixture pins them all to).
//
// Node ESM requires explicit ".js" extensions on relative imports, whereas the
// CRA/webpack client build allows extensionless ones — so we rewrite those on
// the way in. The behavioural drift guard lives in api/test/engine-parity.test.js.
//
// Run via `npm run engine:sync` (also runs automatically on `prebuild`/`test`).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, "..");
const srcRoot = join(apiRoot, "..", "src"); // tarati-react/src
const outDir = join(apiRoot, "src", "lib", "engine");

const FILES = ["GameBoard.js", "AI.js"];

const HEADER =
  "// AUTO-GENERATED — DO NOT EDIT.\n" +
  "// Vendored from ../../../../src/<name> by api/scripts/sync-engine.mjs.\n" +
  "// Edit the source in tarati-react/src and re-run `npm run engine:sync`.\n\n";

// Add ".js" to relative imports that lack a file extension (Node ESM needs it).
function fixRelativeImports(code) {
  return code.replace(
    /(from\s+['"])(\.[^'"]*?)(['"])/g,
    (match, pre, spec, post) => {
      if (/\.[a-zA-Z0-9]+$/.test(spec)) return match; // already has an extension
      return `${pre}${spec}.js${post}`;
    }
  );
}

mkdirSync(outDir, { recursive: true });

for (const file of FILES) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  const transformed = HEADER + fixRelativeImports(source);
  const dest = join(outDir, file);

  // Only write when the content actually changed. An unconditional write
  // updates the mtime, which makes `tsx watch` restart the dev API — and since
  // this script runs on `test`/`prebuild`, that restart lands exactly as the
  // integration suite starts making requests, failing them all with
  // "fetch failed".
  const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;
  if (current === transformed) {
    console.log(`engine up to date: ${file}`);
    continue;
  }
  writeFileSync(dest, transformed);
  console.log(`synced engine: ${file}`);
}
