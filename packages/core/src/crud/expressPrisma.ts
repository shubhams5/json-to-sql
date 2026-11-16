import { camel, jsString, mapTsType, pascal, propKey, safeFileSegment } from "../codegen/safe.js";
import type { ExportArtifact, SchemaModel } from "../types.js";
import { databaseUrlExample, renderPrismaSchema, stringSearchColumns } from "./prismaSchema.js";
import { renderPrismaErrorHandler, renderQueryHelpers } from "./querySecurity.js";

export function renderExpressPrisma(schema: SchemaModel): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [];
  artifacts.push({ path: "prisma/schema.prisma", content: renderPrismaSchema(schema), language: "typescript" });
  artifacts.push({
    path: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: "generated-express-prisma",
        private: true,
        type: "module",
        scripts: {
          build: "tsc -p tsconfig.json",
          start: "node dist/main.js",
          dev: "tsx src/main.ts",
          "prisma:generate": "prisma generate",
          "prisma:push": "prisma db push",
        },
        dependencies: {
          "@prisma/client": "^6.5.0",
          express: "^4.21.2",
          zod: "^3.24.2",
        },
        devDependencies: {
          "@types/express": "^4.17.21",
          "@types/node": "^22.13.10",
          prisma: "^6.5.0",
          tsx: "^4.19.3",
          typescript: "^5.9.2",
        },
      },
      null,
      2
    ),
  });
  artifacts.push({
    path: "tsconfig.json",
    language: "json",
    content: JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          outDir: "dist",
          rootDir: "src",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ["src/**/*"],
      },
      null,
      2
    ),
  });
  artifacts.push({ path: ".env.example", content: databaseUrlExample(schema.dialect) });
  artifacts.push({
    path: "src/db.ts",
    language: "typescript",
    content: `import { PrismaClient } from '@prisma/client';\n\nexport const prisma = new PrismaClient();\n`,
  });

  for (const table of schema.tables) {
    const file = safeFileSegment(table.name);
    const pk = table.primaryKey[0] ?? "id";
    const modelKey = camel(table.name);
    const pkIsNumber = mapTsType(table.columns.find((c) => c.name === pk)?.sqlType ?? "", "integer") === "number";
    const sortAllow = table.columns.filter((c) => !c.isExcluded).map((c) => c.name);
    const searchCols = stringSearchColumns(table);

    artifacts.push({
      path: `src/routes/${file}.ts`,
      language: "typescript",
      content: `import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

${renderQueryHelpers(table)}
${renderPrismaErrorHandler()}

export const ${camel(table.name)}Router = Router();

${camel(table.name)}Router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Math.floor(Number(req.query.page ?? 1)) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(req.query.pageSize ?? 20)) || 20));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const sortField = sortRaw && (${JSON.stringify(sortAllow)} as readonly string[]).includes(sortRaw.replace(/^-/, ''))
      ? sortRaw.replace(/^-/, '')
      : ${jsString(pk)};
    const sortDir = sortRaw?.startsWith('-') ? 'desc' : 'asc';
    let filter: Record<string, unknown> = {};
    if (req.query.filter) {
      try { filter = sanitizeFilter(JSON.parse(String(req.query.filter))); }
      catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid filter JSON';
        if (err && typeof err === 'object' && 'status' in err) return res.status(400).json({ error: message });
        return res.status(400).json({ error: 'Invalid filter JSON' });
      }
    }
    const where: Record<string, unknown> = { ...filter };
    if (search && ${JSON.stringify(searchCols)}.length) {
      where.OR = (${JSON.stringify(searchCols)} as string[]).map((c) => ({ [c]: { contains: search } }));
    }
    const [items, total] = await Promise.all([
      prisma.${modelKey}.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortField]: sortDir },
      }),
      prisma.${modelKey}.count({ where }),
    ]);
    res.json({ items, total, page, pageSize });
  } catch (err) {
    if (mapPrismaError(err, res)) return;
    next(err);
  }
});

${camel(table.name)}Router.get('/:id', async (req, res, next) => {
  try {
    const id = ${pkIsNumber ? "Number(req.params.id)" : "req.params.id"};
    if (${pkIsNumber ? "Number.isNaN(id)" : "!id"}) return res.status(400).json({ error: 'Invalid id' });
    const item = await prisma.${modelKey}.findUnique({ where: { ${propKey(pk)}: id as never } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    if (mapPrismaError(err, res)) return;
    next(err);
  }
});

${camel(table.name)}Router.post('/', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an object' });
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });
    const item = await prisma.${modelKey}.create({ data: parsed.data as never });
    res.status(201).json(item);
  } catch (err) {
    if (mapPrismaError(err, res)) return;
    next(err);
  }
});

${camel(table.name)}Router.put('/:id', async (req, res, next) => {
  try {
    const id = ${pkIsNumber ? "Number(req.params.id)" : "req.params.id"};
    if (${pkIsNumber ? "Number.isNaN(id)" : "!id"}) return res.status(400).json({ error: 'Invalid id' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an object' });
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });
    const item = await prisma.${modelKey}.update({ where: { ${propKey(pk)}: id as never }, data: parsed.data as never });
    res.json(item);
  } catch (err) {
    if (mapPrismaError(err, res)) return;
    next(err);
  }
});

${camel(table.name)}Router.delete('/:id', async (req, res, next) => {
  try {
    const id = ${pkIsNumber ? "Number(req.params.id)" : "req.params.id"};
    if (${pkIsNumber ? "Number.isNaN(id)" : "!id"}) return res.status(400).json({ error: 'Invalid id' });
    await prisma.${modelKey}.delete({ where: { ${propKey(pk)}: id as never } });
    res.status(204).send();
  } catch (err) {
    if (mapPrismaError(err, res)) return;
    next(err);
  }
});
`,
    });
  }

  artifacts.push({
    path: "src/main.ts",
    language: "typescript",
    content: `import express from 'express';
${schema.tables.map((t) => `import { ${camel(t.name)}Router } from './routes/${safeFileSegment(t.name)}.js';`).join("\n")}

const app = express();
app.use(express.json());
${schema.tables.map((t) => `app.use('/${safeFileSegment(t.name)}', ${camel(t.name)}Router);`).join("\n")}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 3000);
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log('listening on ' + port));
}
export default app;
`,
  });

  artifacts.push({
    path: "README.md",
    content: `# Generated Express + Prisma CRUD

## Setup
1. Copy \`.env.example\` to \`.env\`
2. \`npm install\`
3. \`npx prisma generate && npx prisma db push\`
4. \`npm run dev\`

Dialect: ${schema.dialect}
Tables: ${schema.tables.map((t) => t.name).join(", ")}
`,
  });

  return artifacts;
}
