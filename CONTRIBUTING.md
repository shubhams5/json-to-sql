# Contributing

Thanks for helping improve JSON to SQL.

## Development

1. Fork and clone the repository
2. `npm install`
3. `npm run build:packages`
4. `npm run dev` for the UI, or `npm test` for core tests

## Guidelines

- Keep generation logic in `packages/core` — UI should stay thin
- Add dialect behavior only inside `packages/core/src/dialects`
- Include Vitest coverage for parser, inference, dialect escaping, and export changes
- Do not add paid/proprietary services
- Never execute generated SQL automatically

## Pull requests

- Keep PRs focused
- Update docs/matrices when adding dialects or CRUD targets
- Ensure `npm test`, `npm run lint`, and `npm run build` pass

## Code of conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
