import fs from 'node:fs';
import path from 'node:path';
// Defaults for ui-police lint. A repo may add `ui-police.config.json` at its root with
// { "exempt": ["glob", ...], "primitives": ["glob"], "theme": ["glob"] } to extend these lists.
// Paths are matched with simple globs: `**` any depth, `*` within a segment.

export const DEFAULT_CONFIG = {
  // Files the linter looks at. Everything else is ignored silently.
  uiFiles: ['**/*.tsx', '**/*.jsx', '**/*.css', '**/*.scss', '**/*.sass', '**/*.less'],
  // Never linted: tests, stories, generated output, vendored code.
  ignore: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*', '**/*.stories.*', '**/node_modules/**', '**/.next/**', '**/dist/**', '**/coverage/**'],
  // shadcn primitives: raw controls and inline svg are allowed here, literal colours are not.
  primitives: ['**/components/ui/**'],
  // Token definitions: literal colours are the point of these files.
  theme: ['**/globals.css', '**/tokens.css', '**/theme.css', '**/tailwind.css', '**/themes/**'],
  // Illustrations and logos legitimately carry literal colours and inline svg.
  artwork: ['**/illustrations/**', '**/logos/**', '**/icons/**', '**/*.svg'],
  // Extra exemptions (globs) a repo may add. Nothing by default.
  exempt: [],
  allowedOrigins: [],
  references: {},
};

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches zero or more directories; bare `**` matches anything.
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += `\\${c}`;
    else re += c;
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs) {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return globs.some((g) => globToRegExp(g).test(p) || globToRegExp(g).test(`/${p}`) || globToRegExp(`**/${g.replace(/^\*\*\//, '')}`).test(p));
}

export function classify(path, config = DEFAULT_CONFIG) {
  return {
    isUi: matchesAny(path, config.uiFiles) && !matchesAny(path, config.ignore),
    isPrimitive: matchesAny(path, config.primitives),
    isTheme: matchesAny(path, config.theme),
    isArtwork: matchesAny(path, config.artwork),
    isExempt: matchesAny(path, config.exempt),
    isStyle: /\.(css|scss|sass|less)$/.test(path),
    isMarkup: /\.(tsx|jsx)$/.test(path),
  };
}

export function mergeConfig(base, extra) {
  if (!extra) return base;
  const out = { ...base };
  for (const key of ['uiFiles', 'ignore', 'primitives', 'theme', 'artwork', 'exempt']) {
    if (Array.isArray(extra[key])) out[key] = [...base[key], ...extra[key]];
  }
  if (Array.isArray(extra.allowedOrigins)) out.allowedOrigins = extra.allowedOrigins;
  if (extra.references && typeof extra.references === 'object' && !Array.isArray(extra.references)) out.references = { ...base.references, ...extra.references };
  return out;
}

export function loadProjectConfig(repo = process.cwd(), explicit = null) {
  const file = explicit || path.join(repo, 'ui-police.config.json');
  if (!fs.existsSync(file)) return DEFAULT_CONFIG;
  let extra;
  try { extra = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { throw new Error(`bad config ${file}: ${e.message}`); }
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error(`bad config ${file}: expected an object`);
  if (extra.allowedOrigins !== undefined && (!Array.isArray(extra.allowedOrigins) || extra.allowedOrigins.some((x) => typeof x !== 'string'))) throw new Error(`bad config ${file}: allowedOrigins must be strings`);
  if (extra.references !== undefined && (!extra.references || typeof extra.references !== 'object' || Array.isArray(extra.references) || Object.entries(extra.references).some(([k,v]) => !/^[a-z0-9][a-z0-9-]{0,63}$/.test(k) || typeof v !== 'string'))) throw new Error(`bad config ${file}: references must map names to paths`);
  return mergeConfig(DEFAULT_CONFIG, extra);
}
