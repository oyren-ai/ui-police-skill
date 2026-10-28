# CLI and config

Run commands from the web app root. `npx ui-police` uses the locally installed package.

## Lint

`lint <paths...>` scans UI files. `lint --git <base>` checks added lines in the working tree against a Git ref. `lint --diff <file>` checks a unified diff; `-` reads standard input. `--format json` emits rule IDs and findings. `--strict` also fails on warnings. `--config <file>` selects a config file.

The scanner covers TSX, JSX and stylesheets. The default config skips tests, stories, generated output and common token files. `ui-police.config.json` can extend `exempt`, `ignore`, `primitives`, `theme`, `artwork` and `uiFiles` with glob patterns. `npx ui-police rules` lists all 18 stable rule IDs.

## Look and refs

`look <url> --out <dir>` captures 390 and 1440 px in light and dark. `refs <name> <url>` writes a reference set. Add `--ref <name>` to a look command to include it in the judge prompt.

Useful options: `--wait <ms>` waits after loading; `--settle <selector>` waits for an element; `--detail <selector>` adds a crop; `--full` captures the full page; `--widths 390,1440` and `--themes light,dark` change coverage. `--capture-forced-themes` keeps both captures when a page forces one theme. `--storage-state <file>` loads a Playwright storage state from a private file outside the repo. `--headful` shows the browser. `--no-browser-sandbox` runs Chromium without its process sandbox for a loopback page when this machine blocks sandbox startup.

`--click <accessible name>` and `--mock <file>` can prepare local states. The mock file lists method, path, status and response body. These options only work on loopback pages. `--passthrough METHOD /path` lets a named request reach the local app while mocks are active. Use them for screens that require a tab, menu or fixture response.

A capture writes `shots/`, `crops/`, `facts.json`, `prompt.md` and `report.json`. The report includes the source URL and capture time.

## Judge

`judge <dir> --with claude|codex|agy|self` reads a look report and writes `verdict.json` and `report.md`. Claude and Codex can run automatically when the CLI and login are available. `self` is a manual handoff to your current vision agent. `agy` is a manual handoff to Antigravity, whose CLI has no tool-free image mode. In either manual mode, read `prompt.md`, inspect every image it lists, write the requested `verdict.json`, and rerun the command.

Codex uses a private broker for its API credential. Its browser capture does not share that credential. The judge accepts only a verdict in the expected shape; measured hard failures still fail the report.

## Sweep

`sweep <screens.json> --out <dir>` runs look and judge over several screens. The file is an array of objects with `name`, `url`, and optional `ref`, `storageState`, `themes`, `settle`, and `wait`. `--only a,b` selects screens. `--skip-judge` captures first; `--judge-only` judges existing captures. It writes `sweep.json` and `sweep-summary.md`.

## Config keys

| Key | Default | Use |
| --- | --- | --- |
| `allowedOrigins` | `[]` | Exact HTTPS origins that `look` and `refs` may visit. Loopback HTTP is always allowed. |
| `references` | `{}` | Names mapped to paths under the app root. An unmapped name uses `.ui-police/references/<name>`. |
| `exempt` | `[]` | UI file globs to skip. |
| `ignore` | Tests, stories and build output | File globs to skip. |
| `uiFiles` | TSX, JSX and style files | File globs considered by lint. |
| `primitives` | `**/components/ui/**` | Files allowed to use raw controls and inline SVG. |
| `theme` | Token and global style files | Files allowed to define literal colors. |
| `artwork` | Illustrations, logos and SVG files | Files allowed to use drawing colors and layout. |

Each array extends the built-in list. `allowedOrigins` replaces its empty default; `references` adds names. See [`lib/config.mjs`](../lib/config.mjs) for the exact default globs.
