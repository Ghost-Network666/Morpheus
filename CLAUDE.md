# Morpheus — Claude Instructions

## Git Workflow

This is a solo project. Always follow these rules, no exceptions:

- **Always commit and push directly to `main`.**
- Never create feature branches, pull request branches, or any other branches.
- Never use branch names like `claude/...`, `feature/...`, etc.
- If a session starts on a non-main branch, merge it into `main`, push `main`, and delete the other branch before doing any other work.
- After every task, make sure all changes are committed and pushed to `main`.

## Commit Attribution

Every commit message must end with:

```
Co-Authored-By: Ghostnetwork <ghost-network666@users.noreply.github.com>
```

Never use "Claude", "Anthropic", or any AI name in commit messages, PR bodies, code comments, or any file pushed to the repo.

## Version Policy

- **The app version is permanently `1.0.0`. Never change it — not for bug fixes, not for any reason.**
- Every fix gets committed to `main` and the CI re-releases under the same `v1.0.0` tag, overwriting the previous binaries.
- Do not bump the version. Do not create a new tag. Do not suggest incrementing the version number.
- If electron-updater ever needs a version bump to detect an update, that is not a valid reason — keep version at `1.0.0` regardless.

## Style

- No team conventions needed — keep things simple and direct.
