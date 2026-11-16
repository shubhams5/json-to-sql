import { jsString, mapTsType } from "../codegen/safe.js";
import type { TableModel } from "../types.js";
import { stringSearchColumns, writableColumns } from "./prismaSchema.js";

const SAFE_OPS = new Set([
  "equals",
  "contains",
  "in",
  "lt",
  "lte",
  "gt",
  "gte",
  "startsWith",
  "endsWith",
]);

export function zodTypeForColumn(sqlType: string, inferred: string): string {
  const t = mapTsType(sqlType, inferred);
  if (t === "boolean") return "z.boolean()";
  if (t === "number") return "z.number()";
  if (t === "bigint") return "z.union([z.bigint(), z.string()])";
  // decimal/string/json
  return "z.string()";
}

/** Generate shared filter/sort/search helper source for Express Prisma routes. */
export function renderQueryHelpers(table: TableModel): string {
  const allowCols = table.columns.filter((c) => !c.isExcluded).map((c) => c.name);
  const searchCols = stringSearchColumns(table);
  const writable = writableColumns(table);

  return `
const ALLOW_COLS = ${JSON.stringify(allowCols)} as const;
const SEARCH_COLS = ${JSON.stringify(searchCols)} as const;
const SAFE_OPS = ${JSON.stringify([...SAFE_OPS])} as const;

function sanitizeFilter(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw Object.assign(new Error('filter must be a plain object'), { status: 400 });
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(ALLOW_COLS as readonly string[]).includes(key)) {
      throw Object.assign(new Error('filter field not allowed: ' + key), { status: 400 });
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const ops = Object.keys(value as object);
      if (ops.some((op) => op === 'some' || op === 'every' || op === 'none' || op === 'is' || op === 'isNot')) {
        throw Object.assign(new Error('relation filters are not allowed'), { status: 400 });
      }
      if (ops.some((op) => !(SAFE_OPS as readonly string[]).includes(op))) {
        throw Object.assign(new Error('filter operator not allowed on ' + key), { status: 400 });
      }
      // contains/startsWith/endsWith only on searchable string cols
      if (ops.some((op) => op === 'contains' || op === 'startsWith' || op === 'endsWith') && !(SEARCH_COLS as readonly string[]).includes(key)) {
        throw Object.assign(new Error('text filter not allowed on ' + key), { status: 400 });
      }
      out[key] = value;
    } else {
      out[key] = value;
    }
  }
  if ('AND' in (raw as object) || 'OR' in (raw as object) || 'NOT' in (raw as object)) {
    throw Object.assign(new Error('logical filter trees are not allowed'), { status: 400 });
  }
  return out;
}

const createSchema = z.object({
${writable.map((c) => `  ${JSON.stringify(c.name)}: ${zodTypeForColumn(c.sqlType, c.inferredType)}${c.nullable ? ".optional().nullable()" : ""},`).join("\n")}
}).strict();

const updateSchema = createSchema.partial();
`;
}

export function renderPrismaErrorHandler(): string {
  return `
function mapPrismaError(err: unknown, res: import('express').Response): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: string }).code);
    if (code === 'P2025') { res.status(404).json({ error: 'Not found' }); return true; }
    if (code === 'P2002') { res.status(409).json({ error: 'Conflict' }); return true; }
  }
  return false;
}
`;
}

/** Nest-side sanitizeFilter + allowlists (no Zod; Nest uses class-validator DTOs). */
export function renderNestQueryHelpers(table: TableModel): string {
  const allowCols = table.columns.filter((c) => !c.isExcluded).map((c) => c.name);
  const searchCols = stringSearchColumns(table);
  return `
export const ALLOW_COLS = ${JSON.stringify(allowCols)} as const;
export const SEARCH_COLS = ${JSON.stringify(searchCols)} as const;
export const SAFE_OPS = ${JSON.stringify([...SAFE_OPS])} as const;

export function sanitizeFilter(raw: unknown): Record<string, unknown> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw Object.assign(new Error('filter must be a plain object'), { status: 400 });
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(ALLOW_COLS as readonly string[]).includes(key)) {
      throw Object.assign(new Error('filter field not allowed: ' + key), { status: 400 });
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const ops = Object.keys(value as object);
      if (ops.some((op) => op === 'some' || op === 'every' || op === 'none' || op === 'is' || op === 'isNot')) {
        throw Object.assign(new Error('relation filters are not allowed'), { status: 400 });
      }
      if (ops.some((op) => !(SAFE_OPS as readonly string[]).includes(op))) {
        throw Object.assign(new Error('filter operator not allowed on ' + key), { status: 400 });
      }
      if (ops.some((op) => op === 'contains' || op === 'startsWith' || op === 'endsWith') && !(SEARCH_COLS as readonly string[]).includes(key)) {
        throw Object.assign(new Error('text filter not allowed on ' + key), { status: 400 });
      }
      out[key] = value;
    } else {
      out[key] = value;
    }
  }
  if ('AND' in (raw as object) || 'OR' in (raw as object) || 'NOT' in (raw as object)) {
    throw Object.assign(new Error('logical filter trees are not allowed'), { status: 400 });
  }
  return out;
}

export function asQueryString(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw Object.assign(new Error(name + ' must be a string'), { status: 400 });
  }
  return value;
}
`;
}

export { writableColumns, stringSearchColumns, jsString, SAFE_OPS };
