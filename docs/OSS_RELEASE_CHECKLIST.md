# Open-source release checklist

- [x] MIT LICENSE added (confirm final copyright holder name before publish)
- [x] README with install + usage
- [x] CONTRIBUTING / CODE_OF_CONDUCT / SECURITY / CHANGELOG
- [x] Issue + PR templates
- [x] GitHub Actions CI
- [x] Dependabot
- [x] Architecture + feature checklist + security assessment
- [x] Database + codegen matrices in README
- [x] Product screenshot under `docs/screenshots/json-tab.png`
- [x] Coverage notes in `docs/COVERAGE.md` (optional CI coverage artifact later)
- [ ] npm publish of `@json-to-sql/core` and CLI — **blocked**: Actions `NPM_TOKEN` missing/empty (`ENEEDAUTH` on `v0.2.2` release workflow). Add Granular Access Token with publish on `@json-to-sql/*`, set repo secret `NPM_TOKEN`, re-run Release workflow or publish locally after `npm login`.
