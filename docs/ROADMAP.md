# Roadmap

## Near term

- More golden fixtures across dialects
- FK editor UI (create/edit relationships interactively)
- Template files extracted from `crud/generate.ts` / `typeormGen.ts` into `packages/core/templates`
- Optional CI job: generated TypeORM against Postgres/MySQL services (beyond SQL dialect exec)

## Done in 0.3.0

- TypeORM dialect-aware Nest/Express config + entity relations + FK error mapping

## Later

- Prisma / Drizzle schema export
- Python FastAPI CRUD target
- Optional WASM packaging of core for non-Node hosts
