#!/usr/bin/env node
/**
 * Fallback stock-image license check.
 *
 * Enforces the Provider Image Strategy rule: every served fallback/stock
 * image MUST have a recorded license. Fails (exit 1) if:
 *   - a .jpg in public/images/fallback/ has no entry in CREDITS.json, or
 *   - a CREDITS.json entry points to a file that doesn't exist, or
 *   - an entry is missing required license fields.
 *
 * Run: node scripts/check-fallback-licenses.js
 * Wire into CI / pre-test to keep the library 100% documented.
 */
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "public", "images", "fallback");
const MANIFEST = path.join(DIR, "CREDITS.json");
const REQUIRED = ["file", "category", "source", "source_url", "license"];

const errors = [];

if (!fs.existsSync(MANIFEST)) {
  console.error(`✗ Missing license manifest: ${MANIFEST}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entries = manifest.images || [];
const byFile = new Map(entries.map((e) => [e.file, e]));

// Every entry must be complete and point to a real file.
for (const e of entries) {
  for (const k of REQUIRED) {
    if (!e[k]) errors.push(`Entry "${e.file || "?"}" missing required field "${k}"`);
  }
  if (e.file && !fs.existsSync(path.join(DIR, e.file))) {
    errors.push(`Manifest lists "${e.file}" but the file does not exist on disk`);
  }
}

// Every served .jpg must be documented.
const onDisk = fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));
for (const f of onDisk) {
  if (!byFile.has(f)) {
    errors.push(`"${f}" is served but has NO entry in CREDITS.json (license unproven)`);
  }
}

if (errors.length) {
  console.error(`✗ Fallback license check failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✓ Fallback license check passed: ${onDisk.length} images, all documented in CREDITS.json`);
