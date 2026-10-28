#!/usr/bin/env node
// ui-police lint: deterministic UI linter for TSX/JSX/CSS. Zero dependencies (node >= 20).
//
//   ui-police lint <file|dir>...              lint whole files
//   ui-police lint --diff <file|->            lint only the lines a unified diff adds (gh pr diff N > pr.diff)
//   ui-police lint --git <base> [--repo DIR]  lint the working tree against <base> (git diff <base>)
//   options: --format text|json, --strict (warnings fail too), --config FILE, --quiet
// Exit: 0 clean, 1 errors (or warnings with --strict), 2 usage/IO error.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseUnifiedDiff } from './lib/diff.mjs';
import { classify, loadProjectConfig } from './lib/config.mjs';
import { lintFile, rules } from './lib/rules.mjs';

function usage(code = 2) {
  process.stderr.write(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').slice(1, 9).map((l) => l.replace(/^\/\/ ?/, '')).join('\n') + '\n');
  process.exit(code);
}

export function parseArgs(argv) {
  const opts = { paths: [], format: 'text', strict: false, config: null, diff: null, git: null, repo: process.cwd(), quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--format') opts.format = argv[++i];
    else if (a === '--strict') opts.strict = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--config') opts.config = argv[++i];
    else if (a === '--diff') opts.diff = argv[++i];
    else if (a === '--git') opts.git = argv[++i];
    else if (a === '--repo') opts.repo = argv[++i];
    else if (a === '-h' || a === '--help') usage(0);
    else if (a.startsWith('-')) { process.stderr.write(`unknown option ${a}\n`); usage(); }
    else opts.paths.push(a);
  }
  return opts;
}

export const loadConfig = loadProjectConfig;

function* walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(p)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      yield* walk(path.join(p, name));
    }
  } else yield p;
}

function relTo(repo, p) { return path.relative(repo, path.resolve(p)).replace(/\\/g, '/') || p; }

export function lintPaths(paths, config, repo) {
  const findings = [];
  let files = 0;
  for (const root of paths) {
    for (const file of walk(root)) {
      const rel = relTo(repo, file);
      const kind = classify(rel, config);
      if (!kind.isUi || kind.isExempt) continue;
      files += 1;
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      findings.push(...lintFile({ file: rel, lines, targets: null, isNew: false, kind }));
    }
  }
  return { findings, files };
}

export function lintDiffText(text, config, repo) {
  const findings = [];
  let files = 0;
  for (const entry of parseUnifiedDiff(text)) {
    const kind = classify(entry.path, config);
    if (!kind.isUi || kind.isExempt || entry.added.size === 0) continue;
    files += 1;
    const onDisk = repo ? path.join(repo, entry.path) : null;
    let lines;
    if (onDisk && fs.existsSync(onDisk)) {
      lines = fs.readFileSync(onDisk, 'utf8').split(/\r?\n/);
      // Guard against a stale checkout: every added line must be where the diff says.
      const stale = [...entry.added].some(([n, t]) => lines[n - 1] !== t);
      if (stale) lines = null;
    }
    if (!lines) {
      const max = Math.max(...entry.added.keys(), ...entry.context.keys(), 0);
      lines = new Array(max).fill('');
      for (const [n, t] of entry.context) lines[n - 1] = t;
      for (const [n, t] of entry.added) lines[n - 1] = t;
    }
    findings.push(...lintFile({ file: entry.path, lines, targets: new Set(entry.added.keys()), isNew: entry.isNew, kind }));
  }
  return { findings, files };
}

export function format(findings, files, fmt) {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.length - errors;
  if (fmt === 'json') return JSON.stringify({ errors, warnings: warns, files, findings, rules: rules.map((r) => ({ id: r.id, severity: r.severity, description: r.description })) }, null, 2) + '\n';
  const lines = findings.map((f) => `${f.file}:${f.line}: ${f.severity} [${f.rule}] ${f.message}\n    fix: ${f.fix}`);
  lines.push(`ui-police lint: ${errors} error${errors === 1 ? '' : 's'}, ${warns} warning${warns === 1 ? '' : 's'} in ${files} UI file${files === 1 ? '' : 's'}${findings.length ? '' : ' — clean'}`);
  return lines.join('\n') + '\n';
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const repo = path.resolve(opts.repo);
  const config = loadConfig(repo, opts.config);
  let result;
  if (opts.diff) {
    const text = opts.diff === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(opts.diff, 'utf8');
    result = lintDiffText(text, config, repo);
  } else if (opts.git) {
    const text = execFileSync('git', ['-C', repo, 'diff', '--no-color', '--unified=0', opts.git], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    result = lintDiffText(text, config, repo);
  } else if (opts.paths.length) {
    result = lintPaths(opts.paths, config, repo);
  } else usage();
  const out = format(result.findings, result.files, opts.format);
  if (!opts.quiet || opts.format === 'json') process.stdout.write(out);
  else process.stdout.write(out.split('\n').slice(-2).join('\n'));
  const errors = result.findings.filter((f) => f.severity === 'error').length;
  const warns = result.findings.length - errors;
  return errors > 0 || (opts.strict && warns > 0) ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  try { process.exit(main()); } catch (e) { process.stderr.write(`ui-police lint: ${e.message}\n`); process.exit(2); }
}
