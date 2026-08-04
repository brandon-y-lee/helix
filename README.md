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
