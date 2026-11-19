# Linear CLI Fallback for Remote Agent Sessions

When a Linear MCP server is connected in the current session, use the MCP tools directly. When no Linear MCP server is connected (such as in a remote cloud or Antigravity workspace without interactive MCP OAuth), bootstrap and use `.agents/references/linear-cli.mjs`.

Default Linear project hint for this repository: `CloudTracer`.

## Session bootstrap steps

1. Resolve the Antigravity data directory with `APP_DATA_DIR="${ANTIGRAVITY_APP_DATA_DIR:-$HOME/.gemini/jetski}"`, create `"$APP_DATA_DIR/bin"` (`mkdir -p "$APP_DATA_DIR/bin"`), and ensure `"$APP_DATA_DIR/bin"` is exported on `PATH` in `~/.bashrc`.
2. Check whether `"$APP_DATA_DIR/bin/linear"` and `"$APP_DATA_DIR/linear-token"` (or `$LINEAR_API_KEY`) already exist.
3. If `"$APP_DATA_DIR/bin/linear"` is missing, copy `.agents/references/linear-cli.mjs` to `"$APP_DATA_DIR/bin/linear"` and run `chmod +x "$APP_DATA_DIR/bin/linear"` if permitted by the filesystem (otherwise invoke via `node "$APP_DATA_DIR/bin/linear"`).
4. If neither `$LINEAR_API_KEY` nor `"$APP_DATA_DIR/linear-token"` exists, ask the user in chat for their Linear personal API key (`<YOUR_LINEAR_API_KEY>`) and run `linear auth-key <YOUR_LINEAR_API_KEY>`. Never hardcode, echo into tracked files, or commit API keys.
5. Register a persistent `linear` skill so future remote sessions load it automatically: call Antigravity's `save_skill` tool with `overwrite: true` when available, or write `~/.gemini/config/skills/linear/SKILL.md` as a local fallback, documenting `"$APP_DATA_DIR/bin/linear"` commands and the `Todo` -> `In Progress` -> `In Review` -> `Done` workflow.
6. Verify authentication and workspace access by running `linear me` and `linear projects`.

## Supported `linear` CLI commands

| Command | Purpose |
|---|---|
| `linear auth-key <YOUR_LINEAR_API_KEY>` | Verify viewer identity and save `<APP_DATA_DIR>/linear-token` (`0600`) |
| `linear me` / `linear whoami` | Print authenticated Linear user (`--json` supported) |
| `linear teams [--json]` | List workspace teams |
| `linear projects [--json]` | List workspace projects and linked teams |
| `linear states [--team <KEY>] [--json]` | List workflow states (case-insensitive team filter) |
| `linear issues` / `linear list` `[filters] [--json]` | Filter by `--project`, `--team`, `--state`, `--assignee`, `--limit` |
| `linear view <ISSUE-ID> [--json]` | Show issue metadata, branchName, description, and comments |
| `linear create --title <text> [options] [--json]` | Create issue (defaults `--state "Todo"` and `--assignee "me"`, inferring team from `--project`) |
| `linear state <ISSUE-ID> "<state-name>" [--json]` | Case-insensitively resolve state on the issue team and update |
| `linear update <ISSUE-ID> [options] [--json]` | Update `--state`, `--title`, `--description`, `--project`, `--assignee`, or `--priority` |
| `linear comment <ISSUE-ID> "<text>" [--json]` | Post a Markdown comment on an issue |
| `linear graphql "<query>" ['{"var":"val"}']` | Run raw GraphQL query or mutation against Linear |
