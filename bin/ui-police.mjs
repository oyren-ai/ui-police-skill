#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rules } from '../lib/rules.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command = 'help', ...args] = process.argv.slice(2);
const scripts = { lint: 'lint.mjs', look: 'look.mjs', refs: 'look.mjs', judge: 'judge.mjs', sweep: 'sweep.mjs', rank: 'rank.mjs' };
if (command === 'help' || command === '--help' || command === '-h') {
  process.stdout.write('ui-police <lint|look|refs|judge|sweep|rank|rules|install>\nSee README.md for options.\n');
} else if (command === 'rules') {
  for (const rule of rules) process.stdout.write(`${rule.severity.padEnd(5)} ${rule.id.padEnd(20)} ${rule.description}\n`);
} else if (command === 'install') {
  const result = spawnSync('bash', [path.join(root, 'install.sh'), ...args], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exit(result.status ?? 2);
} else if (scripts[command]) {
  const script = path.join(root, scripts[command]);
  if (!fs.existsSync(script)) throw new Error(`missing command ${command}`);
  const argv = command === 'refs' ? ['--capture-reference', ...args] : args;
  const result = spawnSync(process.execPath, [script, ...argv], { stdio: 'inherit', env: { ...process.env, UI_POLICE_HOME: root } });
  if (result.error) throw result.error;
  process.exit(result.status ?? 2);
} else {
  process.stderr.write(`unknown command ${command}\n`);
  process.exit(64);
}
