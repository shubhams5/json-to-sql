# @json-to-sql/cli

CLI for `@json-to-sql/core`.

```bash
npm install -g @json-to-sql/cli
json2sql data.json --dialect postgres --table users --out ./out --crud express-prisma
cat data.json | json2sql - --out ./out
```

Node.js 22+. Pass `--overwrite` to replace existing files. Output is restricted to the current working directory.
