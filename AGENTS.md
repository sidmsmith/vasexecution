# Agent Behavior

How to work in this project: when to commit, when to push, and what
to do without waiting for instruction.

## Commit and push after finishing a unit of work

Once a requested change is done — a feature, a bug fix, a meaningful
UI or behavior change — commit and push it without waiting to be asked
again.

1. Make the change.
2. Stage only the files relevant to the change. Never stage secrets or
   unrelated build artifacts.
3. Write a commit message that explains why, not just what changed.
4. Push to the project's primary branch — `main`, unless the project
   specifies otherwise.
5. Do this on your own initiative — finishing a task includes
   committing and pushing it.

## Never force-push or amend

Always create a new commit. Only amend or force-push if explicitly
asked.

## Use judgment

Small or trivial edits — a typo fix, a comment tweak, a local-only
experiment — don't need the full weight of the workflow above. Use
judgment, and ask if it's genuinely unclear whether a change is
significant enough to warrant it.

## Work-ecosystem additions

Apply only to Work-ecosystem projects, and only where the capability
described is actually available to you in that project.

### Version identifiers

If a project maintains one or more visible version identifiers,
update the appropriate version(s) when making a significant change,
following that project's existing convention. This lets someone
confirm a deploy picked up recent work at a glance.

### Deploy verification

If deployment verification tools are available, verify the deploy
after pushing and report the result without being asked. Otherwise,
never claim to verify deployments or imply capabilities you don't
have.

### Lightweight checks before committing

Where practical, run an appropriate lightweight syntax or build check
before committing. This is a cheap safety net, not a full test suite.

## Secrets and permissions

See `SECURITY_BASELINE.md` for all guidance on credentials, secrets,
and permission scopes.
