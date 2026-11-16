# Security assessment

Date: 2026-11-16

## Scope

Local JSON → schema/SQL/CRUD generation in browser and CLI.

## Controls

| Risk | Mitigation |
|------|------------|
| Resource exhaustion via huge/deep JSON | `maxBytes` 5MB, `maxDepth` 32, `maxNodes` 100k |
| SQL injection in generated scripts | Dialect-specific identifier + literal escaping |
| Accidental execution of generated SQL | Tool only generates text; never connects to a DB |
| Supply-chain / paid APIs | No conversion network calls; OSS dependencies only |
| XSS via rendered output | Output shown in CodeMirror as text, not `dangerouslySetInnerHTML` |

## Residual risks

- Users may execute generated SQL on production DBs without review — documented warnings in UI/CLI/docs
- Client-side ZIP/codegen is not a substitute for security review of emitted application code

## Recommendation

Safe for local developer use. Review all generated artifacts before applying to real databases or shipping generated services.
