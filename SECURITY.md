# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes |

## Reporting a vulnerability

Please open a GitHub Security Advisory (preferred) or email the maintainers if a private channel is published later.

Do not file public issues for undisclosed vulnerabilities.

## Security notes

- All conversion runs locally in the browser or CLI
- Generated SQL is never executed by this tool
- JSON input is size/depth/node limited to reduce resource exhaustion risk
- Identifiers and literals are escaped per dialect
