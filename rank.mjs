#!/usr/bin/env node
// ui-police rank: turn `ui-police lint --format json` output into a worst-first offender table.
//   ui-police lint --format json src > lint.json && node scripts/ui-police/rank.mjs lint.json [--top N] [--by file|dir|rule]
import fs from 'node:fs';
import path from 'node:path';

export function rank(findings, by = 'file', depth = 4) {
  const key = (f) => (by === 'rule' ? f.rule : by === 'dir' ? f.file.split('/').slice(0, depth).join('/') : f.file);
  const rows = new Map();
  for (const f of findings) {
    const k = key(f);
    const r = rows.get(k) || { key: k, errors: 0, warnings: 0, rules: new Map() };
    if (f.severity === 'error') r.errors += 1; else r.warnings += 1;
    r.rules.set(f.rule, (r.rules.get(f.rule) || 0) + 1);
    rows.set(k, r);
  }
  return [...rows.values()].sort((a, b) => b.errors - a.errors || b.warnings - a.warnings || a.key.localeCompare(b.key)).map((r) => ({ ...r, rules: [...r.rules.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(', ') }));
}

export function table(rows, top = 40) {
  const l = ['| # | path | errors | warnings | rules |', '|---|---|---|---|---|'];
  rows.slice(0, top).forEach((r, i) => l.push(`| ${i + 1} | \`${r.key}\` | ${r.errors} | ${r.warnings} | ${r.rules} |`));
  return l.join('\n');
}

export function parseRankArgs(argv = process.argv.slice(2)) {
  let file = null;
  let top = 40;
  let by = 'file';
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--top') {
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid --top: ${raw}`);
      top = Math.floor(n);
    } else if (a === '--by') {
      by = argv[++i] || '';
      if (!['file', 'dir', 'rule'].includes(by)) throw new Error(`invalid --by: ${by}`);
    } else if (a.startsWith('--')) {
      throw new Error(`unknown option ${a}`);
    } else if (file === null) {
      file = a;
    }
  }
  return { file, top, by };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const { file, top, by } = parseRankArgs(process.argv.slice(2));
  const json = JSON.parse(fs.readFileSync(file === '-' || !file ? 0 : file, 'utf8'));
  process.stdout.write(`${json.errors} errors, ${json.warnings} warnings in ${json.files} UI files\n\n${table(rank(json.findings, by), top)}\n`);
}
