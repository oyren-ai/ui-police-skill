#!/usr/bin/env node
// Capture and judge a list of screens.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertJudge, mdText } from './judge.mjs';
import { assertSafeOutputDir, readSafeOutputFile, writeSafeOutputFile } from './lib/fs-safe.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function parseArgs(argv) {
  const o = { file: null, out: null, with: 'claude', model: null, only: null, skipJudge: false, judgeOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--with') o.with = argv[++i];
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--only') o.only = argv[++i].split(',');
    else if (a === '--skip-judge') o.skipJudge = true;
    else if (a === '--judge-only') o.judgeOnly = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else o.file = a;
  }
  if (!o.file || !o.out) throw new Error('usage: ui-police sweep <screens.json> --out DIR [--with claude|codex|agy|self]');
  assertJudge(o.with);
  return o;
}

export function validateScreenEntry(screen, root) {
  if (!screen || typeof screen !== 'object' || !NAME_RE.test(screen.name || '')) throw new Error('invalid screen name');
  if (typeof screen.url !== 'string' || !screen.url) throw new Error(`missing URL for ${screen.name}`);
  const out = path.resolve(root, screen.name);
  const rel = path.relative(path.resolve(root), out);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('screen path escapes output');
  const st = fs.lstatSync(out, { throwIfNoEntry: false });
  if (st?.isSymbolicLink()) throw new Error('screen path is a symlink');
  return out;
}

export function lookArgsFor(screen, url, out) {
  const args = [path.join(HERE, 'look.mjs'), url, '--out', out, '--name', screen.name];
  for (const [key, flag] of Object.entries({ ref: '--ref', storageState: '--storage-state', themes: '--themes', settle: '--settle', wait: '--wait' })) {
    if (screen[key] !== undefined && screen[key] !== null) args.push(flag, String(screen[key]));
  }
  return args;
}

export function sweepExitCode(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.some((r) => !['PASS', 'FAIL'].includes(r.verdict))) return 2;
  return rows.some((r) => r.verdict === 'FAIL') ? 1 : 0;
}

export function rankRows(rows) {
  const score = (r) => (r.verdict === 'ERROR' || r.verdict === 'PENDING' ? -1 : r.verdict === 'FAIL' ? 0 : 1) * 1000 + (r.sum ?? 50) - r.hard * 10;
  return [...rows].sort((a, b) => score(a) - score(b));
}

export function summary(rows) {
  return ['| screen | verdict | hard | report |', '|---|---|---:|---|', ...rows.map((r) => `| ${mdText(r.name)} | ${mdText(r.verdict)} | ${mdText(r.hard)} | ${mdText(r.report)} |`)].join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const o = parseArgs(argv);
  const raw = JSON.parse(fs.readFileSync(o.file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('screens.json must be an array');
  const screens = raw.filter((s) => !o.only || o.only.includes(s.name));
  fs.mkdirSync(o.out, { recursive: true });
  const root = assertSafeOutputDir(o.out);
  for (const s of screens) validateScreenEntry(s, root);
  const rows = [];
  for (const s of screens) {
    const out = validateScreenEntry(s, root);
    if (!o.judgeOnly) {
      const r = spawnSync(process.execPath, lookArgsFor(s, s.url, out), { encoding: 'utf8', timeout: 600000 });
      if (r.status !== 0) { rows.push({ name: s.name, verdict: 'ERROR', hard: 0, report: '-', error: r.stderr }); continue; }
    }
    const reportPath = path.join(out, 'report.json');
    if (!fs.existsSync(reportPath)) { rows.push({ name: s.name, verdict: 'ERROR', hard: 0, report: '-', error: 'capture missing' }); continue; }
    if (!o.skipJudge) {
      const args = [path.join(HERE, 'judge.mjs'), out, '--with', o.with];
      if (o.model) args.push('--model', o.model);
      const r = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 1200000 });
      if (![0, 1].includes(r.status)) { rows.push({ name: s.name, verdict: 'ERROR', hard: 0, report: '-', error: r.stderr }); continue; }
    }
    const report = JSON.parse(readSafeOutputFile(out, 'report.json'));
    rows.push({ name: s.name, verdict: report.verdict, hard: report.deterministic?.hard?.length || 0, sum: Object.values(report.judge?.scores || {}).reduce((a,b) => a + b, 0), report: path.join(out, 'report.md') });
  }
  const ranked = rankRows(rows);
  const body = `# UI police sweep\n\n${summary(ranked)}\n`;
  writeSafeOutputFile(root, 'sweep-summary.md', body);
  writeSafeOutputFile(root, 'sweep.json', JSON.stringify(ranked, null, 2));
  process.stdout.write(body);
  return sweepExitCode(ranked);
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try { process.exit(main()); } catch (e) { process.stderr.write(`ui-police sweep: ${e.message}\n`); process.exit(2); }
}
