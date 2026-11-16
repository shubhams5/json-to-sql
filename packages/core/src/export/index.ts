import { mapTsType, propKey, safeFileSegment } from "../codegen/safe.js";
import { generateCrud } from "../crud/generate.js";
import { generateCreateSchema, generateFullSqlBundle, planRelationalInserts } from "../sql/generate.js";
import type { CrudTarget, ExportArtifact, JsonObject, SchemaModel, TableModel } from "../types.js";

export function exportTypeScriptInterfaces(schema: SchemaModel): ExportArtifact {
  const blocks = schema.tables.map((table) => {
    const fields = table.columns
      .filter((c) => !c.isExcluded)
      .map((c) => {
        const optional = c.nullable ? "?" : "";
        const t = mapTsType(c.sqlType, c.inferredType);
        return `  ${propKey(c.name)}${optional}: ${t};`;
      })
      .join("\n");
    const name = table.name
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("");
    return `export interface ${name} {\n${fields}\n}`;
  });
  return {
    path: "types.ts",
    language: "typescript",
    content: blocks.join("\n\n") + "\n",
  };
}

export function exportJsonSchema(schema: SchemaModel): ExportArtifact {
  const definitions: Record<string, unknown> = {};
  for (const table of schema.tables) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const col of table.columns.filter((c) => !c.isExcluded)) {
      const base = { type: jsonSchemaType(col.inferredType) };
      properties[col.name] = col.nullable ? { anyOf: [base, { type: "null" }] } : base;
      if (!col.nullable && !col.autoIncrement) required.push(col.name);
    }
    definitions[table.name] = {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    };
  }
  return {
    path: "schema.json",
    language: "json",
    content: JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        title: schema.rootTableName,
        definitions,
      },
      null,
      2
    ),
  };
}

function csvEscape(value: string, isHeader = false): string {
  let raw = value;
  if (!isHeader && /^[=+\-@]/.test(raw)) {
    raw = `'${raw}`;
  }
  if (/[",\n\r]/.test(raw) || isHeader) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function exportCsv(table: TableModel, rows: JsonObject[]): ExportArtifact {
  const cols = table.columns.filter((c) => !c.isExcluded).map((c) => c.name);
  const header = cols.map((c) => csvEscape(c, true)).join(",");
  const lines = rows.map((row) =>
    cols
      .map((col) => {
        const value = row[col];
        if (value === null || value === undefined) return "";
        const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
        return csvEscape(raw);
      })
      .join(",")
  );
  return {
    path: `${safeFileSegment(table.name)}.csv`,
    language: "csv",
    content: [header, ...lines].join("\n") + "\n",
  };
}

export function exportSql(schema: SchemaModel, rows: JsonObject[] = []): ExportArtifact {
  return {
    path: `${safeFileSegment(schema.rootTableName)}.sql`,
    language: "sql",
    content: rows.length ? generateFullSqlBundle(schema, rows) : generateCreateSchema(schema) + "\n",
  };
}

export function buildExportBundle(
  schema: SchemaModel,
  rows: JsonObject[],
  crudTarget?: CrudTarget
): ExportArtifact[] {
  const artifacts: ExportArtifact[] = [
    exportSql(schema, rows),
    exportTypeScriptInterfaces(schema),
    exportJsonSchema(schema),
  ];

  // CSV for every table using planned relational rows when available
  if (rows.length) {
    const planned = planRelationalInserts(schema, rows);
    for (const table of schema.tables) {
      const tableRows = planned.get(table.name) ?? [];
      if (tableRows.length) artifacts.push(exportCsv(table, tableRows));
    }
  } else {
    const root = schema.tables.find((t) => t.name === schema.rootTableName) ?? schema.tables[0];
    if (root) artifacts.push(exportCsv(root, rows));
  }

  if (crudTarget) {
    artifacts.push(
      ...generateCrud(schema, crudTarget).map((a) => ({
        ...a,
        path: `crud/${a.path}`,
      }))
    );
  }

  return artifacts;
}

function jsonSchemaType(inferred: string): string | string[] {
  switch (inferred) {
    case "integer":
      return "integer";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    case "array":
      return "array";
    case "object":
    case "json":
      return "object";
    default:
      return "string";
  }
}
