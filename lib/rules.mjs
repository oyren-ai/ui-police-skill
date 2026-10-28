// ui-police lint rules. Deterministic, regex-based, zero dependencies.
// Every rule reports { rule, severity, line, message, fix }. Severity `error` fails the lint;
// `warn` is reported and fails only with --strict. Sources: shadcn/ui rules (skills/shadcn/rules),
// Vercel web interface guidelines and shadcn/ui component patterns.

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILS = 'bg|text|border|border-[trblxyse]|ring|ring-offset|outline|fill|stroke|from|via|to|divide|shadow|placeholder|caret|accent|decoration';
const VARIANTS = '(?:[a-z0-9-]+:)*';

export const PALETTE_CLASS_RE = new RegExp(`(?<![\\w-])${VARIANTS}(?:${COLOR_UTILS})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:/\\d{1,3})?(?![\\w-])`, 'g');

function paletteFix(cls) {
  const m = cls.match(new RegExp(`(${COLOR_UTILS})-(${PALETTE}|white|black)`));
  if (!m) return 'use a semantic color token from the target app';
  const util = m[1].startsWith('border') ? 'border' : m[1] === 'text' || m[1] === 'placeholder' || m[1] === 'fill' || m[1] === 'stroke' ? 'text' : 'bg';
  const suggestions = {
    text: 'text-foreground, text-muted-foreground, text-primary or text-destructive',
    bg: 'bg-background, bg-card, bg-muted, bg-primary or bg-destructive',
    border: 'border-border, border-input or border-destructive',
  };
  return `replace ${cls} with a token that matches its meaning: ${suggestions[util]}`;
}

// Hex colours: #abc, #aabbcc, #aabbccdd, preceded by a value delimiter and not an id reference.
const HEX_RE = /(?<=[\s:"'(,=`]|^)#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\w-])/g;
const FUNC_COLOR_RE = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color-mix)\(\s*(?!var\()[^)]*\)/g;
const ARBITRARY_RE = /(?<![\w-[])((?:[a-z0-9-]+:)*)([a-z][a-z0-9-]*)-\[([^\]\s]+)\]/g;
const ARBITRARY_PROPERTY_RE = /(?<![\w-])\[([a-z-]+):([^\]\s]+)\]/g;
const RADIUS_RE = /(?<![\w-])(?:[a-z0-9-]+:)*rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?(?:-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full))?(?![\w-])/g;
const ICON_LIBS = /from\s+["'](?:react-icons(?:\/[\w-]+)?|@heroicons\/react(?:\/[\w/-]+)?|@tabler\/icons-react|@fortawesome\/[\w-]+|@mui\/icons-material(?:\/[\w-]+)?|@phosphor-icons\/react|phosphor-react|@radix-ui\/react-icons|iconoir-react|react-feather|@iconify\/react|boxicons|@ant-design\/icons)["']/;
const OVERFLOW_SCROLL_RE = /(?<![\w-])(?:[a-z0-9-]+:)*overflow(?:-[xy])?-(?:auto|scroll)(?![\w-])|<ScrollArea\b/g;
const PRIMITIVE_NAMES = '(?:Modal|Dialog|Dropdown|DropdownMenu|Menu|ContextMenu|Tooltip|Toast|Toaster|Snackbar|Spinner|Loader|Badge|Chip|Tag|Pill|Avatar|Skeleton|Switch|Toggle|Checkbox|Radio|RadioGroup|Slider|ProgressBar|Progress|Divider|Separator|Tabs|TabBar|Accordion|Collapsible|Breadcrumbs?|Pagination|Popover|Sheet|Drawer|Select|Combobox|Textarea|TextArea|Input|TextField|Button|IconButton|Card|Alert|Banner|Callout|EmptyState|Kbd|Tree|TreeView|FileTree|Table|DataTable|Sidebar|Command|CommandPalette|Carousel|HoverCard|Resizable|SplitPane)';
// Generic adjectives only: a domain composition such as WorkspaceModal or FileTable wraps the primitive and is fine.
const DUPLICATE_NAME_RE = new RegExp(`^(?:Custom|New|My|Simple|Basic|Fancy|App|Base|Generic|Common|Shared|Ui|UI)?${PRIMITIVE_NAMES}$`);
const PRIMITIVE_FOR = (name) => {
  const n = name.toLowerCase();
  if (/modal|dialog/.test(n)) return 'Dialog or AlertDialog; use Sheet or Drawer for side panels';
  if (/dropdown|menu/.test(n)) return 'DropdownMenu, ContextMenu or Menubar';
  if (/tooltip|hovercard/.test(n)) return 'Tooltip or HoverCard';
  if (/toast|snackbar/.test(n)) return 'sonner toast';
  if (/spinner|loader/.test(n)) return 'an existing Spinner or Loader';
  if (/badge|chip|tag|pill/.test(n)) return 'Badge';
  if (/avatar/.test(n)) return 'Avatar and AvatarFallback';
  if (/skeleton/.test(n)) return 'Skeleton';
  if (/switch|toggle/.test(n)) return 'Switch or Toggle';
  if (/checkbox|radio/.test(n)) return 'Checkbox or RadioGroup';
  if (/slider|progress/.test(n)) return 'Slider or Progress';
  if (/divider|separator/.test(n)) return 'Separator';
  if (/tab/.test(n)) return 'Tabs, TabsList and TabsTrigger';
  if (/accordion|collapsible/.test(n)) return 'Accordion or Collapsible';
  if (/breadcrumb|pagination/.test(n)) return 'Breadcrumb or Pagination';
  if (/popover|sheet|drawer/.test(n)) return 'Popover, Sheet or Drawer';
  if (/select|combobox/.test(n)) return 'Select, or Popover and Command for search';
  if (/input|textfield|textarea/.test(n)) return 'Input or Textarea';
  if (/button/.test(n)) return 'Button with a suitable variant and size';
  if (/card|callout|banner|alert/.test(n)) return 'Card or Alert';
  if (/empty/.test(n)) return 'an existing empty state component';
  if (/tree/.test(n)) return 'Sidebar and Collapsible for navigation, or Table for data';
  if (/table/.test(n)) return 'Table and, for sorting, @tanstack/react-table';
  if (/sidebar/.test(n)) return 'Sidebar';
  if (/command/.test(n)) return 'Command';
  if (/carousel|resizable|split/.test(n)) return 'Carousel or Resizable';
  return 'the matching component from the target app';
};

// Index just past the balanced JS expression that starts at `from` inside `text`, honouring strings,
// template literals (with nested ${ } code) and brackets. Returns -1 when unbalanced within `text`.
function scanBalanced(text, from) {
  const stack = [{ type: 'code', depth: 0 }];
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i];
    const top = stack[stack.length - 1];
    if (top.type === 'str') {
      if (ch === '\\') { i += 1; continue; }
      if (ch === top.q) { stack.pop(); continue; }
      if (top.q === '`' && ch === '$' && text[i + 1] === '{') { stack.push({ type: 'code', depth: 1 }); i += 1; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { stack.push({ type: 'str', q: ch }); continue; }
    if (ch === '{' || ch === '(' || ch === '[') { top.depth += 1; continue; }
    if (ch === '}' || ch === ')' || ch === ']') {
      top.depth -= 1;
      if (top.depth === 0 && stack.length > 1) { stack.pop(); continue; } // end of a ${ } inside a template
      if (top.depth === 0 && stack.length === 1) return i;
    }
  }
  return -1;
}

// Return the JSX expression inside `style={ … }` starting at column idx of line n (joins up to 8 lines).
function styleExpression(ctx, n, idx) {
  let text = ctx.lines[n - 1].slice(idx + 'style='.length);
  for (let i = n; i < Math.min(n + 8, ctx.lines.length); i += 1) text += `\n${ctx.lines[i]}`;
  const end = scanBalanced(text, 0); // text starts at the `{` of style={
  return end < 0 ? null : text.slice(1, end);
}

// Top-level keys of an object literal source `{ a: 1, "--b": x, [c]: y }`.
function topLevelKeys(objRaw) {
  const obj = maskTemplates(objRaw);
  const keys = [];
  let depth = 0, inStr = null, expectKey = true, buf = '';
  for (let i = 1; i < obj.length; i += 1) {
    const ch = obj[i];
    if (inStr) { if (ch === '\\') i += 1; else if (ch === inStr) inStr = null; if (expectKey && depth === 0) buf += ch; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; if (expectKey && depth === 0) buf += ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') { depth -= 1; if (depth < 0) break; }
    else if (depth === 0 && ch === ':' && expectKey) { keys.push(buf.trim().replace(/^["'`]|["'`]$/g, '')); buf = ''; expectKey = false; continue; }
    else if (depth === 0 && ch === ',') { expectKey = true; buf = ''; continue; }
    if (expectKey && depth === 0) buf += ch;
  }
  return keys.filter(Boolean);
}

// Top-level values of an object literal source, in key order (strings, numbers, expressions as text).
function maskTemplates(obj) {
  let out = '';
  for (let i = 0; i < obj.length; i += 1) {
    if (obj[i] === '`') {
      const end = scanBalancedString(obj, i);
      if (end < 0) return out + obj.slice(i);
      out += '`${T}`'; i = end; continue;
    }
    out += obj[i];
  }
  return out;
}
function scanBalancedString(text, from) {
  const stack = [{ type: 'str', q: text[from] }];
  for (let i = from + 1; i < text.length; i += 1) {
    const ch = text[i];
    const top = stack[stack.length - 1];
    if (top.type === 'str') {
      if (ch === '\\') { i += 1; continue; }
      if (ch === top.q) { stack.pop(); if (!stack.length) return i; continue; }
      if (top.q === '`' && ch === '$' && text[i + 1] === '{') { stack.push({ type: 'code', depth: 1 }); i += 1; }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { stack.push({ type: 'str', q: ch }); continue; }
    if (ch === '{' || ch === '(' || ch === '[') top.depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') { top.depth -= 1; if (top.depth === 0) stack.pop(); }
  }
  return -1;
}

function topLevelValues(objRaw) {
  const obj = maskTemplates(objRaw);
  const vals = [];
  let depth = 0, inStr = null, inKey = true, buf = '';
  for (let i = 1; i < obj.length; i += 1) {
    const ch = obj[i];
    if (inStr) { if (ch === '\\') { buf += ch + (obj[i + 1] || ''); i += 1; continue; } if (ch === inStr) inStr = null; buf += ch; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; buf += ch; continue; }
    if (ch === '{' || ch === '(' || ch === '[') { depth += 1; buf += ch; continue; }
    if (ch === '}' || ch === ')' || ch === ']') { depth -= 1; if (depth < 0) { if (!inKey) vals.push(buf.trim()); break; } buf += ch; continue; }
    if (depth === 0 && inKey && ch === ':') { inKey = false; buf = ''; continue; }
    if (depth === 0 && !inKey && ch === ',') { vals.push(buf.trim()); buf = ''; inKey = true; continue; }
    if (!inKey) buf += ch;
  }
  return vals.filter(Boolean);
}

function hasVarRef(s) { return /var\(--|^--/.test(s); }

function* eachTarget(ctx) {
  for (const n of ctx.targets) {
    const text = ctx.lines[n - 1];
    if (typeof text === 'string') yield [n, text];
  }
}

// Collect the opening tag starting at line n (for multi-line JSX elements), max 8 lines.
function openingTag(ctx, n) {
  let out = '';
  for (let i = n; i < Math.min(n + 8, ctx.lines.length + 1); i += 1) {
    out += `${ctx.lines[i - 1]}\n`;
    if (/>\s*$/.test(ctx.lines[i - 1]) || />/.test(ctx.lines[i - 1].replace(/=>/g, ''))) break;
  }
  return out;
}

// 18 deterministic rules (7 error, 11 warn): raw-control, literal-color, palette-class, arbitrary-value,
// inline-style, important, new-css-file, shadow, mixed-radius, icon-library, inline-svg, nested-scroll,
// fixed-size, type-scale, duplicate-primitive, custom-pattern, icon-button-label, touch-target.
export const rules = [
  {
    id: 'raw-control', severity: 'error',
    description: 'Native <button>/<input>/<select>/<textarea>/<dialog> in app code',
    appliesTo: (k) => k.isMarkup && !k.isPrimitive,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        const m = t.match(/<(button|input|select|textarea|dialog)\b/);
        if (!m) continue;
        const tag = openingTag(ctx, n);
        if (m[1] === 'input' && /type=["']hidden["']|sr-only|type=["']file["']/.test(tag)) continue;
        const comp = { button: 'Button (variant/size props)', input: 'Input (or Field + Label)', select: 'Select (SelectTrigger/SelectContent/SelectGroup/SelectItem) or native-select.tsx', textarea: 'Textarea', dialog: 'Dialog / AlertDialog / Sheet / Drawer' }[m[1]];
        out.push({ line: n, message: `raw <${m[1]}> element`, fix: `use ${comp} from the target app component library` });
      }
      return out;
    },
  },
  {
    id: 'literal-color', severity: 'error',
    description: 'Hex / rgb / hsl / oklch literal instead of a token',
    appliesTo: (k) => !k.isTheme && !k.isArtwork,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        if (/url\(#|href=["']#|\bimport\b|^\s*\/\/|^\s*\*|\/\*|mask-image|-webkit-mask|mask:/.test(t)) continue;
        const scan = t.replace(/\[&[^\]]*\]/g, '');
        for (const m of scan.matchAll(HEX_RE)) out.push({ line: n, message: `literal colour ${m[0]}`, fix: 'use a semantic color class or a CSS variable from the target theme' });
        for (const m of scan.matchAll(FUNC_COLOR_RE)) {
          if (/^\s*(?:transparent|currentColor)/.test(m[0])) continue;
          out.push({ line: n, message: `literal colour ${m[0].slice(0, 40)}`, fix: 'use a token (var(--…)) or a semantic class; opacity via the /NN class modifier (bg-primary/10)' });
        }
      }
      return out;
    },
  },
  {
    id: 'palette-class', severity: 'error',
    description: 'Tailwind palette class (bg-zinc-800, text-gray-500, bg-white) instead of a semantic token',
    appliesTo: (k) => !k.isTheme && !k.isArtwork,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        for (const m of t.matchAll(PALETTE_CLASS_RE)) out.push({ line: n, message: `palette class ${m[0]}`, fix: paletteFix(m[0]) });
      }
      return out;
    },
  },
  {
    id: 'arbitrary-value', severity: 'error',
    description: 'Arbitrary Tailwind value (p-[13px], w-[417px], text-[15px])',
    appliesTo: (k) => k.isMarkup && !k.isArtwork,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        for (const m of t.matchAll(ARBITRARY_RE)) {
          const [, , key, val] = m;
          if (/(?:^|-)(?:data|aria|supports|has|nth|nth-last|min|max|in|not|where|group|peer|is)$/.test(key)) continue; // a Tailwind variant, not a value
          if (/^(?:content|transition|will-change|animate|font-feature|counter-reset|counter-increment)$/.test(key)) continue; // property lists / pseudo content, no scale exists
          if (hasVarRef(val)) continue;
          if (key === 'ring' && val === '3px') continue; // house focus ring
          if (/^grid-(cols|rows)$/.test(key) && /repeat\(|minmax\(|auto-fi/.test(val)) continue;
          if (/^(h|min-h|max-h|w|min-w|max-w)$/.test(key) && /^\d+(px|vh|dvh|svh)$/.test(val)) continue; // fixed-size rule reports these
          if (/^(text|leading|tracking|font)$/.test(key)) continue; // type-scale rule reports these
          if (/^(shadow|drop-shadow)$/.test(key)) continue; // shadow rule reports these
          if (/^(bg|text|border|fill|stroke|ring|from|to|via)$/.test(key) && /^#|^(rgb|hsl|oklch)/.test(val)) continue; // literal-color reports these
          if (/^(?:calc|min|max|clamp)\(/.test(val)) { out.push({ line: n, message: `arbitrary layout math ${m[0]}`, fix: 'prefer flex-1 min-h-0 / grid rows over viewport math; if a cap is needed, put the expression in a token (--dialog-content-height) and use var(--…)', severity: 'warn' }); continue; }
          out.push({ line: n, message: `arbitrary value ${m[0]}`, fix: 'use the target app spacing scale or add a named token when needed' });
        }
        for (const m of t.matchAll(ARBITRARY_PROPERTY_RE)) {
          if (/^(overflow-wrap|text-wrap|hyphens|content-visibility|contain|scrollbar-gutter|field-sizing|touch-action|overscroll-behavior|scroll-margin|anchor-name|position-anchor)/.test(m[1])) continue; // no utility exists; accepted
          out.push({ line: n, message: `arbitrary property ${m[0]}`, fix: 'use a Tailwind utility or a named component class' });
        }
      }
      return out;
    },
  },
  {
    id: 'inline-style', severity: 'error',
    description: 'Inline style object with literal values',
    appliesTo: (k) => !k.isArtwork && k.isMarkup,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        const idx = t.indexOf('style={');
        if (idx < 0) continue;
        const expr = styleExpression(ctx, n, idx);
        if (expr === null) continue;
        const obj = expr.trim();
        if (!obj.startsWith('{')) {
          out.push({ line: n, message: 'inline style passed from a variable', fix: 'move static styles to classes/tokens; pass only CSS variables (style={{ "--x": value }}) for dynamic values', severity: 'warn' });
          continue;
        }
        const keys = topLevelKeys(obj);
        if (keys.length && keys.every((k) => k.startsWith('--'))) continue; // CSS variable injection is the sanctioned use
        const values = topLevelValues(obj);
        const literal = values.length > 0 && values.every((v) => /^(["'])(?:(?!\$\{).)*\1$/.test(v) || /^-?\d+(?:\.\d+)?$/.test(v));
        if (!literal) out.push({ line: n, message: 'dynamic inline style', fix: 'inject CSS variables instead (style={{ "--w": `${w}px` }} + w-[var(--w)]) so the value stays themeable and lintable', severity: 'warn' });
        else out.push({ line: n, message: 'inline style with literal values', fix: 'use Tailwind utilities with tokens (p-4, bg-card, text-muted-foreground); never literal colours/pixels in style={}' });
      }
      return out;
    },
  },
  {
    id: 'important', severity: 'error',
    description: '!important (CSS) or a Tailwind important modifier (!flex, w-auto!)',
    appliesTo: () => true,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        if (/^\s*(?:\/\/|\*|\/\*)/.test(t)) continue;
        if (/!important/.test(t)) { out.push({ line: n, message: '!important override', fix: 'fix the specificity or the component variant instead; !important hides a design-system conflict' }); continue; }
        if (!ctx.kind.isMarkup) continue;
        for (const str of t.matchAll(/(["'`])((?:(?!\1).)*)\1/g)) {
          const bang = str[2].split(/\s+/).find((tok) => /^!(?:[a-z0-9-]+:)*[a-z][a-z0-9-]*(?:\[[^\]]*\])?(?:\/\d+)?$/.test(tok) || /^(?:[@a-z0-9-]+:)*-?[a-z][a-z0-9-]*(?:\[[^\]]*\])?(?:\/\d+)?!$/.test(tok));
          if (bang) { out.push({ line: n, message: `important modifier ${bang}`, fix: 'remove the !; if a component class wins, change the component variant or the order of cn() arguments instead' }); break; }
        }
      }
      return out;
    },
  },
  {
    id: 'new-css-file', severity: 'warn',
    description: 'New stylesheet outside a theme directory',
    appliesTo: (k) => k.isStyle && !k.isTheme,
    check(ctx) {
      if (!ctx.isNew) return [];
      return [{ line: 1, message: `new stylesheet ${ctx.file}`, fix: 'use existing utilities and tokens; add a component class when the pattern repeats' }];
    },
  },
  {
    id: 'shadow', severity: 'warn',
    description: 'Hard-coded or heavy shadow',
    appliesTo: (k) => !k.isTheme && !k.isArtwork,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        const hits = [
          ...t.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*(?:drop-)?shadow-\[[^\]]+\]/g),
          ...t.matchAll(new RegExp(`(?<![\\w-])(?:[a-z0-9-]+:)*shadow-(?:(?:${PALETTE})(?:-\\d{2,3})?|white|black)(?:/\\d+)?(?![\\w-])`, 'g')),
          ...t.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*drop-shadow-(?:sm|md|lg|xl|2xl)(?![\w-])/g),
          ...t.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*shadow-(?:xl|2xl)(?![\w-])/g),
        ];
        for (const m of hits) out.push({ line: n, message: `shadow ${m[0]}`, fix: 'use the target app shadow token or its existing border treatment' });
        if (ctx.kind.isStyle || /style=/.test(t)) {
          for (const m of t.matchAll(/box-shadow\s*:\s*([^;}]+)/g)) if (!/var\(--shadow|none/.test(m[1])) out.push({ line: n, message: `literal box-shadow ${m[1].trim().slice(0, 40)}`, fix: 'use a theme shadow token or the app existing border treatment' });
          for (const m of t.matchAll(/filter\s*:\s*[^;}]*drop-shadow\([^)]*\)/g)) out.push({ line: n, message: 'literal drop-shadow filter', fix: 'use a theme shadow token if elevation is needed' });
        }
      }
      return out;
    },
  },
  {
    id: 'mixed-radius', severity: 'warn',
    description: 'More than two corner radii in one file',
    appliesTo: (k) => !k.isArtwork && k.isMarkup && !k.isPrimitive,
    check(ctx) {
      const seen = new Map();
      for (let i = 0; i < ctx.lines.length; i += 1) {
        for (const m of ctx.lines[i].matchAll(RADIUS_RE)) {
          const size = m[1] || 'DEFAULT';
          if (size === 'none' || size === 'full') continue;
          if (!seen.has(size)) seen.set(size, i + 1);
        }
      }
      if (seen.size <= 2) return [];
      const out = [];
      for (const [size, line] of seen) if (ctx.targets.has(line) || ctx.targetsAll) out.push({ line, message: `mixed radii in one file (${[...seen.keys()].map((s) => (s === 'DEFAULT' ? 'rounded' : `rounded-${s}`)).join(', ')})`, fix: 'use the target app radius scale consistently across controls and panels' });
      return out;
    },
  },
  {
    id: 'icon-library', severity: 'error',
    description: 'Icon import from a library other than lucide-react',
    appliesTo: (k) => !k.isArtwork,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) if (ICON_LIBS.test(t)) out.push({ line: n, message: 'non-lucide icon import', fix: 'use the icon library configured for the target app' });
      return out;
    },
  },
  {
    id: 'inline-svg', severity: 'warn',
    description: 'Hand-written <svg> in app code',
    appliesTo: (k) => k.isMarkup && !k.isPrimitive && !k.isArtwork,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) if (/<svg\b/.test(t)) out.push({ line: n, message: 'inline <svg>', fix: 'use the app icon library, or keep illustrations in an artwork component' });
      return out;
    },
  },
  {
    id: 'nested-scroll', severity: 'warn',
    description: 'Several scroll containers in one component',
    appliesTo: (k) => !k.isArtwork && k.isMarkup,
    check(ctx) {
      const all = [];
      for (let i = 0; i < ctx.lines.length; i += 1) for (const m of ctx.lines[i].matchAll(OVERFLOW_SCROLL_RE)) all.push({ line: i + 1, text: m[0] });
      if (all.length < 2) return [];
      const out = [];
      for (const hit of all) if (ctx.targets.has(hit.line) || ctx.targetsAll) out.push({ line: hit.line, message: `scroll container (${hit.text}) in a file that already has ${all.length - 1} other`, fix: 'one scroll region per pane: give the chain flex-1 min-h-0 and let the outer ScrollArea scroll; never nest overflow-auto in overflow-auto' });
      return out;
    },
  },
  {
    id: 'fixed-size', severity: 'warn',
    description: 'Fixed pixel/viewport height on content',
    appliesTo: (k) => !k.isArtwork && !k.isTheme,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        for (const m of t.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*(min-|max-)?(h|w)-\[(\d+)(px|vh|dvh|svh)\]/g)) {
          if (m[1] === 'max-' ) continue; // max- bounds are fine
          if (m[2] === 'w' && Number(m[3]) <= 64) continue; // icon-sized widths
          out.push({ line: n, message: `fixed ${m[2] === 'h' ? 'height' : 'width'} ${m[0]}`, fix: 'let content size itself: flex-1 min-h-0 / min-w-0, max-h-[var(--…)] for caps; fixed heights clip text at other font sizes and on phones' });
        }
        if (/(?<![\w-])h-screen(?![\w-])/.test(t)) out.push({ line: n, message: 'h-screen', fix: 'use h-dvh (or min-h-dvh) so phone browser chrome does not clip the bottom' });
        if (ctx.kind.isStyle) for (const m of t.matchAll(/(?<!(?:max|min)-)\bheight\s*:\s*(\d{3,})px/g)) out.push({ line: n, message: `fixed height ${m[1]}px`, fix: 'size from content or a token; use min-height/max-height for bounds' });
      }
      return out;
    },
  },
  {
    id: 'type-scale', severity: 'warn',
    description: 'Font family/size/weight outside the type scale',
    appliesTo: (k) => !k.isArtwork && !k.isTheme,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        for (const m of t.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*(text|leading|tracking|font)-\[([^\]]+)\]/g)) {
          if (hasVarRef(m[2])) continue;
          out.push({ line: n, message: `arbitrary typography ${m[0]}`, fix: 'use the target app typography scale and line-height tokens' });
        }
        for (const m of t.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*font-(thin|extralight|light|extrabold|black)(?![\w-])/g)) out.push({ line: n, message: `weight ${m[0]} outside the scale`, fix: 'use a weight from the target app typography scale' });
        for (const m of t.matchAll(/(?<![\w-])(?:[a-z0-9-]+:)*font-(serif)(?![\w-])/g)) out.push({ line: n, message: `${m[0]}`, fix: 'use the font family selected by the target app typography tokens' });
        if (ctx.kind.isStyle || /style=/.test(t)) {
          for (const m of t.matchAll(/font-family\s*:\s*([^;}]+)/g)) if (!/var\(--font|inherit/.test(m[1])) out.push({ line: n, message: `literal font-family ${m[1].trim().slice(0, 30)}`, fix: 'use the target app font-family token', severity: 'error' });
          for (const m of t.matchAll(/font-weight\s*:\s*(100|200|300|800|900)\b/g)) out.push({ line: n, message: `font-weight ${m[1]}`, fix: 'use a weight from the target app typography scale' });
          for (const m of t.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/g)) out.push({ line: n, message: `font-size ${m[1]}px`, fix: 'use the target app text-size token or rem scale' });
        }
      }
      return out;
    },
  },
  {
    id: 'duplicate-primitive', severity: 'error',
    description: 'New component duplicating a shared UI primitive by name or role',
    appliesTo: (k) => k.isMarkup && !k.isPrimitive,
    check(ctx) {
      const out = [];
      const base = ctx.file.split('/').pop().replace(/\.(tsx|jsx)$/, '');
      if (ctx.isNew && DUPLICATE_NAME_RE.test(base)) out.push({ line: 1, message: `new component file ${base} duplicates a ui primitive`, fix: `reuse ${PRIMITIVE_FOR(base)}; extend it with a variant/prop instead of a parallel component` });
      for (const [n, t] of eachTarget(ctx)) {
        const m = t.match(/^\s*export\s+(?:default\s+)?(?:function|const)\s+([A-Z]\w*)/);
        if (m && DUPLICATE_NAME_RE.test(m[1]) && !(ctx.isNew && m[1] === base)) out.push({ line: n, message: `component ${m[1]} duplicates a ui primitive`, fix: `reuse ${PRIMITIVE_FOR(m[1])}` });
      }
      return out;
    },
  },
  {
    id: 'custom-pattern', severity: 'warn',
    description: 'Hand-rolled pattern where an established component exists',
    appliesTo: (k) => !k.isArtwork && k.isMarkup && !k.isPrimitive,
    check(ctx) {
      const out = [];
      const checks = [
        [/role=["']tree(?:item)?["']|aria-level=/, 'custom tree', 'use Sidebar + Collapsible for navigation trees, or Table for file lists'],
        [/role=["']dialog["']|aria-modal=/, 'custom dialog', 'use Dialog / AlertDialog / Sheet / Drawer (they own focus, Escape, scroll lock and a required Title)'],
        [/role=["']tablist["']|role=["']tab["']/, 'custom tabs', 'use Tabs > TabsList > TabsTrigger / TabsContent'],
        [/role=["']menu(?:item)?["']/, 'custom menu', 'use DropdownMenu / ContextMenu / Menubar with their Group + Item parts'],
        [/role=["']tooltip["']/, 'custom tooltip', 'use Tooltip (TooltipHint for shortcut hints)'],
        [/role=["']switch["']/, 'custom switch', 'use Switch'],
        [/role=["']progressbar["']/, 'custom progress bar', 'use Progress'],
        [/role=["']listbox["']|role=["']combobox["']/, 'custom listbox/combobox', 'use Select, or Popover + Command for a searchable combobox'],
        [/<table\b/, 'raw <table>', 'use Table / TableHeader / TableRow / TableCell (data-table pattern with @tanstack/react-table when sortable)'],
        [/<hr\b/, 'raw <hr>', 'use <Separator />'],
        [/animate-pulse/, 'animate-pulse placeholder', 'use <Skeleton className="h-4 w-3/4" /> mirroring the final layout'],
        [/(?<![\w-])space-[xy]-\d/, 'space-x/space-y', 'use flex/grid with gap-* (shadcn styling rule)'],
        [/(?<![\w-])dark:(?:bg|text|border|ring|fill|stroke)-/, 'manual dark: colour override', 'use a semantic token from the target theme that changes with light and dark modes'],
        [/(?<![\w-])z-(?:\[|50|40|\d{3,})/, 'manual z-index', 'Dialog/Sheet/Popover/Tooltip/DropdownMenu stack themselves; remove the z-* class'],
        [/<(?:div|span|li|p)\b[^>]*\bonClick=/, 'onClick on a non-interactive element', 'use <Button variant="ghost"> (or asChild with <Link>) so it is focusable, keyboard-operable and 44px on touch'],
        [(t) => /(?<![\w-])outline-none(?![\w-])/.test(t) && !/focus-visible:|focus:(?:ring|outline|border)|focus-within:/.test(t), 'outline removed without focus-visible replacement', 'keep focus visible: outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'],
        [/text-transform:\s*uppercase|(?<![\w-])uppercase(?![\w-])(?=.*tracking-)/, 'all-caps tracked label', 'use the label style already present in the target app'],
        [/bg-gradient-to-|bg-clip-text/, 'gradient decoration', 'use the app existing surface treatment instead of introducing a new gradient'],
      ];
      for (const [n, t] of eachTarget(ctx)) for (const [re, what, fix] of checks) if (typeof re === 'function' ? re(t) : re.test(t)) out.push({ line: n, message: what, fix });
      return out;
    },
  },
  {
    id: 'icon-button-label', severity: 'warn',
    description: 'Icon-only button without an accessible name',
    appliesTo: (k) => !k.isArtwork && k.isMarkup,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        if (!/size=["']icon/.test(t)) continue;
        const tag = openingTag(ctx, n) + (ctx.lines[n] || '') + (ctx.lines[n + 1] || '');
        if (/aria-label|aria-labelledby|sr-only|title=/.test(tag)) continue;
        out.push({ line: n, message: 'icon button without aria-label', fix: 'add aria-label="<action>" (and a Tooltip with the same text)' });
      }
      return out;
    },
  },
  {
    id: 'touch-target', severity: 'warn',
    description: 'Interactive element under 44px on touch',
    appliesTo: (k) => !k.isArtwork && k.isMarkup && !k.isPrimitive,
    check(ctx) {
      const out = [];
      for (const [n, t] of eachTarget(ctx)) {
        if (!/<(?:Button|button|a|Link|Toggle|TabsTrigger)\b|role=["']button["']/.test(t)) continue;
        const m = t.match(/(?<![\w-])(?:h|size)-(4|5|6|7)(?![\w-])/);
        if (m) out.push({ line: n, message: `interactive element ${m[0]} (${Number(m[1]) * 4}px) under the 44px touch target`, fix: 'use Button size="sm"/"icon" (min 32px) with min-h-11 on touch surfaces, or enlarge the hit area with padding (Vercel guideline: ≥24px desktop, ≥44px mobile)' });
      }
      return out;
    },
  },
];

export function lintFile({ file, lines, targets, isNew = false, kind }) {
  const findings = [];
  const ctx = { file, lines, targets: targets || new Set(lines.map((_, i) => i + 1)), targetsAll: !targets, isNew, kind };
  for (const rule of rules) {
    if (!rule.appliesTo(kind)) continue;
    for (const f of rule.check(ctx)) findings.push({ rule: rule.id, severity: f.severity || rule.severity, file, line: f.line, message: f.message, fix: f.fix });
  }
  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return findings;
}
