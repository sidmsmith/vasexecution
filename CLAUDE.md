# VAS Execution — Project Instructions

This project follows the global `AGENTS.md` and `SECURITY_BASELINE.md`.
The notes below cover only what's specific to this repository.

## Version identifiers

This project's version appears in three independent places — bump
whichever actually changed:

- `admin.html` and `config-sync.html` — the `<title>` and the
  `.subtitle` header (bump together if the change touches either file)
- `index.html` — its own version string, independent of the above
- `api/index.py` — the `APP_VERSION` constant, independent of the above

## Deploy verification — not yet available

This project's current permissions don't include the
deployment-status tools (`list_deployments`, `get_deployment`) — only
`list_teams` is granted. Per `AGENTS.md`, don't claim to verify a
deploy until those permissions are actually added.
