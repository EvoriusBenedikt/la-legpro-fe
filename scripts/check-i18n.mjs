#!/usr/bin/env node
/* i18n parity check: `npm run i18n:check`.
   Reads src/i18n.ts (no build step, no TS compiler) and verifies that the
   `id` and `en` dictionaries have:
   - identical key sets (tsc already enforces this for `en`; the script also
     reports it with a readable diff and covers duplicates),
   - identical {placeholder} sets per key,
   - non-empty values,
   and that GREETING_POOLS id/en mirror each other (same length, same
   placeholders position by position).
   Exits non-zero with a diff on any mismatch. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = resolve(here, '../src/i18n.ts');
const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

/** Return the text between `startMarker` and the next `endMarker` (exclusive). */
function slice(startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`Marker not found: ${startMarker}`);
  const from = start + startMarker.length;
  const end = src.indexOf(endMarker, from);
  if (end < 0) throw new Error(`End marker not found after: ${startMarker}`);
  return src.slice(from, end);
}

/** Evaluate an object-literal body (comments and trailing commas are fine). */
function evalObject(body, label) {
  try {
    return new Function(`return ({${body}\n});`)();
  } catch (e) {
    throw new Error(`Could not evaluate ${label}: ${e.message}`);
  }
}

/** Duplicate keys silently collapse when evaluated, so count them textually. */
function duplicateKeys(body) {
  const seen = new Map();
  for (const m of body.matchAll(/^ {2}([A-Za-z_]\w*):/gm)) {
    seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
  return [...seen].filter(([, n]) => n > 1).map(([k]) => k);
}

const idBody = slice('const id = {', '\n} as const;');
const enBody = slice('const en: Record<StringKey, string> = {', '\n};');
const poolBody = slice('export const GREETING_POOLS: Record<Locale, string[]> = {', '\n};');

const id = evalObject(idBody, 'id dictionary');
const en = evalObject(enBody, 'en dictionary');
const pools = evalObject(poolBody, 'GREETING_POOLS');

const problems = [];
const placeholders = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

for (const [name, body] of [['id', idBody], ['en', enBody]]) {
  for (const k of duplicateKeys(body)) problems.push(`duplicate key in ${name}: ${k}`);
}

const idKeys = Object.keys(id);
const enKeys = Object.keys(en);
for (const k of idKeys) if (!(k in en)) problems.push(`missing in en: ${k}`);
for (const k of enKeys) if (!(k in id)) problems.push(`extra in en (not in id): ${k}`);

for (const k of idKeys) {
  if (!(k in en)) continue;
  for (const [name, dict] of [['id', id], ['en', en]]) {
    if (typeof dict[k] !== 'string' || dict[k].trim() === '') problems.push(`empty value in ${name}: ${k}`);
  }
  const a = placeholders(id[k]);
  const b = placeholders(en[k]);
  if (a.join(',') !== b.join(',')) {
    problems.push(`placeholder mismatch for ${k}: id {${a.join(', ')}} vs en {${b.join(', ')}}`);
  }
}

if (!Array.isArray(pools.id) || !Array.isArray(pools.en)) {
  problems.push('GREETING_POOLS must define id and en arrays');
} else {
  if (pools.id.length !== pools.en.length) {
    problems.push(`GREETING_POOLS length differs: id ${pools.id.length} vs en ${pools.en.length}`);
  }
  const n = Math.min(pools.id.length, pools.en.length);
  for (let i = 0; i < n; i++) {
    const a = placeholders(pools.id[i]);
    const b = placeholders(pools.en[i]);
    if (a.join(',') !== b.join(',')) {
      problems.push(`GREETING_POOLS[${i}] placeholder mismatch: id {${a.join(', ')}} vs en {${b.join(', ')}}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`i18n check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`i18n check passed: ${idKeys.length} keys, ${pools.id.length} greeting variants, placeholders match.`);
