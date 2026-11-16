import type { SchemaModel, TableModel } from "../types.js";

/** Route generators only support single-column PKs today. */
export function assertSinglePrimaryKey(table: TableModel, target: string): void {
  if (table.primaryKey.length !== 1) {
    throw new Error(
      `${target}: table "${table.name}" has composite/missing primary key [${table.primaryKey.join(", ")}]. Single-column PK required for generated HTTP routes.`
    );
  }
}

export function assertSchemaSinglePrimaryKeys(schema: SchemaModel, target: string): void {
  for (const table of schema.tables) {
    assertSinglePrimaryKey(table, target);
  }
}
