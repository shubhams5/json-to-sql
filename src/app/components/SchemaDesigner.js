"use client";

export default function SchemaDesigner({ schema, onChange }) {
  if (!schema) {
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Import valid JSON to infer a schema.</p>;
  }

  const updateTableName = (oldName, newName) => {
    const next = {
      ...schema,
      rootTableName: schema.rootTableName === oldName ? newName : schema.rootTableName,
      tables: schema.tables.map((table) => {
        if (table.name !== oldName) {
          return {
            ...table,
            foreignKeys: table.foreignKeys.map((fk) => ({
              ...fk,
              refTable: fk.refTable === oldName ? newName : fk.refTable,
            })),
          };
        }
        return { ...table, name: newName };
      }),
    };
    onChange(next);
  };

  const updateColumn = (tableName, columnName, patch) => {
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

  return (
    <div className="flex max-h-[520px] min-w-0 flex-col gap-4 overflow-y-auto">
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

      {schema.tables.map((table) => (
        <div key={table.name} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/60">
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
                {table.columns.map((col) => (
                  <tr key={col.name} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-2">
                      <input type="checkbox" checked={!col.isExcluded} onChange={(e) => updateColumn(table.name, col.name, { isExcluded: !e.target.checked })} />
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
                        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                        value={col.sqlType}
                        onChange={(e) => updateColumn(table.name, col.name, { sqlType: e.target.value })}
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="checkbox" checked={col.isPrimaryKey} onChange={(e) => updateColumn(table.name, col.name, { isPrimaryKey: e.target.checked, nullable: e.target.checked ? false : col.nullable })} />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="checkbox" checked={col.nullable} disabled={col.isPrimaryKey} onChange={(e) => updateColumn(table.name, col.name, { nullable: e.target.checked })} />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="checkbox" checked={col.isUnique} onChange={(e) => updateColumn(table.name, col.name, { isUnique: e.target.checked })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {table.foreignKeys.length > 0 && (
            <div className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
              FKs:{" "}
              {table.foreignKeys.map((fk) => (
                <span key={fk.id} className="mr-2 inline-block rounded bg-zinc-200 px-2 py-1 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  {fk.columns.join(",")} → {fk.refTable}({fk.refColumns.join(",")})
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
