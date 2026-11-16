import type { CrudTarget, ExportArtifact, SchemaModel, TableModel } from "../types.js";

function pascal(name: string): string {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

function camel(name: string): string {
  const p = pascal(name);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function tsType(sqlType: string, inferred: string): string {
  const t = (sqlType || inferred).toLowerCase();
  if (t.includes("int") || t.includes("double") || t.includes("float") || t.includes("real") || t.includes("numeric")) return "number";
  if (t.includes("bool") || t === "bit" || t.includes("tinyint(1)")) return "boolean";
  if (t.includes("json")) return "Record<string, unknown>";
  return "string";
}

function renderDto(table: TableModel, language: "javascript" | "typescript"): string {
  if (language === "javascript") {
    return `/** @typedef {Object} ${pascal(table.name)}Dto\n${table.columns
      .filter((c) => !c.isExcluded)
      .map((c) => ` * @property {${tsType(c.sqlType, c.inferredType)}} ${c.name}`)
      .join("\n")}\n */\n\nexport function validate${pascal(table.name)}(input) {\n  const errors = [];\n${table.columns
      .filter((c) => !c.isExcluded && !c.nullable && !c.autoIncrement)
      .map((c) => `  if (input.${c.name} === undefined || input.${c.name} === null) errors.push('${c.name} is required');`)
      .join("\n")}\n  return errors;\n}\n`;
  }

  const fields = table.columns
    .filter((c) => !c.isExcluded)
    .map((c) => `  ${c.name}${c.nullable || c.autoIncrement ? "?" : ""}: ${tsType(c.sqlType, c.inferredType)};`)
    .join("\n");
  return `export interface ${pascal(table.name)}Dto {\n${fields}\n}\n\nexport function validate${pascal(table.name)}(input: Partial<${pascal(table.name)}Dto>): string[] {\n  const errors: string[] = [];\n${table.columns
    .filter((c) => !c.isExcluded && !c.nullable && !c.autoIncrement)
    .map((c) => `  if (input.${c.name} === undefined || input.${c.name} === null) errors.push('${c.name} is required');`)
    .join("\n")}\n  return errors;\n}\n`;
}

function renderExpressService(table: TableModel, language: "javascript" | "typescript"): string {
  const entity = pascal(table.name);
  const repo = camel(table.name) + "Repo";
  const pk = table.primaryKey[0] ?? "id";
  if (language === "typescript") {
    return `import type { ${entity}Dto } from '../dto/${table.name}.dto';\n\nexport interface ${entity}Repository {\n  findAll(query: { page: number; pageSize: number; sort?: string; search?: string; filter?: Record<string, unknown> }): Promise<{ items: ${entity}Dto[]; total: number }>;\n  findById(id: ${entity}Dto['${pk}']): Promise<${entity}Dto | null>;\n  create(data: Omit<${entity}Dto, '${pk}'>): Promise<${entity}Dto>;\n  update(id: ${entity}Dto['${pk}'], data: Partial<${entity}Dto>): Promise<${entity}Dto | null>;\n  remove(id: ${entity}Dto['${pk}']): Promise<boolean>;\n}\n\nexport class ${entity}Service {\n  constructor(private readonly ${repo}: ${entity}Repository) {}\n\n  list(query: { page?: number; pageSize?: number; sort?: string; search?: string; filter?: Record<string, unknown> }) {\n    return this.${repo}.findAll({\n      page: query.page ?? 1,\n      pageSize: query.pageSize ?? 20,\n      sort: query.sort,\n      search: query.search,\n      filter: query.filter,\n    });\n  }\n\n  get(id: ${entity}Dto['${pk}']) {\n    return this.${repo}.findById(id);\n  }\n\n  create(data: Omit<${entity}Dto, '${pk}'>) {\n    return this.${repo}.create(data);\n  }\n\n  update(id: ${entity}Dto['${pk}'], data: Partial<${entity}Dto>) {\n    return this.${repo}.update(id, data);\n  }\n\n  remove(id: ${entity}Dto['${pk}']) {\n    return this.${repo}.remove(id);\n  }\n}\n`;
  }

  return `export class ${entity}Service {\n  constructor(${repo}) {\n    this.${repo} = ${repo};\n  }\n\n  list(query = {}) {\n    return this.${repo}.findAll({\n      page: query.page ?? 1,\n      pageSize: query.pageSize ?? 20,\n      sort: query.sort,\n      search: query.search,\n      filter: query.filter,\n    });\n  }\n\n  get(id) { return this.${repo}.findById(id); }\n  create(data) { return this.${repo}.create(data); }\n  update(id, data) { return this.${repo}.update(id, data); }\n  remove(id) { return this.${repo}.remove(id); }\n}\n`;
}

function renderExpressController(table: TableModel, language: "javascript" | "typescript"): string {
  const entity = pascal(table.name);
  const svc = camel(table.name) + "Service";
  if (language === "typescript") {
    return `import type { Request, Response, NextFunction } from 'express';\nimport type { ${entity}Service } from '../services/${table.name}.service';\nimport { validate${entity} } from '../dto/${table.name}.dto';\n\nexport class ${entity}Controller {\n  constructor(private readonly ${svc}: ${entity}Service) {}\n\n  list = async (req: Request, res: Response, next: NextFunction) => {\n    try {\n      const result = await this.${svc}.list({\n        page: Number(req.query.page ?? 1),\n        pageSize: Number(req.query.pageSize ?? 20),\n        sort: req.query.sort as string | undefined,\n        search: req.query.search as string | undefined,\n        filter: req.query.filter ? JSON.parse(String(req.query.filter)) : undefined,\n      });\n      res.json(result);\n    } catch (err) { next(err); }\n  };\n\n  get = async (req: Request, res: Response, next: NextFunction) => {\n    try {\n      const item = await this.${svc}.get(req.params.id as never);\n      if (!item) return res.status(404).json({ error: 'Not found' });\n      res.json(item);\n    } catch (err) { next(err); }\n  };\n\n  create = async (req: Request, res: Response, next: NextFunction) => {\n    try {\n      const errors = validate${entity}(req.body);\n      if (errors.length) return res.status(400).json({ errors });\n      const item = await this.${svc}.create(req.body);\n      res.status(201).json(item);\n    } catch (err) { next(err); }\n  };\n\n  update = async (req: Request, res: Response, next: NextFunction) => {\n    try {\n      const item = await this.${svc}.update(req.params.id as never, req.body);\n      if (!item) return res.status(404).json({ error: 'Not found' });\n      res.json(item);\n    } catch (err) { next(err); }\n  };\n\n  remove = async (req: Request, res: Response, next: NextFunction) => {\n    try {\n      const ok = await this.${svc}.remove(req.params.id as never);\n      if (!ok) return res.status(404).json({ error: 'Not found' });\n      res.status(204).send();\n    } catch (err) { next(err); }\n  };\n}\n`;
  }

  return `import { validate${entity} } from '../dto/${table.name}.dto.js';\n\nexport class ${entity}Controller {\n  constructor(${svc}) {\n    this.${svc} = ${svc};\n  }\n\n  list = async (req, res, next) => {\n    try {\n      const result = await this.${svc}.list({\n        page: Number(req.query.page ?? 1),\n        pageSize: Number(req.query.pageSize ?? 20),\n        sort: req.query.sort,\n        search: req.query.search,\n        filter: req.query.filter ? JSON.parse(String(req.query.filter)) : undefined,\n      });\n      res.json(result);\n    } catch (err) { next(err); }\n  };\n\n  get = async (req, res, next) => {\n    try {\n      const item = await this.${svc}.get(req.params.id);\n      if (!item) return res.status(404).json({ error: 'Not found' });\n      res.json(item);\n    } catch (err) { next(err); }\n  };\n\n  create = async (req, res, next) => {\n    try {\n      const errors = validate${entity}(req.body);\n      if (errors.length) return res.status(400).json({ errors });\n      const item = await this.${svc}.create(req.body);\n      res.status(201).json(item);\n    } catch (err) { next(err); }\n  };\n\n  update = async (req, res, next) => {\n    try {\n      const item = await this.${svc}.update(req.params.id, req.body);\n      if (!item) return res.status(404).json({ error: 'Not found' });\n      res.json(item);\n    } catch (err) { next(err); }\n  };\n\n  remove = async (req, res, next) => {\n    try {\n      const ok = await this.${svc}.remove(req.params.id);\n      if (!ok) return res.status(404).json({ error: 'Not found' });\n      res.status(204).send();\n    } catch (err) { next(err); }\n  };\n}\n`;
}

function renderExpressRoutes(table: TableModel, language: "javascript" | "typescript"): string {
  const entity = pascal(table.name);
  const ext = language === "typescript" ? "" : ".js";
  const paramType = language === "typescript" ? `: ${entity}Controller` : "";
  return `import { Router } from 'express';
import { ${entity}Controller } from '../controllers/${table.name}.controller${ext}';

export function create${entity}Router(controller${paramType}) {
  const router = Router();
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
}
`;
}

function renderNestModule(table: TableModel): ExportArtifact[] {
  const entity = pascal(table.name);
  const pk = table.primaryKey[0] ?? "id";
  const dtoFields = table.columns
    .filter((c) => !c.isExcluded)
    .map((c) => `  ${c.name}${c.nullable || c.autoIncrement ? "?" : ""}: ${tsType(c.sqlType, c.inferredType)};`)
    .join("\n");

  return [
    {
      path: `src/${table.name}/${table.name}.dto.ts`,
      language: "typescript",
      content: `export class ${entity}Dto {\n${dtoFields}\n}\n`,
    },
    {
      path: `src/${table.name}/${table.name}.service.ts`,
      language: "typescript",
      content: `import { Injectable } from '@nestjs/common';\nimport { ${entity}Dto } from './${table.name}.dto';\n\n@Injectable()\nexport class ${entity}Service {\n  private items: ${entity}Dto[] = [];\n\n  findAll(page = 1, pageSize = 20, search?: string) {\n    let rows = this.items;\n    if (search) {\n      const q = search.toLowerCase();\n      rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));\n    }\n    const start = (page - 1) * pageSize;\n    return { items: rows.slice(start, start + pageSize), total: rows.length };\n  }\n\n  findOne(id: ${entity}Dto['${pk}']) {\n    return this.items.find((item) => item.${pk} === id) ?? null;\n  }\n\n  create(data: Omit<${entity}Dto, '${pk}'>) {\n    const item = { ${pk}: this.items.length + 1, ...data } as ${entity}Dto;\n    this.items.push(item);\n    return item;\n  }\n\n  update(id: ${entity}Dto['${pk}'], data: Partial<${entity}Dto>) {\n    const idx = this.items.findIndex((item) => item.${pk} === id);\n    if (idx < 0) return null;\n    this.items[idx] = { ...this.items[idx], ...data };\n    return this.items[idx];\n  }\n\n  remove(id: ${entity}Dto['${pk}']) {\n    const before = this.items.length;\n    this.items = this.items.filter((item) => item.${pk} !== id);\n    return this.items.length < before;\n  }\n}\n`,
    },
    {
      path: `src/${table.name}/${table.name}.controller.ts`,
      language: "typescript",
      content: `import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';\nimport { ${entity}Dto } from './${table.name}.dto';\nimport { ${entity}Service } from './${table.name}.service';\n\n@Controller('${table.name}')\nexport class ${entity}Controller {\n  constructor(private readonly service: ${entity}Service) {}\n\n  @Get()\n  list(\n    @Query('page') page = '1',\n    @Query('pageSize') pageSize = '20',\n    @Query('search') search?: string,\n  ) {\n    return this.service.findAll(Number(page), Number(pageSize), search);\n  }\n\n  @Get(':${pk}')\n  get(@Param('${pk}') id: string) {\n    return this.service.findOne(id as never);\n  }\n\n  @Post()\n  create(@Body() body: Omit<${entity}Dto, '${pk}'>) {\n    return this.service.create(body);\n  }\n\n  @Put(':${pk}')\n  update(@Param('${pk}') id: string, @Body() body: Partial<${entity}Dto>) {\n    return this.service.update(id as never, body);\n  }\n\n  @Delete(':${pk}')\n  remove(@Param('${pk}') id: string) {\n    return this.service.remove(id as never);\n  }\n}\n`,
    },
    {
      path: `src/${table.name}/${table.name}.module.ts`,
      language: "typescript",
      content: `import { Module } from '@nestjs/common';\nimport { ${entity}Controller } from './${table.name}.controller';\nimport { ${entity}Service } from './${table.name}.service';\n\n@Module({\n  controllers: [${entity}Controller],\n  providers: [${entity}Service],\n  exports: [${entity}Service],\n})\nexport class ${entity}Module {}\n`,
    },
  ];
}

export function generateCrud(schema: SchemaModel, target: CrudTarget): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [];
  const ext = target.language === "typescript" ? "ts" : "js";

  if (target.framework === "nestjs") {
    for (const table of schema.tables) {
      artifacts.push(...renderNestModule(table));
    }
    artifacts.push({
      path: "src/app.module.ts",
      language: "typescript",
      content: `import { Module } from '@nestjs/common';\n${schema.tables
        .map((t) => `import { ${pascal(t.name)}Module } from './${t.name}/${t.name}.module';`)
        .join("\n")}\n\n@Module({\n  imports: [${schema.tables.map((t) => `${pascal(t.name)}Module`).join(", ")}],\n})\nexport class AppModule {}\n`,
    });
    artifacts.push({
      path: "README.md",
      content: `# Generated NestJS CRUD\n\nDialect: ${schema.dialect}\n\nModules generated for: ${schema.tables.map((t) => t.name).join(", ")}\n`,
    });
    return artifacts;
  }

  // Express
  for (const table of schema.tables) {
    artifacts.push({
      path: `src/dto/${table.name}.dto.${ext}`,
      language: target.language,
      content: renderDto(table, target.language),
    });
    artifacts.push({
      path: `src/services/${table.name}.service.${ext}`,
      language: target.language,
      content: renderExpressService(table, target.language),
    });
    artifacts.push({
      path: `src/controllers/${table.name}.controller.${ext}`,
      language: target.language,
      content: renderExpressController(table, target.language),
    });
    artifacts.push({
      path: `src/routes/${table.name}.routes.${ext}`,
      language: target.language,
      content: renderExpressRoutes(table, target.language),
    });
  }

  artifacts.push({
    path: `src/app.${ext}`,
    language: target.language,
    content:
      target.language === "typescript"
        ? `import express from 'express';\n${schema.tables
            .map(
              (t) =>
                `import { create${pascal(t.name)}Router } from './routes/${t.name}.routes';\nimport { ${pascal(t.name)}Controller } from './controllers/${t.name}.controller';\nimport { ${pascal(t.name)}Service } from './services/${t.name}.service';`
            )
            .join("\n")}\n\nconst app = express();\napp.use(express.json());\n\n// Wire repositories before use.\n${schema.tables
            .map((t) => `// app.use('/${t.name}', create${pascal(t.name)}Router(new ${pascal(t.name)}Controller(new ${pascal(t.name)}Service(/* repo */))));`)
            .join("\n")}\n\nexport default app;\n`
        : `import express from 'express';\n${schema.tables
            .map(
              (t) =>
                `import { create${pascal(t.name)}Router } from './routes/${t.name}.routes.js';\nimport { ${pascal(t.name)}Controller } from './controllers/${t.name}.controller.js';\nimport { ${pascal(t.name)}Service } from './services/${t.name}.service.js';`
            )
            .join("\n")}\n\nconst app = express();\napp.use(express.json());\n\n// Wire repositories before use.\n${schema.tables
            .map((t) => `// app.use('/${t.name}', create${pascal(t.name)}Router(new ${pascal(t.name)}Controller(new ${pascal(t.name)}Service(/* repo */))));`)
            .join("\n")}\n\nexport default app;\n`,
  });

  artifacts.push({
    path: "README.md",
    content: `# Generated Express CRUD (${target.language})\n\nTables: ${schema.tables.map((t) => t.name).join(", ")}\n\nIncludes pagination, filtering, sorting, and search query params on list endpoints.\n`,
  });

  return artifacts;
}
