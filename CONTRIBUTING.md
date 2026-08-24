# Contributing

DemoRentals is fictional sample branding that demonstrates white-label customization. Do not treat it as a production tenant identity.

Use Node 22 and `npm ci`. Before opening a contribution, run:

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run release:check
```

Use `LOCAL_AUTH=true` only with `NODE_ENV=development`. Production authentication remains WorkOS.
