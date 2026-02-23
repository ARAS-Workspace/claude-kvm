#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.join(__dirname, "rules");

async function loadRules() {
  const entries = fs.readdirSync(RULES_DIR, { withFileTypes: true });
  const rules = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rulePath = path.join(RULES_DIR, entry.name, "index.js");
    if (!fs.existsSync(rulePath)) continue;
    const mod = await import(pathToFileURL(rulePath).href);
    rules.push({ ...mod.default, id: entry.name });
  }

  return rules.sort(
    (a, b) => (a.order ?? 50) - (b.order ?? 50) || a.id.localeCompare(b.id),
  );
}

async function format(content, config = {}) {
  const rules = await loadRules();
  let result = content;

  for (const rule of rules) {
    const options = { ...rule.defaults, ...config[rule.id] };
    const before = result;
    result = rule.transform(result, options);
    if (result !== before) {
      console.error(`  + ${rule.name}`);
    }
  }

  return result;
}

const args = process.argv.slice(2);
const inputPath = args[0] || path.join(process.cwd(), "README.md");
const outputPath = args[1];

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

console.error(`readme-formatter: ${inputPath}`);
const content = fs.readFileSync(inputPath, "utf-8");
const result = await format(content);

if (outputPath) {
  fs.writeFileSync(outputPath, result);
  console.error(`Output: ${outputPath}`);
} else {
  process.stdout.write(result);
}