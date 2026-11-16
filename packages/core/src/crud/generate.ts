import {
  camel,
  jsString,
  mapTsType,
  pascal,
  propKey,
  safeFileSegment,
} from "../codegen/safe.js";
import type { CrudOrm, CrudTarget, ExportArtifact, SchemaModel, TableModel } from "../types.js";
import { assertSchemaSinglePrimaryKeys } from "./assertSinglePk.js";
import { renderExpressPrisma } from "./expressPrisma.js";
import { renderNestPrisma } from "./nestPrisma.js";
import { renderPrismaSchema, writableColumns } from "./prismaSchema.js";
import { zodTypeForColumn } from "./querySecurity.js";

export { renderPrismaSchema };

function typeormDtoDecorator(sqlType: string, inferred: string): string {
  const t = mapTsType(sqlType, inferred);
  if (t === "number") return "@IsNumber()\n  ";
  if (t === "boolean") return "@IsBoolean()\n  ";
  return "@IsString()\n  ";
}

function dbTypeExample(dialect: SchemaModel["dialect"]): string {
  if (dialect === "sqlite") return "better-sqlite3";
  if (dialect === "postgres") return "postgres";
  if (dialect === "mysql") return "mysql";
  return "mssql";
}

function resolveOrm(target: CrudTarget): CrudOrm {
  return target.orm ?? "none";
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
  assertSchemaSinglePrimaryKeys(schema, "express-typeorm");
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
    content: `DB_TYPE=${dbTypeExample(schema.dialect)}\nDB_HOST=localhost\nDB_PORT=5432\nDB_USER=user\nDB_PASS=pass\nDB_NAME=app\nTYPEORM_SYNC=false\nPORT=3000\n`,
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
  synchronize: process.env.TYPEORM_SYNC === 'true',
  entities: [${schema.tables.map((t) => pascal(t.name)).join(", ")}],
});
`,
  });

  for (const table of schema.tables) {
    const file = safeFileSegment(table.name);
    const entity = pascal(table.name);
    const pk = table.primaryKey[0] ?? "id";
    const pkIsNumber = mapTsType(table.columns.find((c) => c.name === pk)?.sqlType ?? "", "integer") === "number";
    const writable = writableColumns(table);
    artifacts.push({
      path: `src/entities/${file}.entity.ts`,
      language: "typescript",
      content: renderTypeOrmEntity(table),
    });
    artifacts.push({
      path: `src/routes/${file}.ts`,
      language: "typescript",
      content: `import { Router } from 'express';
import { z } from 'zod';
import { AppDataSource } from '../data-source.js';
import { ${entity} } from '../entities/${file}.entity.js';

export const ${camel(table.name)}Router = Router();
const repo = () => AppDataSource.getRepository(${entity});

const createSchema = z.object({
${writable.map((c) => `  ${JSON.stringify(c.name)}: ${zodTypeForColumn(c.sqlType, c.inferredType)}${c.nullable ? ".optional().nullable()" : ""},`).join("\n")}
}).strict();

const updateSchema = createSchema.partial();

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
    const id = ${pkIsNumber ? "Number(req.params.id)" : "req.params.id"};
    if (${pkIsNumber ? "!Number.isInteger(id)" : "!id"}) return res.status(400).json({ error: 'Invalid id' });
    const item = await repo().findOneBy({ ${propKey(pk)}: id as never });
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) { next(err); }
});

${camel(table.name)}Router.post('/', async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an object' });
    }
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });
    const created = repo().create(parsed.data as never);
    const saved = await repo().save(created);
    res.status(201).json(saved);
  } catch (err) { next(err); }
});

${camel(table.name)}Router.put('/:id', async (req, res, next) => {
  try {
    const id = ${pkIsNumber ? "Number(req.params.id)" : "req.params.id"};
    if (${pkIsNumber ? "!Number.isInteger(id)" : "!id"}) return res.status(400).json({ error: 'Invalid id' });
    const existing = await repo().findOneBy({ ${propKey(pk)}: id as never });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Body must be an object' });
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() });
    const data = { ...parsed.data } as Record<string, unknown>;
    delete data[${jsString(pk)}];
    Object.assign(existing, data);
    res.json(await repo().save(existing));
  } catch (err) { next(err); }
});

${camel(table.name)}Router.delete('/:id', async (req, res, next) => {
  try {
    const id = ${pkIsNumber ? "Number(req.params.id)" : "req.params.id"};
    if (${pkIsNumber ? "!Number.isInteger(id)" : "!id"}) return res.status(400).json({ error: 'Invalid id' });
    const result = await repo().delete(id);
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
3. Set \`TYPEORM_SYNC=true\` only for local development (default is false; use migrations in production)
4. \`npm run dev\`

Tables: ${schema.tables.map((t) => t.name).join(", ")}
`,
  });

  return artifacts;
}

function renderNestTypeOrm(schema: SchemaModel): ExportArtifact[] {
  assertSchemaSinglePrimaryKeys(schema, "nestjs-typeorm");
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
          "@nestjs/mapped-types": "^2.1.0",
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
    content: `DB_TYPE=better-sqlite3\nDB_NAME=dev.db\nTYPEORM_SYNC=false\nPORT=3000\n`,
  });

  for (const table of schema.tables) {
    const file = safeFileSegment(table.name);
    const entity = pascal(table.name);
    const pk = table.primaryKey[0] ?? "id";
    const pkIsNumber = mapTsType(table.columns.find((c) => c.name === pk)?.sqlType ?? "", "integer") === "number";
    const writable = writableColumns(table);
    artifacts.push({ path: `src/entities/${file}.entity.ts`, language: "typescript", content: renderTypeOrmEntity(table) });
    artifacts.push({
      path: `src/${file}/${file}.dto.ts`,
      language: "typescript",
      content: `import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class Create${entity}Dto {
${writable
  .map((c) => {
    const opt = c.nullable ? "@IsOptional()\n  " : "";
    return `  ${opt}${typeormDtoDecorator(c.sqlType, c.inferredType)}${propKey(c.name)}${c.nullable ? "?" : "!"}: ${mapTsType(c.sqlType, c.inferredType)};`;
  })
  .join("\n\n")}
}

export class Update${entity}Dto extends PartialType(Create${entity}Dto) {}
`,
    });
    artifacts.push({
      path: `src/${file}/${file}.service.ts`,
      language: "typescript",
      content: `import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Create${entity}Dto, Update${entity}Dto } from './${file}.dto';
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

  create(data: Create${entity}Dto) {
    return this.repo.save(this.repo.create(data));
  }

  async update(id: string | number, data: Update${entity}Dto) {
    const existing = await this.findOne(id);
    const patch = { ...data } as Record<string, unknown>;
    delete patch[${jsString(pk)}];
    Object.assign(existing, patch);
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
      content: `import { Body, Controller, Delete, Get, Param, ${pkIsNumber ? "ParseIntPipe, " : ""}Post, Put, Query } from '@nestjs/common';
import { Create${entity}Dto, Update${entity}Dto } from './${file}.dto';
import { ${entity}Service } from './${file}.service';

@Controller('${file}')
export class ${entity}Controller {
  constructor(private readonly service: ${entity}Service) {}
  @Get() list(@Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.service.findAll(Number(page), Number(pageSize));
  }
  @Get(':id') get(@Param('id'${pkIsNumber ? ", ParseIntPipe" : ""}) id: ${pkIsNumber ? "number" : "string"}) {
    return this.service.findOne(id);
  }
  @Post() create(@Body() body: Create${entity}Dto) { return this.service.create(body); }
  @Put(':id') update(@Param('id'${pkIsNumber ? ", ParseIntPipe" : ""}) id: ${pkIsNumber ? "number" : "string"}, @Body() body: Update${entity}Dto) {
    return this.service.update(id, body);
  }
  @Delete(':id') remove(@Param('id'${pkIsNumber ? ", ParseIntPipe" : ""}) id: ${pkIsNumber ? "number" : "string"}) {
    return this.service.remove(id);
  }
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
      synchronize: process.env.TYPEORM_SYNC === 'true',
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
    content: `import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
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
3. Set \`TYPEORM_SYNC=true\` only for local development (default is false; use migrations in production)
4. \`npm run start:dev\`

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
