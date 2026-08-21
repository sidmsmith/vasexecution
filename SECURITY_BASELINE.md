# Security Baseline

The security rules that apply across every project. Follow these
whenever working with credentials, secrets, or permission scopes.

## Never commit secrets

Never commit `.env`, `.env.local`, `.token`, API keys, credentials, or
any other file containing secret values. Keep them in gitignored files
only, and never stage them — even briefly.

## Never hardcode a fallback secret

Don't write code that falls back to a literal secret value when an
expected environment variable is missing. A missing credential should
fail clearly, not silently substitute a real value baked into source.
If a fallback is needed for local development, use an obviously fake
placeholder, never a working credential.

## Never commit live credentials directly

Database connection strings, API keys, and similar values must never
appear as literal values in tracked files — not in application code,
not in comments, not as a "temporary" value, not in a script. If a
real value is needed locally, put it in a gitignored file, not
anything tracked.

## Environment access

- Grant only the environment access a task requires.
- Prefer the narrowest permission scope that accomplishes the work.

## Permissions must match behavior

Never claim or imply a capability that hasn't been granted. If
documented behavior describes something current permissions don't
support, that's a bug — bring the two back in sync before either is
trusted again.

## Windows / PowerShell encoding note

On Windows, saving a file with PowerShell's `Set-Content` (or similar)
can add a UTF-8 byte-order mark that breaks strict JSON parsing —
including `package.json`, which can silently fail a deploy. Save text
files as UTF-8 without a BOM.

## Credential rotation

If a credential is ever exposed — committed to source control, logged
somewhere it shouldn't be, or shared outside its intended scope —
treat it as compromised and rotate it. Treat exposure — not intent —
as the trigger for credential rotation.
