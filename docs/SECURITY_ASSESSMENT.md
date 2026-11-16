# Security assessment

Date: 2026-11-16 (updated for 0.2.0 hardening)

## Scope

Local JSON → schema/SQL/CRUD generation in browser and CLI.

## Controls

| Risk | Mitigation |
|------|------------|
| Resource exhaustion via huge/deep JSON | UTF-8 `maxBytes` 5MB (`TextEncoder`/`Buffer.byteLength`), `maxDepth` 32, `maxNodes` 100k, row/column caps; partial limits merged with defaults |
| SQL injection in generated scripts | Dialect-specific identifier + literal escaping; MySQL backslash escaping; defaults quoted as literals unless tagged expression allowlist |
| Accidental execution of generated SQL | Tool only generates text; never connects to a DB (except optional local test runners) |
| Supply-chain / paid APIs | No conversion network calls; OSS dependencies only |
| XSS via rendered output | Output shown in CodeMirror as text, not `dangerouslySetInnerHTML` |
| Code injection in generated apps | Property access via safe helpers / `JSON.stringify` for string literals; file segments slugified; path traversal blocked in CLI |
| ZIP path abuse | Table/file segments sanitized via `safeFileSegment` |

## Residual risks

- Users may execute generated SQL on production DBs without review
- Generated CRUD still needs human review before production deploy
- Live PG/MySQL/MSSQL parser fuzzing is limited; SQLite execution is the always-on check
- Client-side ZIP/codegen is not a substitute for security review of emitted application code

## Recommendation

Safe for local developer use. Review all generated artifacts before applying to real databases or shipping generated services. Prefer Prisma/TypeORM targets over experimental `orm:none` scaffolds.
