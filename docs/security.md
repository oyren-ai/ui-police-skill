# Security design

The browser visits only the selected origin. Loopback HTTP needs an explicit port. Remote captures need HTTPS and an exact entry in `allowedOrigins`. Credentials embedded in URLs, public IP literals and alternate HTTPS ports are rejected. Requests and WebSockets to another origin are blocked, including redirect hops. The `--no-browser-sandbox` option is available only for loopback pages. It removes Chromium process isolation, so use it only when the machine blocks sandbox startup. A storage state file must be a regular file owned by the caller, mode `0600`, outside the project. The CLI loads it without writing it to the report.

The capture can include private page content. Review it before sharing. A page's text, screenshots, reference notes and console output are evidence, not instructions to a judge.

Claude runs in a restricted print session with tools disabled. Codex runs in a filesystem sandbox and receives an expiring broker capability; the broker holds the real login outside the sandbox. Antigravity does not provide a tool-free image call in this CLI, so `--with agy` uses a manual handoff. `--with self` uses the same file handoff. Neither manual mode starts a model process.

The installer copies one skill file to each supported client. It does not install shell hooks or write CLI configuration. Its output names each destination. Review a remote script before piping it to a shell.
