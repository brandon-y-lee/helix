# Mei Pelle

## Local development

The project uses Node.js 24 and pnpm 9.15.4.

```bash
nvm install
nvm use
corepack enable pnpm
pnpm install --frozen-lockfile
pnpm dev
```

The committed `.nvmrc` keeps local development and CI on the same Node.js
major version. Vercel also reads the `engines.node` declaration in
`package.json` for builds and functions.

## Git workflow

`main` is production and `dev` is the staging/integration branch. Codex tasks
start from the current local `dev` head in isolated worktrees and merge back to
`dev` only after verification. The helper supports both app-managed Worktree and
shared Local threads. See [docs/git-workflow.md](docs/git-workflow.md) for the
guarded start, merge, and promotion workflow.
