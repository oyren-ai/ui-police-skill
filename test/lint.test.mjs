import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { lintFile, rules } from '../lib/rules.mjs';
import { parseUnifiedDiff } from '../lib/diff.mjs';
import { classify, DEFAULT_CONFIG, globToRegExp } from '../lib/config.mjs';
import { lintDiffText, lintPaths, loadConfig } from '../lint.mjs';
import os from 'node:os';

const here = path.dirname(new URL(import.meta.url).pathname);
const fixtures = path.join(here, 'fixtures');
const tsx = (src, file = 'src/components/sample/X.tsx', isNew = false) => lintFile({ file, lines: src.split('\n'), targets: null, isNew, kind: classify(file) });
const css = (src, file = 'src/components/sample/x.css', isNew = false) => lintFile({ file, lines: src.split('\n'), targets: null, isNew, kind: classify(file) });
const ids = (f) => [...new Set(f.map((x) => x.rule))].sort();
const has = (f, id) => f.some((x) => x.rule === id);

test('rules: exports 18 deterministic lint rules', () => {
  assert.equal(rules.length, 18);
});

// Every rule gets a present control (fires) and an absent control (does not fire).
const cases = [
  ['raw-control', '<button className="x">Go</button>', '<Button>Go</Button>'],
  ['raw-control', '<input type="text" />', '<input type="hidden" name="csrf" />'],
  ['raw-control', '<select><option/></select>', '<Select><SelectTrigger/></Select>'],
  ['literal-color', '<div className="x" style={{ color: "#123456" }} />', '<div className="text-primary" />'],
  ['literal-color', '<div style={{ background: "rgba(0,0,0,.5)" }} />', '<div style={{ background: "hsl(var(--primary))" }} />'],
  ['literal-color', 'const c = "#abc";', '<a href="#main">skip</a> <use href="#icon" /> url(#grad)'],
  ['palette-class', '<p className="text-gray-500">x</p>', '<p className="text-muted-foreground">x</p>'],
  ['palette-class', '<div className="bg-white dark:bg-zinc-900 border-gray-200/50" />', '<div className="bg-background border-border" />'],
  ['palette-class', '<div className="hover:bg-slate-100" />', '<div className="hover:bg-muted whitespace-nowrap" />'],
  ['arbitrary-value', '<div className="p-[13px] mt-[7px]" />', '<div className="p-3 mt-2 focus-visible:ring-[3px] w-[var(--sidebar-width)] grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]" />'],
  ['arbitrary-value', '<div className="[margin-top:7px]" />', '<div className="[overflow-wrap:anywhere]" />'],
  ['inline-style', '<div style={{ padding: 12, color: "#333" }} />', '<div style={{ "--w": `${w}px` }} />'],
  ['important', '.a { color: red !important; }', '.a { color: var(--foreground); }'],
  ['shadow', '<div className="shadow-[0_2px_8px_rgba(0,0,0,.2)]" />', '<div className="shadow-sm border border-border" />'],
  ['shadow', '<div className="shadow-xl drop-shadow-lg shadow-black/10" />', '<div className="shadow-xs" />'],
  ['mixed-radius', '<div className="rounded-sm"><i className="rounded-md"/><b className="rounded-2xl"/></div>', '<div className="rounded-lg"><i className="rounded-md"/><b className="rounded-full"/><u className="rounded-none"/></div>'],
  ['icon-library', 'import { FaBeer } from "react-icons/fa";', 'import { Beer } from "lucide-react";'],
  ['icon-library', 'import { ChevronDownIcon } from "@radix-ui/react-icons";', 'import { ChevronDown } from "lucide-react";'],
  ['inline-svg', '<svg viewBox="0 0 1 1" />', '<Folder />'],
  ['nested-scroll', '<div className="overflow-y-auto"><div className="overflow-auto" /></div>', '<div className="overflow-y-auto"><div className="overflow-hidden" /></div>'],
  ['nested-scroll', '<ScrollArea><div className="overflow-y-auto" /></ScrollArea>', '<ScrollArea><div /></ScrollArea>'],
  ['fixed-size', '<div className="h-[480px]" />', '<div className="max-h-[480px] h-12 w-[24px]" />'],
  ['fixed-size', '<div className="h-screen" />', '<div className="h-dvh min-h-0 flex-1" />'],
  ['type-scale', '<p className="text-[13px] leading-[1.35]" />', '<p className="text-sm leading-5 text-muted-foreground" />'],
  ['type-scale', '<p className="font-light" />', '<p className="font-medium font-semibold" />'],
  ['duplicate-primitive', 'export function CustomModal() { return null; }', 'export function UploadDialogShell() { return null; }'],
  ['duplicate-primitive', 'export const Tooltip = () => null;', 'export const useTooltipState = () => null;'],
  ['custom-pattern', '<div role="tree" />', '<SidebarMenu />'],
  ['custom-pattern', '<div role="dialog" aria-modal="true" />', '<Dialog />'],
  ['custom-pattern', '<table><tr/></table>', '<Table><TableRow/></Table>'],
  ['custom-pattern', '<hr />', '<Separator />'],
  ['custom-pattern', '<div className="animate-pulse h-4" />', '<Skeleton className="h-4" />'],
  ['custom-pattern', '<div className="space-y-4" />', '<div className="flex flex-col gap-4" />'],
  ['custom-pattern', '<div className="z-50" />', '<Popover />'],
  ['custom-pattern', '<div onClick={go} />', '<Button variant="ghost" onClick={go} />'],
  ['custom-pattern', '<div className="outline-none" />', '<div className="outline-none focus-visible:ring-[3px]" />'],
  ['custom-pattern', '<span className="uppercase tracking-widest" />', '<span className="text-xs font-medium" />'],
  ['icon-button-label', '<Button size="icon"><X /></Button>', '<Button size="icon" aria-label="Close"><X /></Button>'],
  ['touch-target', '<Button className="h-6">x</Button>', '<Button className="min-h-11">x</Button>'],
];
for (const [id, bad, good] of cases) {
  test(`${id}: fires on "${bad.slice(0, 50)}"`, () => assert.ok(has(id.startsWith('important') ? css(bad) : tsx(bad), id), `expected ${id} in ${JSON.stringify(ids(tsx(bad)))}`));
  test(`${id}: silent on "${good.slice(0, 50)}"`, () => assert.ok(!has(id.startsWith('important') ? css(good) : tsx(good), id), `unexpected ${id} in ${JSON.stringify(ids(tsx(good)))}`));
}

test('css rules: literal font-family (error), box-shadow, fixed height, weight, size, !important', () => {
  const f = css(fs.readFileSync(path.join(fixtures, 'src/components/sample/bad.css'), 'utf8'));
  assert.deepEqual(ids(f), ['fixed-size', 'important', 'literal-color', 'shadow', 'type-scale']);
  assert.ok(f.some((x) => x.rule === 'type-scale' && x.severity === 'error' && /font-family/.test(x.message)));
});

test('theme and artwork files are exempt from colour rules', () => {
  const f = lintFile({ file: 'src/styles/tokens.css', lines: [':root { --primary: #123456; }'], targets: null, kind: classify('src/styles/tokens.css') });
  assert.equal(f.length, 0);
  const g = tsx('<svg fill="#fff" />', 'src/components/ui/empty-state/illustrations/Foo.tsx');
  assert.equal(g.length, 0);
});

test('primitives may use raw controls and inline svg but not palette classes', () => {
  const f = tsx('<button className="bg-zinc-900"><svg /></button>', 'src/components/ui/button.tsx');
  assert.deepEqual(ids(f), ['palette-class']);
});

test('new duplicate component file is an error, same-named good component is not', () => {
  const f = tsx('export function CustomDropdown() {}', 'src/components/x/CustomDropdown.tsx', true);
  assert.ok(f.some((x) => x.rule === 'duplicate-primitive' && x.line === 1 && /DropdownMenu/.test(x.fix)));
  const g = tsx('export function ProjectToolbar() {}', 'src/components/x/ProjectToolbar.tsx', true);
  assert.equal(g.length, 0);
});

test('new stylesheet outside theme warns once; theme stylesheet does not', () => {
  assert.ok(has(css('.a{}', 'src/components/x/a.css', true), 'new-css-file'));
  assert.ok(!has(css('.a{}', 'src/styles/tokens.css', true), 'new-css-file'));
  assert.ok(!has(css('.a{}', 'src/components/x/a.css', false), 'new-css-file'));
});

test('findings carry file, line and a fix naming the component or token', () => {
  const f = tsx('x\n<button>a</button>\n<p className="text-gray-500"/>');
  const raw = f.find((x) => x.rule === 'raw-control');
  assert.equal(raw.line, 2);
  assert.match(raw.fix, /Button/);
  assert.match(f.find((x) => x.rule === 'palette-class').fix, /text-muted-foreground/);
});

test('glob matching', () => {
  assert.ok(globToRegExp('**/components/ui/**').test('src/components/ui/button.tsx'));
  assert.ok(globToRegExp('**/*.test.*').test('src/a/b.test.tsx'));
  assert.ok(!globToRegExp('**/components/ui/**').test('src/components/sample/x.tsx'));
  assert.ok(classify('src/components/x/__tests__/a.test.tsx').isUi === false);
  assert.ok(classify('scripts/foo.sh', DEFAULT_CONFIG).isUi === false);
});

test('unified diff: added lines and new-file numbering', () => {
  const diff = `diff --git a/src/components/sample/A.tsx b/src/components/sample/A.tsx\nindex 1..2 100644\n--- a/src/components/sample/A.tsx\n+++ b/src/components/sample/A.tsx\n@@ -1,3 +1,4 @@\n import x from "y";\n-old\n+<button>raw</button>\n+<p className="text-gray-500" />\n keep\ndiff --git a/src/components/sample/New.css b/src/components/sample/New.css\nnew file mode 100644\n--- /dev/null\n+++ b/src/components/sample/New.css\n@@ -0,0 +1,2 @@\n+.a { color: #fff; }\n+.b { }\n`;
  const files = parseUnifiedDiff(diff);
  assert.equal(files.length, 2);
  assert.deepEqual([...files[0].added.keys()], [2, 3]);
  assert.equal(files[0].isNew, false);
  assert.equal(files[1].isNew, true);
  const { findings, files: n } = lintDiffText(diff, DEFAULT_CONFIG, null);
  assert.equal(n, 2);
  assert.deepEqual(findings.filter((f) => f.file.endsWith('A.tsx')).map((f) => [f.rule, f.line]), [['raw-control', 2], ['palette-class', 3]]);
  assert.ok(findings.some((f) => f.file.endsWith('New.css') && f.rule === 'new-css-file'));
  assert.ok(findings.some((f) => f.file.endsWith('New.css') && f.rule === 'literal-color' && f.line === 1));
});

test('diff mode reports only added lines, not untouched offenders', () => {
  const diff = `diff --git a/src/components/sample/B.tsx b/src/components/sample/B.tsx\n--- a/src/components/sample/B.tsx\n+++ b/src/components/sample/B.tsx\n@@ -5,2 +5,3 @@\n <p className="text-gray-500" />\n+<span className="text-sm" />\n <hr />\n`;
  const { findings } = lintDiffText(diff, DEFAULT_CONFIG, null);
  assert.equal(findings.length, 0);
});

test('fixture directory: bad file fails, good file is clean, ui primitive and theme skipped', () => {
  const { findings, files } = lintPaths([fixtures], DEFAULT_CONFIG, fixtures);
  assert.equal(files, 5); // BadTree, GoodList, button.tsx, bad.css, tokens.css (theme-exempt rules apply)
  const bad = findings.filter((f) => f.file.endsWith('BadTree.tsx'));
  for (const id of ['raw-control', 'palette-class', 'arbitrary-value', 'inline-style', 'shadow', 'mixed-radius', 'icon-library', 'inline-svg', 'nested-scroll', 'fixed-size', 'type-scale', 'custom-pattern']) assert.ok(bad.some((f) => f.rule === id), `BadTree should trigger ${id}`);
  assert.equal(findings.filter((f) => f.file.endsWith('GoodList.tsx')).length, 0, JSON.stringify(findings.filter((f) => f.file.endsWith('GoodList.tsx'))));
  assert.equal(findings.filter((f) => f.file.endsWith('button.tsx')).length, 0);
});

test('CLI: exit 1 on errors, 0 when clean, json format, --strict', () => {
  const cli = path.join(here, '..', 'lint.mjs');
  const bad = spawnSync(process.execPath, [cli, '--repo', fixtures, path.join(fixtures, 'src/components/sample/BadTree.tsx')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /BadTree\.tsx:\d+: error \[raw-control\]/);
  assert.match(bad.stdout, /ui-police lint: \d+ errors, \d+ warnings in 1 UI file/);
  const good = spawnSync(process.execPath, [cli, '--repo', fixtures, path.join(fixtures, 'src/components/sample/GoodList.tsx')], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stdout);
  assert.match(good.stdout, /0 errors, 0 warnings in 1 UI file — clean/);
  const json = JSON.parse(spawnSync(process.execPath, [cli, '--format', 'json', '--repo', fixtures, path.join(fixtures, 'src/components/sample/bad.css')], { encoding: 'utf8' }).stdout);
  assert.ok(json.errors >= 2 && Array.isArray(json.rules) && json.rules.length >= 15);
  const strict = spawnSync(process.execPath, [cli, '--strict', '--repo', fixtures, path.join(fixtures, 'src/components/sample/GoodList.tsx')], { encoding: 'utf8' });
  assert.equal(strict.status, 0);
  const usage = spawnSync(process.execPath, [cli], { encoding: 'utf8' });
  assert.equal(usage.status, 2);
});

test('CLI: --diff - reads stdin', () => {
  const cli = path.join(here, '..', 'lint.mjs');
  const diff = `diff --git a/src/components/sample/C.tsx b/src/components/sample/C.tsx\n--- a/src/components/sample/C.tsx\n+++ b/src/components/sample/C.tsx\n@@ -1 +1 @@\n+<button>x</button>\n`;
  const r = spawnSync(process.execPath, [cli, '--diff', '-', '--repo', fixtures], { encoding: 'utf8', input: diff });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /C\.tsx:1: error \[raw-control\]/);
});

// Syntax edge cases that should not trigger unrelated rules.
const syntaxCases = [
  ['important', 'if (!returned && !paidPlan) redirect("/x");', false],
  ['important', '<Dialog onOpenChange={(o) => !o && onClose()} />', false],
  ['important', '<col className="@max-md:w-auto!" />', true],
  ['important', '<div className="!flex md:!hidden" />', true],
  ['arbitrary-value', '<div className="data-[state=open]:bg-accent group-data-[size=compact]/card:min-w-0 aria-[expanded=true]:x supports-[backdrop-filter]:bg-x" />', false],
  ['arbitrary-value', '<div className="left-[50%] translate-x-[-50%] rounded-[2px]" />', true],
  ['literal-color', '.a { -webkit-mask-image: linear-gradient(90deg, transparent, #000 12%); }', false],
  ['literal-color', '<div className="[&_.recharts-cartesian-grid_line[stroke=\'#ccc\']]:stroke-border" />', false],
];
for (const [id, src, expected] of syntaxCases) {
  test(`syntax ${id}: ${expected ? 'fires' : 'silent'} on "${src.slice(0, 60)}"`, () => {
    const f = /^\./.test(src) ? css(src) : tsx(src);
    assert.equal(has(f, id), expected, JSON.stringify(ids(f)));
  });
}

test('arbitrary layout math is a warning, not an error', () => {
  const f = tsx('<aside className="h-[calc(100dvh-3rem)]" />');
  const a = f.find((x) => x.rule === 'arbitrary-value');
  assert.ok(a && a.severity === 'warn', JSON.stringify(f));
});

test('inline-style: static keyword values are errors, template values are warnings', () => {
  const s = tsx("<div style={{ textAlign: 'center' }} />").find((x) => x.rule === 'inline-style');
  assert.equal(s.severity, 'error');
  const d = tsx('<div style={{ top: `${(i / (N - 1)) * 100}%` }} />').find((x) => x.rule === 'inline-style');
  assert.equal(d.severity, 'warn');
  const e = tsx('<div style={{ left: shape.x, top: shape.y }} />').find((x) => x.rule === 'inline-style');
  assert.equal(e.severity, 'warn');
});

test('project config adds local exemptions and origins', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uip-cfg-'));
  fs.writeFileSync(path.join(dir, 'ui-police.config.json'), JSON.stringify({ exempt: ['**/mockups/**'], allowedOrigins: ['https://preview.example'] }));
  const cfg = loadConfig(dir, null);
  assert.ok(classify('src/mockups/Preview.tsx', cfg).isExempt);
  assert.deepEqual(cfg.allowedOrigins, ['https://preview.example']);
});

test('duplicate-primitive: domain compositions are not duplicates, generic adjectives are', () => {
  assert.ok(!has(tsx('export function WorkspaceModal() {}'), 'duplicate-primitive'));
  assert.ok(!has(tsx('export function FileTable() {}'), 'duplicate-primitive'));
  assert.ok(has(tsx('export function AppModal() {}'), 'duplicate-primitive'));
  assert.ok(has(tsx('export function Modal() {}'), 'duplicate-primitive'));
});

test('arbitrary-value: pseudo content and transition property lists are not values', () => {
  assert.ok(!has(tsx('<span className="after:content-[\'\'] transition-[width] will-change-[transform]" />'), 'arbitrary-value'));
});

test('mixed-radius: explicitly skips rounded-full and rounded-none while counting box radii', () => {
  const clean = tsx('<div className="rounded-lg"><i className="rounded-md"/><b className="rounded-full"/><s className="rounded-t-full"/><u className="rounded-none"/></div>');
  assert.ok(!has(clean, 'mixed-radius'), JSON.stringify(clean));
  const mixed = tsx('<div className="rounded-sm"><i className="rounded-md"/><b className="rounded-lg"/><u className="rounded-full"/><s className="rounded-none"/></div>').filter((x) => x.rule === 'mixed-radius');
  assert.equal(mixed.length, 3);
  assert.match(mixed[0].message, /\(rounded-sm, rounded-md, rounded-lg\)/);
  assert.doesNotMatch(mixed[0].message, /rounded-full|rounded-none/);
});

test('CLI: dispatches commands and lists stable rules', () => {
  const cli = path.join(here, '..', 'bin', 'ui-police.mjs');
  const result = spawnSync(process.execPath, [cli, 'rules'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /raw-control/);
  const unknown = spawnSync(process.execPath, [cli, 'unknown'], { encoding: 'utf8' });
  assert.equal(unknown.status, 64);
});

test('guidance uses component names and target tokens', () => {
  const samples = [
    'export function CustomModal() {}',
    '<button>Save</button>',
    '<p className="text-gray-500">Text</p>',
    '<div className="bg-gradient-to-r" />',
    'import { X } from "@radix-ui/react-icons";',
    '<svg viewBox="0 0 24 24" />',
  ];
  const fixes = samples.flatMap((source) => tsx(source).map((f) => f.fix));
  assert.ok(fixes.length >= samples.length);
  for (const fix of fixes) assert.doesNotMatch(fix, /@\/|app\/theme\/components|font-brand|brand colours/);
  const rubric = fs.readFileSync(path.join(here, '..', 'rubric.md'), 'utf8');
  assert.doesNotMatch(rubric, /app-specific|named house font|fixed brand accent/i);
});
