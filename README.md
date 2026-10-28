# UI police

UI police checks web UI code and page captures before review. It is for people building screens with an AI coding agent or reviewing those changes.

Install it in your web app:

```sh
npm install --save-dev github:oyren-ai/ui-police-skill
npx playwright-core install chromium
npx ui-police install
```

Then run these three commands from the app root:

```sh
npx ui-police lint --git main
npx ui-police look http://localhost:3000 --out .ui-police/home
npx ui-police judge .ui-police/home --with self
```

The last command prints a handoff. View the images in `.ui-police/home`, follow `prompt.md`, write `verdict.json`, then run it again to get `report.md`. Use `--with claude` or `--with codex` for an automated judge. Antigravity uses the same handoff with `--with agy`.

## What it catches

The linter flags raw controls, literal colors, duplicate primitives and common layout problems. The visual review checks the page at 390 and 1440 px in light and dark. It records measurements and a judge's findings together.

For example, this code introduces a new control and a hardcoded color:

```tsx
<button className="bg-blue-500">Save</button>
```

Use the app's button and token instead:

```tsx
<Button>Save</Button>
```

## Install the skill

`npx ui-police install` copies the same skill into each CLI it finds: Claude Code, Codex and Antigravity. It is safe to run again. After the repository is public, you can also run `curl -fsSL https://raw.githubusercontent.com/oyren-ai/ui-police-skill/main/install.sh | bash`. You can also install one copy by hand:

| CLI | Skill folder |
| --- | --- |
| Claude Code | `~/.claude/skills/ui-police/` |
| Codex | `~/.codex/skills/ui-police/` |
| Antigravity | `~/.gemini/config/skills/ui-police/` |

Claude Code can install the repository as a plugin:

```text
/plugin marketplace add oyren-ai/ui-police-skill
/plugin install ui-police@ui-police
```

The repository also has `.agents/skills/ui-police` for project use in Codex and Antigravity. The GitHub install needs access while this repository is private. The CLI runs on Node 20 or later. `playwright-core` needs a Chromium browser for `look` and `refs`.

## Capture a reference

Capture a page you want to match:

```sh
npx ui-police refs home http://localhost:3000
npx ui-police look http://localhost:3000/new --ref home --out .ui-police/new
```

Inspect the reference images before using them. References go to `.ui-police/references/<name>` by default. Add a path under `references` in `ui-police.config.json` when you want to keep a reviewed set in your repo.

## Project config

Place `ui-police.config.json` in the app root:

```json
{
  "allowedOrigins": ["https://preview.example.com"],
  "exempt": ["**/generated-ui/**"],
  "references": { "home": "ui-police-references/home" }
}
```

Loopback HTTP with a port works without config. Remote pages need HTTPS and an exact origin in `allowedOrigins`. For a page behind a login, pass `--storage-state /path/to/private/state.json`. Keep that file outside the repo with mode `0600`.

See [CLI and config](docs/usage.md) for options and [security design](docs/security.md) for browser and judge isolation. UI police is MIT licensed. Oyren maintains this project.
