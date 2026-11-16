"use client";

import { renameColumn, renameTable, validateSchema } from "@json-to-sql/core";

const SQL_TYPES = {
  postgres: ["INTEGER", "BIGINT", "DOUBLE PRECISION", "BOOLEAN", "TEXT", "JSONB", "UUID", "TIMESTAMP"],
  mysql: ["INT", "BIGINT", "DOUBLE", "TINYINT(1)", "VARCHAR(255)", "TEXT", "JSON", "DATETIME"],
  mssql: ["INT", "BIGINT", "FLOAT", "BIT", "NVARCHAR(255)", "NVARCHAR(MAX)", "DATETIME2"],
  sqlite: ["INTEGER", "REAL", "TEXT", "BLOB"],
};

export default function SchemaDesigner({ schema, onChange }) {
  if (!schema) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Import valid JSON to infer a schema.</p>;
  }

  const issues = validateSchema(schema);
  const typeOptions = SQL_TYPES[schema.dialect] ?? SQL_TYPES.postgres;

  const updateTableName = (oldName, draft) => {
    try {
      onChange(renameTable(schema, oldName, draft));
    } catch (err) {
      // Keep typing draft locally only when invalid — fall back to raw update with slug on blur not available; show via issues
      console.warn(err instanceof Error ? err.message : err);
    }
  };

  const updateColumn = (tableName, columnName, patch) => {
    if (Object.prototype.hasOwnProperty.call(patch, "name") && patch.name !== columnName) {
      try {
        let next = renameColumn(schema, tableName, columnName, patch.name);
        const rest = { ...patch };
        delete rest.name;
        if (Object.keys(rest).length) {
          next = {
            ...next,
            tables: next.tables.map((table) => {
              if (table.name !== tableName) return table;
              const columns = table.columns.map((col) =>
                col.name === patch.name || col.name === columnName ? { ...col, ...rest } : col
              );
              return {
                ...table,
                columns,
                primaryKey: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
              };
            }),
          };
        }
        onChange(next);
      } catch (err) {
        console.warn(err instanceof Error ? err.message : err);
      }
      return;
    }

    const next = {
      ...schema,
      tables: schema.tables.map((table) => {
        if (table.name !== tableName) return table;
        const columns = table.columns.map((col) => (col.name === columnName ? { ...col, ...patch } : col));
        return {
          ...table,
          columns,
          primaryKey: columns.filter((c) => c.isPrimaryKey).map((c) => c.name),
        };
      }),
    };
    onChange(next);
  };

  const updateFk = (tableName, fkId, patch) => {
    onChange({
      ...schema,
      tables: schema.tables.map((table) => {
        if (table.name !== tableName) return table;
        return {
          ...table,
          foreignKeys: table.foreignKeys.map((fk) => (fk.id === fkId ? { ...fk, ...patch } : fk)),
        };
      }),
    });
  };

  return (
    <div className="flex max-h-[520px] min-w-0 flex-col gap-4 overflow-y-auto">
      {issues.length > 0 && (
        <ul className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          {issues.map((issue, i) => (
            <li key={i}>
              [{issue.level}] {issue.table ? `${issue.table}: ` : ""}
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-zinc-600 dark:text-zinc-300">Nested strategy</label>
        <select
          className="rounded border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100"
          value={schema.nestedStrategy}
          onChange={(e) => onChange({ ...schema, nestedStrategy: e.target.value })}
        >
          <option value="child_tables">Child tables</option>
          <option value="json_column">JSON columns</option>
        </select>
      </div>

      {schema.tables.map((table, tableIndex) => (
        <div
          key={table.sourcePath + "-" + tableIndex}
          className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Table</span>
            <input
              className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              value={table.name}
              onChange={(e) => updateTableName(table.name, e.target.value)}
            />
            <span className="text-xs text-zinc-500">{table.sourcePath}</span>
          </div>

          <div className="min-w-0 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                  <th className="py-1 pr-2">Include</th>
                  <th className="py-1 pr-2">Column</th>
                  <th className="py-1 pr-2">SQL type</th>
                  <th className="py-1 pr-2">PK</th>
                  <th className="py-1 pr-2">Nullable</th>
                  <th className="py-1 pr-2">Unique</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((col, colIndex) => (
                  <tr key={col.originalName + "-" + colIndex} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-2">
                      <input
                        type="checkbox"
                        checked={!col.isExcluded}
                        onChange={(e) => updateColumn(table.name, col.name, { isExcluded: !e.target.checked })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        value={col.name}
                        onChange={(e) => updateColumn(table.name, col.name, { name: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        list={`sql-types-${schema.dialect}`}
                        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        value={col.sqlType}
                        onChange={(e) => updateColumn(table.name, col.name, { sqlType: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="checkbox"
                        checked={col.isPrimaryKey}
                        onChange={(e) =>
                          updateColumn(table.name, col.name, {
                            isPrimaryKey: e.target.checked,
                            nullable: e.target.checked ? false : col.nullable,
                          })
                        }
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="checkbox"
                        checked={col.nullable}
                        disabled={col.isPrimaryKey}
                        onChange={(e) => updateColumn(table.name, col.name, { nullable: e.target.checked })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input
                        type="checkbox"
                        checked={col.isUnique}
                        onChange={(e) => updateColumn(table.name, col.name, { isUnique: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <datalist id={`sql-types-${schema.dialect}`}>
            {typeOptions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>

          {table.foreignKeys.length > 0 && (
            <div className="mt-3 space-y-2 text-xs text-zinc-600 dark:text-zinc-400">
              <p className="font-semibold text-zinc-700 dark:text-zinc-300">Foreign keys</p>
              {table.foreignKeys.map((fk) => (
                <div key={fk.id} className="flex flex-wrap items-center gap-2 rounded bg-zinc-200 px-2 py-1 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  <span>
                    {fk.columns.join(",")} → {fk.refTable}({fk.refColumns.join(",")})
                  </span>
                  <label>
                    ON DELETE
                    <select
                      className="ml-1 rounded border border-zinc-400 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      value={fk.onDelete}
                      onChange={(e) => updateFk(table.name, fk.id, { onDelete: e.target.value })}
                    >
                      {["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    ON UPDATE
                    <select
                      className="ml-1 rounded border border-zinc-400 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                      value={fk.onUpdate}
                      onChange={(e) => updateFk(table.name, fk.id, { onUpdate: e.target.value })}
                    >
                      {["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
