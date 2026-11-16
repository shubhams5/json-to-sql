import {
  camel,
  jsString,
  mapTsType,
  pascal,
  propAccess,
  propKey,
  safeFileSegment,
} from "../codegen/safe.js";
import type { CrudOrm, CrudTarget, ExportArtifact, SchemaModel, TableModel } from "../types.js";

function resolveOrm(target: CrudTarget): CrudOrm {
  return target.orm ?? "none";
}

function prismaType(sqlType: string, inferred: string): string {
  const t = (sqlType || inferred).toLowerCase();
  if (t.includes("tinyint(1)") || t === "bit" || t.includes("bool")) return "Boolean";
  if (t.includes("bigint")) return "BigInt";
  if (t.includes("int")) return "Int";
  if (t.includes("double") || t.includes("float") || t.includes("real") || t.includes("numeric") || t.includes("decimal")) {
    return "Float";
  }
  if (t.includes("json")) return "Json";
  if (t.includes("date") || t.includes("time")) return "DateTime";
  return "String";
}

function typeormColumnType(sqlType: string, inferred: string): string {
  const t = (sqlType || inferred).toLowerCase();
  if (t.includes("tinyint(1)") || t === "bit" || t.includes("bool")) return "boolean";
  if (t.includes("bigint")) return "bigint";
  if (t.includes("int")) return "int";
  if (t.includes("double") || t.includes("float") || t.includes("real")) return "float";
  if (t.includes("numeric") || t.includes("decimal")) return "decimal";
  if (t.includes("json")) return "simple-json";
  return "varchar";
}

function prismaProvider(dialect: SchemaModel["dialect"]): string {
  if (dialect === "postgres") return "postgresql";
  if (dialect === "mysql") return "mysql";
  if (dialect === "mssql") return "sqlserver";
  return "sqlite";
}

function renderPrismaSchema(schema: SchemaModel): string {
  const models = schema.tables
    .map((table) => {
      const model = pascal(table.name);
      const fields = table.columns
        .filter((c) => !c.isExcluded)
        .map((c) => {
          const optional = c.nullable && !c.isPrimaryKey ? "?" : "";
          const attrs: string[] = [];
          if (c.isPrimaryKey) attrs.push("@id");
          if (c.autoIncrement) attrs.push("@default(autoincrement())");
          if (c.isUnique && !c.isPrimaryKey) attrs.push("@unique");
          if (c.name !== c.originalName) attrs.push(`@map(${jsString(c.originalName)})`);
          return `  ${propKey(c.name)} ${prismaType(c.sqlType, c.inferredType)}${optional}${attrs.length ? " " + attrs.join(" ") : ""}`;
        });
      for (const fk of table.foreignKeys) {
        const relName = pascal(fk.refTable);
        fields.push(`  ${camel(fk.refTable)} ${relName} @relation(fields: [${fk.columns.map(propKey).join(", ")}], references: [${fk.refColumns.map(propKey).join(", ")}], onDelete: Cascade)`);
      }
      // opposite side stubs for parents
      return `model ${model} {\n${fields.join("\n")}\n  @@map(${jsString(table.name)})\n}`;
    })
    .join("\n\n");

  // Add back-relations for Prisma validity
  const withBackRelations = schema.tables.map((table) => {
    const model = pascal(table.name);
    const children = schema.tables.filter((t) => t.foreignKeys.some((fk) => fk.refTable === table.name));
    const back = children.map((child) => `  ${camel(child.name)} ${pascal(child.name)}[]`).join("\n");
    const fields = table.columns
      .filter((c) => !c.isExcluded)
      .map((c) => {
        const optional = c.nullable && !c.isPrimaryKey ? "?" : "";
        const attrs: string[] = [];
        if (c.isPrimaryKey) attrs.push("@id");
        if (c.autoIncrement) attrs.push("@default(autoincrement())");
        if (c.isUnique && !c.isPrimaryKey) attrs.push("@unique");
        return `  ${propKey(c.name)} ${prismaType(c.sqlType, c.inferredType)}${optional}${attrs.length ? " " + attrs.join(" ") : ""}`;
      });
    for (const fk of table.foreignKeys) {
      fields.push(
        `  ${camel(fk.refTable)} ${pascal(fk.refTable)} @relation(fields: [${fk.columns.map(propKey).join(", ")}], references: [${fk.refColumns.map(propKey).join(", ")}], onDelete: Cascade)`
      );
    }
    if (back) fields.push(back);
    return `model ${model} {\n${fields.join("\n")}\n  @@map(${jsString(table.name)})\n}`;
  });

  void models;
  return `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "${prismaProvider(schema.dialect)}"\n  url      = env("DATABASE_URL")\n}\n\n${withBackRelations.join("\n\n")}\n`;
}

function sortableColumns(table: TableModel): string[] {
  return table.columns.filter((c) => !c.isExcluded).map((c) => c.name);
}

function renderExpressPrisma(schema: SchemaModel): ExportArtifact[] {
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
          "prisma:migrate": "prisma migrate dev",
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
  artifacts.push({
    path: ".env.example",
    content:
      schema.dialect === "sqlite"
        ? 'DATABASE_URL="file:./dev.db"\nPORT=3000\n'
        : 'DATABASE_URL="postgresql://user:pass@localhost:5432/app"\nPORT=3000\n',
  });
  artifacts.push({
    path: "src/db.ts",
    language: "typescript",
    content: `import { PrismaClient } from '@prisma/client';\n\nexport const prisma = new PrismaClient();\n`,
  });

  for (const table of schema.tables) {
    const entity = pascal(table.name);
    const file = safeFileSegment(table.name);
    const pk = table.primaryKey[0] ?? "id";
    const modelKey = camel(table.name);
    const sortAllow = sortableColumns(table);
    const required = table.columns.filter((c) => !c.isExcluded && !c.nullable && !c.autoIncrement && !c.isPrimaryKey);

    artifacts.push({
      path: `src/routes/${file}.ts`,
      language: "typescript",
      content: `import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

const sortAllow = ${JSON.stringify(sortAllow)} as const;
const createSchema = z.object({
${required.map((c) => `  ${propKey(c.name)}: z.${mapTsType(c.sqlType, c.inferredType) === "number" ? "number()" : mapTsType(c.sqlType, c.inferredType) === "boolean" ? "boolean()" : "string()"},`).join("\n")}
}).passthrough();

export const ${camel(table.name)}Router = Router();

${camel(table.name)}Router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const sortField = sortRaw && (sortAllow as readonly string[]).includes(sortRaw.replace(/^-/, ''))
      ? sortRaw.replace(/^-/, '')
      : ${jsString(pk)};
    const sortDir = sortRaw?.startsWith('-') ? 'desc' : 'asc';
    let filter: Record<string, unknown> = {};
    if (req.query.filter) {
      try { filter = JSON.parse(String(req.query.filter)); }
      catch { return res.status(400).json({ error: 'Invalid filter JSON' }); }
    }
    const where: Record<string, unknown> = { ...filter };
    if (search) {
      where.OR = sortAllow.filter((c) => c !== ${jsString(pk)}).slice(0, 5).map((c) => ({ [c]: { contains: search } }));
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
  } catch (err) { next(err); }
});

${camel(table.name)}Router.get('/:id', async (req, res, next) => {
  try {
    const id = ${mapTsType(table.columns.find((c) => c.name === pk)?.sqlType ?? "", "integer") === "number" ? "Number(req.params.id)" : "req.params.id"};
    const item = await prisma.${modelKey}.findUnique({ where: { ${propKey(pk)}: id as never } });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) { next(err); }
});

${camel(table.name)}Router.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });
    const item = await prisma.${modelKey}.create({ data: parsed.data as never });
    res.status(201).json(item);
  } catch (err) { next(err); }
});

${camel(table.name)}Router.put('/:id', async (req, res, next) => {
  try {
    const id = ${mapTsType(table.columns.find((c) => c.name === pk)?.sqlType ?? "", "integer") === "number" ? "Number(req.params.id)" : "req.params.id"};
    const data = { ...req.body };
    delete data[${jsString(pk)}];
    const item = await prisma.${modelKey}.update({ where: { ${propKey(pk)}: id as never }, data });
    res.json(item);
  } catch (err) { next(err); }
});

${camel(table.name)}Router.delete('/:id', async (req, res, next) => {
  try {
    const id = ${mapTsType(table.columns.find((c) => c.name === pk)?.sqlType ?? "", "integer") === "number" ? "Number(req.params.id)" : "req.params.id"};
    await prisma.${modelKey}.delete({ where: { ${propKey(pk)}: id as never } });
    res.status(204).send();
  } catch (err) { next(err); }
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
app.listen(port, () => console.log('listening on ' + port));
`,
  });

  artifacts.push({
    path: "README.md",
    content: `# Generated Express + Prisma CRUD

## Setup
1. Copy \`.env.example\` to \`.env\` and set \`DATABASE_URL\`
2. \`npm install\`
3. \`npx prisma generate\`
4. \`npx prisma db push\` (or migrate)
5. \`npm run dev\`

Dialect: ${schema.dialect}
Tables: ${schema.tables.map((t) => t.name).join(", ")}
`,
  });

  return artifacts;
}

function renderNestPrisma(schema: SchemaModel): ExportArtifact[] {
  const artifacts = renderExpressPrisma(schema).filter(
    (a) => !a.path.startsWith("src/") && a.path !== "package.json" && a.path !== "README.md" && a.path !== "tsconfig.json"
  );
  // Keep prisma schema + env
  artifacts.push({
    path: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: "generated-nestjs-prisma",
        private: true,
        scripts: {
          build: "nest build",
          start: "node dist/main.js",
          "start:dev": "nest start --watch",
          "prisma:generate": "prisma generate",
        },
        dependencies: {
          "@nestjs/common": "^11.0.11",
          "@nestjs/core": "^11.0.11",
          "@nestjs/platform-express": "^11.0.11",
          "@prisma/client": "^6.5.0",
          "class-transformer": "^0.5.1",
          "class-validator": "^0.14.1",
          "reflect-metadata": "^0.2.2",
          rxjs: "^7.8.2",
        },
        devDependencies: {
          "@nestjs/cli": "^11.0.5",
          "@types/node": "^22.13.10",
          prisma: "^6.5.0",
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
          module: "commonjs",
          declaration: true,
          removeComments: true,
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          allowSyntheticDefaultImports: true,
          target: "ES2021",
          outDir: "./dist",
          baseUrl: "./",
          incremental: true,
          skipLibCheck: true,
          strict: true,
        },
        include: ["src/**/*"],
      },
      null,
      2
    ),
  });
  artifacts.push({
    path: "nest-cli.json",
    language: "json",
    content: JSON.stringify({ collection: "@nestjs/schematics", sourceRoot: "src" }, null, 2),
  });
  artifacts.push({
    path: "src/prisma.service.ts",
    language: "typescript",
    content: `import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
`,
  });

  for (const table of schema.tables) {
    const entity = pascal(table.name);
    const file = safeFileSegment(table.name);
    const pk = table.primaryKey[0] ?? "id";
    const modelKey = camel(table.name);
    const pkIsNumber = mapTsType(table.columns.find((c) => c.name === pk)?.sqlType ?? "", "integer") === "number";

    artifacts.push({
      path: `src/${file}/${file}.dto.ts`,
      language: "typescript",
      content: `import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
export class Create${entity}Dto {
${table.columns
  .filter((c) => !c.isExcluded && !c.autoIncrement && !c.isPrimaryKey)
  .map((c) => {
    const t = mapTsType(c.sqlType, c.inferredType);
    const dec = t === "number" ? "@IsNumber()" : t === "boolean" ? "@IsBoolean()" : "@IsString()";
    return `  ${c.nullable ? "@IsOptional()\n  " : ""}${dec}\n  ${propKey(c.name)}${c.nullable ? "?" : ""}: ${t};`;
  })
  .join("\n")}
}
export class Update${entity}Dto extends Create${entity}Dto {}
`,
    });

    artifacts.push({
      path: `src/${file}/${file}.service.ts`,
      language: "typescript",
      content: `import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Create${entity}Dto, Update${entity}Dto } from './${file}.dto';

@Injectable()
export class ${entity}Service {
  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, pageSize = 20, search?: string) {
    const take = Math.min(100, Math.max(1, pageSize));
    const skip = (Math.max(1, page) - 1) * take;
    const where = search ? { OR: [{ ${propKey(pk)}: undefined }] } : {};
    void search;
    return Promise.all([
      this.prisma.${modelKey}.findMany({ skip, take }),
      this.prisma.${modelKey}.count(),
    ]).then(([items, total]) => ({ items, total, page, pageSize: take }));
  }

  async findOne(id: ${pkIsNumber ? "number" : "string"}) {
    const item = await this.prisma.${modelKey}.findUnique({ where: { ${propKey(pk)}: id as never } });
    if (!item) throw new NotFoundException();
    return item;
  }

  create(data: Create${entity}Dto) {
    return this.prisma.${modelKey}.create({ data: data as never });
  }

  async update(id: ${pkIsNumber ? "number" : "string"}, data: Update${entity}Dto) {
    await this.findOne(id);
    return this.prisma.${modelKey}.update({ where: { ${propKey(pk)}: id as never }, data: data as never });
  }

  async remove(id: ${pkIsNumber ? "number" : "string"}) {
    await this.findOne(id);
    await this.prisma.${modelKey}.delete({ where: { ${propKey(pk)}: id as never } });
    return true;
  }
}
`,
    });

    artifacts.push({
      path: `src/${file}/${file}.controller.ts`,
      language: "typescript",
      content: `import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { Create${entity}Dto, Update${entity}Dto } from './${file}.dto';
import { ${entity}Service } from './${file}.service';

@Controller('${file}')
export class ${entity}Controller {
  constructor(private readonly service: ${entity}Service) {}

  @Get()
  list(@Query('page') page = '1', @Query('pageSize') pageSize = '20', @Query('search') search?: string) {
    return this.service.findAll(Number(page), Number(pageSize), search);
  }

  @Get(':id')
  get(@Param('id'${pkIsNumber ? ", ParseIntPipe" : ""}) id: ${pkIsNumber ? "number" : "string"}) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() body: Create${entity}Dto) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id'${pkIsNumber ? ", ParseIntPipe" : ""}) id: ${pkIsNumber ? "number" : "string"}, @Body() body: Update${entity}Dto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id'${pkIsNumber ? ", ParseIntPipe" : ""}) id: ${pkIsNumber ? "number" : "string"}) {
    return this.service.remove(id);
  }
}
`,
    });

    artifacts.push({
      path: `src/${file}/${file}.module.ts`,
      language: "typescript",
      content: `import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ${entity}Controller } from './${file}.controller';
import { ${entity}Service } from './${file}.service';

@Module({
  controllers: [${entity}Controller],
  providers: [${entity}Service, PrismaService],
})
export class ${entity}Module {}
`,
    });
  }

  artifacts.push({
    path: "src/app.module.ts",
    language: "typescript",
    content: `import { Module } from '@nestjs/common';
${schema.tables.map((t) => `import { ${pascal(t.name)}Module } from './${safeFileSegment(t.name)}/${safeFileSegment(t.name)}.module';`).join("\n")}

@Module({
  imports: [${schema.tables.map((t) => `${pascal(t.name)}Module`).join(", ")}],
})
export class AppModule {}
`,
  });

  artifacts.push({
    path: "src/main.ts",
    language: "typescript",
    content: `import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
`,
  });

  artifacts.push({
    path: "README.md",
    content: `# Generated NestJS + Prisma CRUD

## Setup
1. Copy \`.env.example\` to \`.env\`
2. \`npm install\`
3. \`npx prisma generate && npx prisma db push\`
4. \`npm run start:dev\`

Tables: ${schema.tables.map((t) => t.name).join(", ")}
`,
  });

  // Ensure prisma schema + env from express path
  if (!artifacts.some((a) => a.path === "prisma/schema.prisma")) {
    artifacts.unshift({ path: "prisma/schema.prisma", content: renderPrismaSchema(schema) });
  }
  if (!artifacts.some((a) => a.path === ".env.example")) {
    artifacts.push({
      path: ".env.example",
      content:
        schema.dialect === "sqlite"
          ? 'DATABASE_URL="file:./dev.db"\nPORT=3000\n'
          : 'DATABASE_URL="postgresql://user:pass@localhost:5432/app"\nPORT=3000\n',
    });
  }

  return artifacts;
}

function renderTypeOrmEntity(table: TableModel): string {
  const entity = pascal(table.name);
  const cols = table.columns.filter((c) => !c.isExcluded);
  return `import { Entity, PrimaryGeneratedColumn, PrimaryColumn, Column } from 'typeorm';

@Entity(${jsString(table.name)})
export class ${entity} {
${cols
  .map((c) => {
    if (c.isPrimaryKey && c.autoIncrement) {
      return `  @PrimaryGeneratedColumn()\n  ${propKey(c.name)}!: number;`;
    }
    if (c.isPrimaryKey) {
      return `  @PrimaryColumn()\n  ${propKey(c.name)}!: ${mapTsType(c.sqlType, c.inferredType)};`;
    }
    return `  @Column({ type: ${jsString(typeormColumnType(c.sqlType, c.inferredType))}, nullable: ${c.nullable} })\n  ${propKey(c.name)}${c.nullable ? "?" : "!"}: ${mapTsType(c.sqlType, c.inferredType)};`;
  })
  .join("\n\n")}
}
`;
}

function renderExpressTypeOrm(schema: SchemaModel): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [];
  artifacts.push({
    path: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: "generated-express-typeorm",
        private: true,
        type: "module",
        scripts: { build: "tsc -p tsconfig.json", start: "node dist/main.js", dev: "tsx src/main.ts" },
        dependencies: {
          express: "^4.21.2",
          typeorm: "^0.3.21",
          "reflect-metadata": "^0.2.2",
          pg: "^8.14.1",
          mysql2: "^3.14.0",
          "better-sqlite3": "^11.8.1",
          mssql: "^11.0.1",
          zod: "^3.24.2",
        },
        devDependencies: {
          "@types/express": "^4.17.21",
          "@types/node": "^22.13.10",
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
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          skipLibCheck: true,
        },
        include: ["src/**/*"],
      },
      null,
      2
    ),
  });
  artifacts.push({
    path: ".env.example",
    content: `DB_TYPE=${schema.dialect === "postgres" ? "postgres" : schema.dialect}\nDB_HOST=localhost\nDB_PORT=5432\nDB_USER=user\nDB_PASS=pass\nDB_NAME=app\nPORT=3000\n`,
  });
  artifacts.push({
    path: "src/data-source.ts",
    language: "typescript",
    content: `import 'reflect-metadata';
import { DataSource } from 'typeorm';
${schema.tables.map((t) => `import { ${pascal(t.name)} } from './entities/${safeFileSegment(t.name)}.entity.js';`).join("\n")}

export const AppDataSource = new DataSource({
  type: (process.env.DB_TYPE as 'postgres' | 'mysql' | 'mssql' | 'better-sqlite3') ?? 'better-sqlite3',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  username: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME ?? 'dev.db',
  synchronize: true,
  entities: [${schema.tables.map((t) => pascal(t.name)).join(", ")}],
});
`,
  });

  for (const table of schema.tables) {
    const file = safeFileSegment(table.name);
    const entity = pascal(table.name);
    const pk = table.primaryKey[0] ?? "id";
    artifacts.push({
      path: `src/entities/${file}.entity.ts`,
      language: "typescript",
      content: renderTypeOrmEntity(table),
    });
    artifacts.push({
      path: `src/routes/${file}.ts`,
      language: "typescript",
      content: `import { Router } from 'express';
import { AppDataSource } from '../data-source.js';
import { ${entity} } from '../entities/${file}.entity.js';

export const ${camel(table.name)}Router = Router();
const repo = () => AppDataSource.getRepository(${entity});

${camel(table.name)}Router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
    const [items, total] = await repo().findAndCount({ skip: (page - 1) * pageSize, take: pageSize });
    res.json({ items, total, page, pageSize });
  } catch (err) { next(err); }
});

${camel(table.name)}Router.get('/:id', async (req, res, next) => {
  try {
    const item = await repo().findOneBy({ ${propKey(pk)}: req.params.id as never });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) { next(err); }
});

${camel(table.name)}Router.post('/', async (req, res, next) => {
  try {
    const created = repo().create(req.body);
    const saved = await repo().save(created);
    res.status(201).json(saved);
  } catch (err) { next(err); }
});

${camel(table.name)}Router.put('/:id', async (req, res, next) => {
  try {
    const existing = await repo().findOneBy({ ${propKey(pk)}: req.params.id as never });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const data = { ...req.body };
    delete ${propAccess("data", pk)};
    Object.assign(existing, data);
    res.json(await repo().save(existing));
  } catch (err) { next(err); }
});

${camel(table.name)}Router.delete('/:id', async (req, res, next) => {
  try {
    const result = await repo().delete(req.params.id);
    if (!result.affected) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) { next(err); }
});
`,
    });
  }

  artifacts.push({
    path: "src/main.ts",
    language: "typescript",
    content: `import express from 'express';
import { AppDataSource } from './data-source.js';
${schema.tables.map((t) => `import { ${camel(t.name)}Router } from './routes/${safeFileSegment(t.name)}.js';`).join("\n")}

async function main() {
  await AppDataSource.initialize();
  const app = express();
  app.use(express.json());
${schema.tables.map((t) => `  app.use('/${safeFileSegment(t.name)}', ${camel(t.name)}Router);`).join("\n")}
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  app.listen(Number(process.env.PORT ?? 3000));
}
main();
`,
  });

  artifacts.push({
    path: "README.md",
    content: `# Generated Express + TypeORM CRUD

## Setup
1. Copy \`.env.example\` to \`.env\`
2. \`npm install\`
3. \`npm run dev\`

Tables: ${schema.tables.map((t) => t.name).join(", ")}
`,
  });

  return artifacts;
}

function renderNestTypeOrm(schema: SchemaModel): ExportArtifact[] {
  // Reuse entities from TypeORM express and wrap Nest modules
  const artifacts: ExportArtifact[] = [];
  artifacts.push({
    path: "package.json",
    language: "json",
    content: JSON.stringify(
      {
        name: "generated-nestjs-typeorm",
        private: true,
        scripts: { build: "nest build", start: "node dist/main.js", "start:dev": "nest start --watch" },
        dependencies: {
          "@nestjs/common": "^11.0.11",
          "@nestjs/core": "^11.0.11",
          "@nestjs/platform-express": "^11.0.11",
          "@nestjs/typeorm": "^11.0.0",
          typeorm: "^0.3.21",
          "class-validator": "^0.14.1",
          "class-transformer": "^0.5.1",
          "reflect-metadata": "^0.2.2",
          rxjs: "^7.8.2",
          pg: "^8.14.1",
          mysql2: "^3.14.0",
          "better-sqlite3": "^11.8.1",
        },
        devDependencies: {
          "@nestjs/cli": "^11.0.5",
          "@types/node": "^22.13.10",
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
          module: "commonjs",
          declaration: true,
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          target: "ES2021",
          outDir: "./dist",
          strict: true,
          skipLibCheck: true,
        },
        include: ["src/**/*"],
      },
      null,
      2
    ),
  });
  artifacts.push({
    path: "nest-cli.json",
    language: "json",
    content: JSON.stringify({ collection: "@nestjs/schematics", sourceRoot: "src" }, null, 2),
  });
  artifacts.push({
    path: ".env.example",
    content: `DB_TYPE=better-sqlite3\nDB_NAME=dev.db\nPORT=3000\n`,
  });

  for (const table of schema.tables) {
    const file = safeFileSegment(table.name);
    const entity = pascal(table.name);
    const pk = table.primaryKey[0] ?? "id";
    artifacts.push({ path: `src/entities/${file}.entity.ts`, language: "typescript", content: renderTypeOrmEntity(table) });
    artifacts.push({
      path: `src/${file}/${file}.service.ts`,
      language: "typescript",
      content: `import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ${entity} } from '../entities/${file}.entity';

@Injectable()
export class ${entity}Service {
  constructor(@InjectRepository(${entity}) private readonly repo: Repository<${entity}>) {}

  findAll(page = 1, pageSize = 20) {
    const take = Math.min(100, Math.max(1, pageSize));
    const skip = (Math.max(1, page) - 1) * take;
    return this.repo.findAndCount({ skip, take }).then(([items, total]) => ({ items, total, page, pageSize: take }));
  }

  async findOne(id: string | number) {
    const item = await this.repo.findOneBy({ ${propKey(pk)}: id as never });
    if (!item) throw new NotFoundException();
    return item;
  }

  create(data: Partial<${entity}>) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string | number, data: Partial<${entity}>) {
    const existing = await this.findOne(id);
    Object.assign(existing, data);
    delete (existing as any)[${jsString(pk)}];
    return this.repo.save(existing);
  }

  async remove(id: string | number) {
    await this.findOne(id);
    await this.repo.delete(id);
    return true;
  }
}
`,
    });
    artifacts.push({
      path: `src/${file}/${file}.controller.ts`,
      language: "typescript",
      content: `import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ${entity}Service } from './${file}.service';

@Controller('${file}')
export class ${entity}Controller {
  constructor(private readonly service: ${entity}Service) {}
  @Get() list(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.service.findAll(Number(page), Number(pageSize));
  }
  @Get(':id') get(@Param('id') id: string) { return this.service.findOne(id); }
  @Post() create(@Body() body: Record<string, unknown>) { return this.service.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.update(id, body); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
`,
    });
    artifacts.push({
      path: `src/${file}/${file}.module.ts`,
      language: "typescript",
      content: `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${entity} } from '../entities/${file}.entity';
import { ${entity}Controller } from './${file}.controller';
import { ${entity}Service } from './${file}.service';

@Module({
  imports: [TypeOrmModule.forFeature([${entity}])],
  controllers: [${entity}Controller],
  providers: [${entity}Service],
})
export class ${entity}Module {}
`,
    });
  }

  artifacts.push({
    path: "src/app.module.ts",
    language: "typescript",
    content: `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
${schema.tables.map((t) => `import { ${pascal(t.name)} } from './entities/${safeFileSegment(t.name)}.entity';`).join("\n")}
${schema.tables.map((t) => `import { ${pascal(t.name)}Module } from './${safeFileSegment(t.name)}/${safeFileSegment(t.name)}.module';`).join("\n")}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: (process.env.DB_TYPE as 'better-sqlite3') ?? 'better-sqlite3',
      database: process.env.DB_NAME ?? 'dev.db',
      synchronize: true,
      entities: [${schema.tables.map((t) => pascal(t.name)).join(", ")}],
    }),
    ${schema.tables.map((t) => `${pascal(t.name)}Module`).join(", ")}
  ],
})
export class AppModule {}
`,
  });
  artifacts.push({
    path: "src/main.ts",
    language: "typescript",
    content: `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
`,
  });
  artifacts.push({
    path: "README.md",
    content: `# Generated NestJS + TypeORM CRUD

## Setup
1. Copy \`.env.example\` to \`.env\`
2. \`npm install\`
3. \`npm run start:dev\`

Tables: ${schema.tables.map((t) => t.name).join(", ")}
`,
  });
  return artifacts;
}

/** Experimental: interface-only / in-memory scaffolds (legacy). */
function renderExperimentalScaffold(schema: SchemaModel, target: CrudTarget): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [];
  const note = `# EXPERIMENTAL — not production persistence\n\nThis target uses orm=none (in-memory or repository interfaces only).\nPrefer --crud express-prisma | express-typeorm | nestjs-prisma | nestjs-typeorm.\n`;

  if (target.framework === "nestjs") {
    for (const table of schema.tables) {
      const entity = pascal(table.name);
      const file = safeFileSegment(table.name);
      const pk = table.primaryKey[0] ?? "id";
      const pkIsNumber = mapTsType(table.columns.find((c) => c.name === pk)?.sqlType ?? "", "integer") === "number";
      artifacts.push({
        path: `src/${file}/${file}.service.ts`,
        language: "typescript",
        content: `import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class ${entity}Service {
  private items: Record<string, unknown>[] = [];
  private seq = 1;

  findAll(page = 1, pageSize = 20) {
    const take = Math.min(100, Math.max(1, pageSize));
    const start = (Math.max(1, page) - 1) * take;
    return { items: this.items.slice(start, start + take), total: this.items.length };
  }

  findOne(id: string | number) {
    const item = this.items.find((row) => String(row[${jsString(pk)}]) === String(id));
    if (!item) throw new NotFoundException();
    return item;
  }

  create(data: Record<string, unknown>) {
    const item = { ...data, ${propKey(pk)}: ${pkIsNumber ? "this.seq++" : "String(this.seq++)"} };
    this.items.push(item);
    return item;
  }

  update(id: string | number, data: Record<string, unknown>) {
    const item = this.findOne(id);
    const { [${jsString(pk)}]: _ignore, ...rest } = data;
    Object.assign(item, rest);
    return item;
  }

  remove(id: string | number) {
    this.findOne(id);
    this.items = this.items.filter((row) => String(row[${jsString(pk)}]) !== String(id));
    return true;
  }
}
`,
      });
    }
    artifacts.push({ path: "README.md", content: note });
    return artifacts;
  }

  artifacts.push({ path: "README.md", content: note });
  return artifacts;
}

export function generateCrud(schema: SchemaModel, target: CrudTarget): ExportArtifact[] {
  // Validate table/column names for path safety
  for (const table of schema.tables) {
    safeFileSegment(table.name);
    for (const col of table.columns) {
      if (col.name.includes("/") || col.name.includes("\\") || col.name.includes("..")) {
        throw new Error(`Unsafe column name: ${col.name}`);
      }
    }
  }

  const orm = resolveOrm(target);

  if (target.framework === "express" && orm === "prisma") {
    if (target.language === "javascript") {
      throw new Error("Express + Prisma requires TypeScript");
    }
    return renderExpressPrisma(schema);
  }
  if (target.framework === "nestjs" && orm === "prisma") {
    return renderNestPrisma(schema);
  }
  if (target.framework === "express" && orm === "typeorm") {
    if (target.language === "javascript") {
      throw new Error("Express + TypeORM requires TypeScript");
    }
    return renderExpressTypeOrm(schema);
  }
  if (target.framework === "nestjs" && orm === "typeorm") {
    return renderNestTypeOrm(schema);
  }

  // Legacy experimental
  return renderExperimentalScaffold(schema, target);
}

export function parseCrudTargetFlag(value: string): CrudTarget {
  switch (value) {
    case "express-js":
      return { runtime: "nodejs", framework: "express", language: "javascript", orm: "none" };
    case "express-ts":
      return { runtime: "nodejs", framework: "express", language: "typescript", orm: "none" };
    case "nestjs":
      return { runtime: "nodejs", framework: "nestjs", language: "typescript", orm: "none" };
    case "express-prisma":
      return { runtime: "nodejs", framework: "express", language: "typescript", orm: "prisma" };
    case "express-typeorm":
      return { runtime: "nodejs", framework: "express", language: "typescript", orm: "typeorm" };
    case "nestjs-prisma":
      return { runtime: "nodejs", framework: "nestjs", language: "typescript", orm: "prisma" };
    case "nestjs-typeorm":
      return { runtime: "nodejs", framework: "nestjs", language: "typescript", orm: "typeorm" };
    default:
      throw new Error(
        `Unknown --crud value: ${value}. Use express-prisma|express-typeorm|nestjs-prisma|nestjs-typeorm (or experimental express-js|express-ts|nestjs)`
      );
  }
}
