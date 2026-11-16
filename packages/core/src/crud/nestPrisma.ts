import { camel, jsString, mapTsType, pascal, propKey, safeFileSegment } from "../codegen/safe.js";
import type { ExportArtifact, SchemaModel } from "../types.js";
import { assertSchemaSinglePrimaryKeys } from "./assertSinglePk.js";
import { databaseUrlExample, renderPrismaSchema, writableColumns } from "./prismaSchema.js";
import { renderNestQueryHelpers } from "./querySecurity.js";

function decoratorFor(sqlType: string, inferred: string): string {
  const t = mapTsType(sqlType, inferred);
  if (t === "number") return "@IsNumber()\n  ";
  if (t === "boolean") return "@IsBoolean()\n  ";
  return "@IsString()\n  ";
}

export function renderNestPrisma(schema: SchemaModel): ExportArtifact[] {
  assertSchemaSinglePrimaryKeys(schema, "nestjs-prisma");
  const artifacts: ExportArtifact[] = [];
  artifacts.push({ path: "prisma/schema.prisma", content: renderPrismaSchema(schema), language: "typescript" });
  artifacts.push({ path: ".env.example", content: databaseUrlExample(schema.dialect) });
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
          "@nestjs/mapped-types": "^2.1.0",
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
    const writable = writableColumns(table);
    const sortAllow = table.columns.filter((c) => !c.isExcluded).map((c) => c.name);

    artifacts.push({
      path: `src/${file}/${file}.dto.ts`,
      language: "typescript",
      content: `import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class Create${entity}Dto {
${writable
  .map((c) => {
    const t = mapTsType(c.sqlType, c.inferredType);
    const dec = decoratorFor(c.sqlType, c.inferredType);
    return `  ${c.nullable ? "@IsOptional()\n  " : ""}${dec}${propKey(c.name)}${c.nullable ? "?" : "!"}: ${t};`;
  })
  .join("\n")}
}

export class Update${entity}Dto extends PartialType(Create${entity}Dto) {}
`,
    });

    artifacts.push({
      path: `src/${file}/query.util.ts`,
      language: "typescript",
      content: renderNestQueryHelpers(table),
    });

    artifacts.push({
      path: `src/${file}/${file}.service.ts`,
      language: "typescript",
      content: `import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { Create${entity}Dto, Update${entity}Dto } from './${file}.dto';
import { SEARCH_COLS } from './query.util';

const SORT_ALLOW = ${JSON.stringify(sortAllow)} as const;

@Injectable()
export class ${entity}Service {
  constructor(private readonly prisma: PrismaService) {}

  findAll(page = 1, pageSize = 20, search?: string, sort?: string, filter?: Record<string, unknown>) {
    const take = Math.min(100, Math.max(1, Math.floor(pageSize) || 20));
    const skip = (Math.max(1, Math.floor(page) || 1) - 1) * take;
    const where: Record<string, unknown> = { ...(filter ?? {}) };
    if (search && SEARCH_COLS.length) {
      where.OR = SEARCH_COLS.map((c) => ({ [c]: { contains: search } }));
    }
    const sortField = sort && (SORT_ALLOW as readonly string[]).includes(sort.replace(/^-/, ''))
      ? sort.replace(/^-/, '')
      : ${jsString(pk)};
    const sortDir = sort?.startsWith('-') ? 'desc' : 'asc';
    return Promise.all([
      this.prisma.${modelKey}.findMany({ where, skip, take, orderBy: { [sortField]: sortDir } }),
      this.prisma.${modelKey}.count({ where }),
    ]).then(([items, total]) => ({ items, total, page: Math.max(1, Math.floor(page) || 1), pageSize: take }));
  }

  async findOne(id: ${pkIsNumber ? "number" : "string"}) {
    const item = await this.prisma.${modelKey}.findUnique({ where: { ${propKey(pk)}: id as never } });
    if (!item) throw new NotFoundException();
    return item;
  }

  create(data: Create${entity}Dto) {
    return this.prisma.${modelKey}.create({ data: data as never }).catch(mapPrisma);
  }

  async update(id: ${pkIsNumber ? "number" : "string"}, data: Update${entity}Dto) {
    await this.findOne(id);
    return this.prisma.${modelKey}.update({ where: { ${propKey(pk)}: id as never }, data: data as never }).catch(mapPrisma);
  }

  async remove(id: ${pkIsNumber ? "number" : "string"}) {
    await this.findOne(id);
    await this.prisma.${modelKey}.delete({ where: { ${propKey(pk)}: id as never } }).catch(mapPrisma);
    return true;
  }
}

function mapPrisma(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') throw new NotFoundException();
    if (err.code === 'P2002') throw new ConflictException('Conflict');
  }
  throw err;
}
`,
    });

    artifacts.push({
      path: `src/${file}/${file}.controller.ts`,
      language: "typescript",
      content: `import { Body, Controller, Delete, Get, Param, ${pkIsNumber ? "ParseIntPipe, " : ""}Post, Put, Query, BadRequestException } from '@nestjs/common';
import { Create${entity}Dto, Update${entity}Dto } from './${file}.dto';
import { ${entity}Service } from './${file}.service';
import { asQueryString, sanitizeFilter } from './query.util';

@Controller('${file}')
export class ${entity}Controller {
  constructor(private readonly service: ${entity}Service) {}

  @Get()
  list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') searchRaw?: unknown,
    @Query('sort') sortRaw?: unknown,
    @Query('filter') filterRaw?: unknown,
  ) {
    try {
      const search = asQueryString(searchRaw, 'search');
      const sort = asQueryString(sortRaw, 'sort');
      let filter: Record<string, unknown> | undefined;
      const filterStr = asQueryString(filterRaw, 'filter');
      if (filterStr) {
        let parsed: unknown;
        try { parsed = JSON.parse(filterStr); }
        catch { throw new BadRequestException('Invalid filter JSON'); }
        filter = sanitizeFilter(parsed);
      }
      return this.service.findAll(Number(page), Number(pageSize), search, sort, filter);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      if (err && typeof err === 'object' && 'status' in err) {
        throw new BadRequestException(err instanceof Error ? err.message : 'Bad query');
      }
      throw err;
    }
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
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

  return artifacts;
}
