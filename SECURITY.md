# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes |
| 0.1.x   | Best effort |

## Reporting a vulnerability

Prefer a private GitHub security advisory: https://github.com/shubhams5/json-to-sql/security/advisories

Do not file public issues for undisclosed vulnerabilities.

## Security notes

- All conversion runs locally in the browser or CLI
- Generated SQL is never executed by this tool (except optional local test harnesses)
- JSON input is limited by UTF-8 byte size, depth, node count, rows, and columns
- Identifiers and literals are escaped per dialect; MySQL backslash escaping included
- Column defaults are treated as literals unless an explicit allowlisted expression is provided
- Generated CRUD uses sanitized identifiers; review artifacts before production use
