"use client";

import {
  buildExportBundle,
  generateCrud,
  generateCreateSchema,
  generateDml,
  generateFullSqlBundle,
  getColumns,
  inferSchema,
  listDialects,
  parseJsonInput,
} from "@json-to-sql/core";
import JSZip from "jszip";
import React, { useEffect, useMemo, useState } from "react";
import AlertBanner from "./components/AlertBanner";
import CodeEditor from "./components/CodeEditor";
import ErDiagram from "./components/ErDiagram";
import SchemaDesigner from "./components/SchemaDesigner";

const defaultJson = [
  {
    id: 78,
    tenantId: 8,
    questionMasterId: 1,
    answers: '[{"label":"Values","value":90}]',
  },
  {
    id: 79,
    tenantId: 8,
    questionMasterId: 2,
    answers: '[{"label":"Values","value":10}]',
  },
];

const TABS = [
  { id: "json", label: "JSON" },
  { id: "schema", label: "Schema" },
  { id: "er", label: "ER Diagram" },
  { id: "sql", label: "SQL" },
  { id: "crud", label: "CRUD" },
  { id: "export", label: "Export" },
];

const dbTypes = listDialects();

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function JsonToSqlConverter() {
  const [jsonText, setJsonText] = useState(JSON.stringify(defaultJson, null, 2));
  const [rows, setRows] = useState(defaultJson);
  const [parseErrors, setParseErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [tableName, setTableName] = useState("records");
  const [primaryKey, setPrimaryKey] = useState("id");
  const [columns, setColumns] = useState(getColumns(defaultJson));
  const [sql, setSql] = useState("");
  const [operation, setOperation] = useState("INSERT");
  const [batchInsert, setBatchInsert] = useState(true);
  const [dbType, setDbType] = useState("postgres");
  const [wrap, setWrap] = useState(true);
  const [conditionColumns, setConditionColumns] = useState([{ column: "" }]);
  const [schema, setSchema] = useState(null);
  const [tab, setTab] = useState("json");
  const [themeDark, setThemeDark] = useState(true);
  const [nestedStrategy, setNestedStrategy] = useState("child_tables");
  const [crudTargetKey, setCrudTargetKey] = useState("express-prisma");
  const [crudPreview, setCrudPreview] = useState("");
  const [exportPreview, setExportPreview] = useState("");
  const [selectedExportPath, setSelectedExportPath] = useState("");
  const [schemaDirty, setSchemaDirty] = useState(false);

  useEffect(() => {
    const sync = () => setThemeDark(document.documentElement.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (schemaDirty) return;
    try {
      const next = inferSchema(rows, {
        dialect: dbType,
        rootTableName: tableName,
        nestedStrategy,
        primaryKeyHint: primaryKey || undefined,
      });
      setSchema(next);
      setParseErrors([]);
    } catch (err) {
      setParseErrors([err instanceof Error ? err.message : String(err)]);
    }
  }, [rows, dbType, tableName, nestedStrategy, primaryKey, schemaDirty]);

  const crudTarget = useMemo(() => {
    const map = {
      "express-prisma": { runtime: "nodejs", framework: "express", language: "typescript", orm: "prisma" },
      "express-typeorm": { runtime: "nodejs", framework: "express", language: "typescript", orm: "typeorm" },
      "nestjs-prisma": { runtime: "nodejs", framework: "nestjs", language: "typescript", orm: "prisma" },
      "nestjs-typeorm": { runtime: "nodejs", framework: "nestjs", language: "typescript", orm: "typeorm" },
      "express-ts-experimental": { runtime: "nodejs", framework: "express", language: "typescript", orm: "none" },
      "nestjs-experimental": { runtime: "nodejs", framework: "nestjs", language: "typescript", orm: "none" },
    };
    return map[crudTargetKey] ?? map["express-prisma"];
  }, [crudTargetKey]);

  const artifacts = useMemo(() => {
    if (!schema) return [];
    return buildExportBundle(schema, rows, crudTarget);
  }, [schema, rows, crudTarget]);

  useEffect(() => {
    if (!artifacts.length) {
      setExportPreview("");
      setSelectedExportPath("");
      return;
    }
    const selected = artifacts.find((a) => a.path === selectedExportPath) ?? artifacts[0];
    setSelectedExportPath(selected.path);
    setExportPreview(selected.content);
  }, [artifacts, selectedExportPath]);

  const flashSuccess = (message) => {
    setActionError("");
    setSuccess(message);
  };

  const flashError = (message) => {
    setSuccess("");
    setActionError(message);
  };

  const handleJsonChange = (value) => {
    setJsonText(value);
    try {
      const parsed = parseJsonInput(value);
      setSchemaDirty(false);
      setRows(parsed.rows);
      setColumns(getColumns(parsed.rows));
      setWarnings(parsed.warnings);
      setParseErrors([]);
      if (parsed.rows[0] && primaryKey && !(primaryKey in parsed.rows[0]) && "id" in parsed.rows[0]) {
        setPrimaryKey("id");
      }
    } catch (err) {
      setParseErrors([err instanceof Error ? err.message : String(err)]);
    }
  };

  const handleDeleteColumn = (col) => {
    const newJson = rows.map((row) => {
      const { [col]: _, ...rest } = row;
      return rest;
    });
    setRows(newJson);
    setColumns(getColumns(newJson));
    setJsonText(JSON.stringify(newJson, null, 2));
    if (primaryKey === col) setPrimaryKey("");
    flashSuccess(`Removed column "${col}"`);
  };

  const handleGenerateSql = () => {
    if (!rows.length && operation !== "CREATE") {
      flashError("Add JSON rows before generating DML.");
      return;
    }
    if ((operation === "UPDATE" || operation === "DELETE") && !primaryKey) {
      flashError("Choose a primary key for UPDATE or DELETE.");
      return;
    }
    if (operation === "CREATE" || operation === "FULL") {
      if (!schema) {
        flashError("Schema is not ready yet.");
        return;
      }
      setSql(operation === "CREATE" ? generateCreateSchema(schema) : generateFullSqlBundle(schema, rows));
      flashSuccess(operation === "CREATE" ? "CREATE schema generated." : "Full SQL bundle generated.");
      return;
    }
    const next = generateDml({
      data: rows,
      tableName: schema?.rootTableName || tableName,
      primaryKey,
      operation,
      batchInsert,
      dbType,
      conditionColumns: conditionColumns.map((c) => c.column).filter(Boolean),
    });
    if (!next) {
      flashError("Could not generate SQL for the current inputs.");
      return;
    }
    setSql(next);
    flashSuccess(`${operation} SQL generated.`);
  };

  const handleGenerateCrud = () => {
    if (!schema) {
      flashError("Schema is not ready yet.");
      return;
    }
    const files = generateCrud(schema, crudTarget);
    setCrudPreview(files.map((f) => `// ===== ${f.path} =====\n${f.content}`).join("\n\n"));
    flashSuccess(`CRUD package generated (${files.length} files)${crudTarget.orm === "none" ? " [experimental]" : ""}.`);
  };

  const handleCopy = async (text, label) => {
    if (!text) {
      flashError(`Nothing to copy yet. Generate ${label} first.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flashSuccess(`${label} copied to clipboard.`);
    } catch {
      flashError("Clipboard permission denied.");
    }
  };

  const handleDownloadZip = async () => {
    if (!artifacts.length) {
      flashError("No export artifacts available.");
      return;
    }
    const zip = new JSZip();
    for (const artifact of artifacts) {
      zip.file(artifact.path, artifact.content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(`${tableName || "export"}-bundle.zip`, blob);
    flashSuccess("ZIP bundle downloaded.");
  };

  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      handleJsonChange(text);
      setTab("json");
      flashSuccess(`Imported ${file.name}`);
    } catch {
      flashError("Could not read that file.");
    } finally {
      event.target.value = "";
    }
  };

  const panelClass = "rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-none";
  const labelClass = "mb-1 block text-sm text-zinc-600 dark:text-zinc-300";
  const controlClass =
    "w-full max-w-full rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

  return (
    <div className="w-full min-w-0 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">Workspace</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">Import JSON, tune the schema, then generate SQL or CRUD — all on your machine.</p>
      </div>

      <div className="mb-4 md:hidden">
        <label htmlFor="workspace-tab" className={labelClass}>
          Workspace section
        </label>
        <select id="workspace-tab" className={controlClass} value={tab} onChange={(e) => setTab(e.target.value)}>
          {TABS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <nav className="mb-5 hidden flex-wrap gap-2 md:flex" aria-label="Workspace">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${tab === item.id ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800 dark:hover:bg-zinc-800"}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mb-4 space-y-2">
        <AlertBanner type="success" message={success} onDismiss={() => setSuccess("")} />
        <AlertBanner type="error" message={actionError} onDismiss={() => setActionError("")} />
        {parseErrors.map((err) => (
          <AlertBanner key={err} type="error" message={err} />
        ))}
        {warnings.map((warn) => (
          <AlertBanner key={warn} type="warning" message={warn} />
        ))}
      </div>

      {tab === "json" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={`min-w-0 lg:col-span-2 ${panelClass}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">JSON input</h2>
              <label className="cursor-pointer rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700">
                Import file
                <input type="file" accept=".json,application/json" className="hidden" onChange={handleFileImport} />
              </label>
            </div>
            <div className="min-w-0 overflow-hidden rounded-lg">
              <CodeEditor value={jsonText} onChange={handleJsonChange} language="json" height="300px" dark={themeDark} />
            </div>
            <div className="mt-4 max-h-56 w-full min-w-0 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col} className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                        <div className="flex items-center gap-2">
                          <span>{col}</span>
                          <button type="button" className="text-xs text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300" onClick={() => handleDeleteColumn(col)} aria-label={`Remove column ${col}`}>
                            Remove
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="even:bg-zinc-50 dark:even:bg-zinc-900/40">
                      {columns.map((col) => (
                        <td key={col} className="max-w-[14rem] truncate border-b border-zinc-100 px-3 py-1.5 font-mono text-xs text-zinc-700 dark:border-zinc-900 dark:text-zinc-300" title={String(row[col])}>
                          {String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className={`min-w-0 ${panelClass}`}>
            <h2 className="mb-3 font-semibold text-zinc-900 dark:text-zinc-100">Settings</h2>
            <div className="space-y-3">
              <div>
                <label className={labelClass} htmlFor="db-type">
                  Database
                </label>
                <select id="db-type" className={controlClass} value={dbType} onChange={(e) => setDbType(e.target.value)}>
                  {dbTypes.map((db) => (
                    <option key={db.value} value={db.value}>
                      {db.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="root-table">
                  Root table
                </label>
                <input id="root-table" className={controlClass} value={tableName} onChange={(e) => setTableName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pk-hint">
                  Primary key hint
                </label>
                <select id="pk-hint" className={controlClass} value={primaryKey} onChange={(e) => setPrimaryKey(e.target.value)}>
                  <option value="">Detect automatically</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="nested-strategy">
                  Nested strategy
                </label>
                <select id="nested-strategy" className={controlClass} value={nestedStrategy} onChange={(e) => setNestedStrategy(e.target.value)}>
                  <option value="child_tables">Child tables</option>
                  <option value="json_column">JSON columns</option>
                </select>
              </div>
            </div>
          </aside>
        </div>
      )}

      {tab === "schema" && (
        <div className={`min-w-0 ${panelClass}`}>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-800"
              onClick={() => {
                setSchemaDirty(false);
                try {
                  const next = inferSchema(rows, {
                    dialect: dbType,
                    rootTableName: tableName,
                    nestedStrategy,
                    primaryKeyHint: primaryKey || undefined,
                  });
                  setSchema(next);
                  flashSuccess("Schema re-inferred from JSON.");
                } catch (err) {
                  flashError(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Re-infer from JSON
            </button>
            {schemaDirty && <span className="text-xs text-amber-600 dark:text-amber-400">Manual edits protected until re-infer</span>}
          </div>
          <SchemaDesigner
            schema={schema}
            onChange={(next) => {
              setSchemaDirty(true);
              setSchema(next);
              if (next?.rootTableName) setTableName(next.rootTableName);
            }}
          />
        </div>
      )}

      {tab === "er" && (
        <div className={`min-w-0 ${panelClass}`}>
          <ErDiagram schema={schema} themeDark={themeDark} />
        </div>
      )}

      {tab === "sql" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={`min-w-0 ${panelClass}`}>
            <label className="mb-3 flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-100">
              <input type="checkbox" checked={batchInsert} onChange={() => setBatchInsert(!batchInsert)} disabled={!["INSERT", "DELETE"].includes(operation)} />
              Batch mode
            </label>
            <div className="mb-3">
              <label className={labelClass} htmlFor="sql-op">
                Operation
              </label>
              <select id="sql-op" className={controlClass} value={operation} onChange={(e) => setOperation(e.target.value)}>
                <option value="INSERT">INSERT</option>
                <option value="UPDATE">UPDATE</option>
                <option value="DELETE">DELETE</option>
                <option value="CREATE">CREATE SCHEMA</option>
                <option value="FULL">FULL BUNDLE</option>
              </select>
            </div>
            {(operation === "UPDATE" || operation === "DELETE") && (
              <div className="mb-3 space-y-3">
                <div>
                  <label className={labelClass} htmlFor="sql-pk">
                    Primary key
                  </label>
                  <select id="sql-pk" className={controlClass} value={primaryKey} onChange={(e) => setPrimaryKey(e.target.value)}>
                    <option value="">Select column</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-300">Extra WHERE columns</p>
                  {conditionColumns.map((cond, idx) => (
                    <div key={idx} className="mt-2 flex min-w-0 items-center gap-2">
                      <select
                        className={controlClass}
                        value={cond.column}
                        onChange={(e) => {
                          const updated = [...conditionColumns];
                          updated[idx] = { column: e.target.value };
                          setConditionColumns(updated);
                        }}
                      >
                        <option value="">Select column</option>
                        {columns
                          .filter((col) => col !== primaryKey && !conditionColumns.some((c, i) => c.column === col && i !== idx))
                          .map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                      </select>
                      <button type="button" className="shrink-0 rounded-md bg-red-700 px-2 py-2 text-xs text-white hover:bg-red-600" onClick={() => setConditionColumns(conditionColumns.filter((_, i) => i !== idx))}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <button type="button" className="mt-2 rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700" onClick={() => setConditionColumns([...conditionColumns, { column: "" }])}>
                    Add condition
                  </button>
                </div>
              </div>
            )}
            <button type="button" className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500" onClick={handleGenerateSql}>
              Generate SQL
            </button>
          </div>

          <div className={`min-w-0 lg:col-span-2 ${panelClass}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">SQL output</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700" onClick={() => handleCopy(sql, "SQL")}>
                  Copy
                </button>
                <button type="button" className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700" onClick={() => setWrap((w) => !w)}>
                  {wrap ? "No wrap" : "Wrap"}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  disabled={!sql}
                  onClick={() => {
                    downloadBlob(`${tableName}.sql`, new Blob([sql], { type: "text/sql" }));
                    flashSuccess("SQL file downloaded.");
                  }}
                >
                  Download
                </button>
              </div>
            </div>
            <div className={`min-w-0 overflow-hidden rounded-lg ${wrap ? "" : "overflow-x-auto"}`}>
              <CodeEditor value={sql || "Generate SQL to preview output here."} language="sql" readOnly height="380px" dark={themeDark} onChange={() => {}} />
            </div>
          </div>
        </div>
      )}

      {tab === "crud" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={`min-w-0 ${panelClass}`}>
            <div className="mb-3">
              <label className={labelClass} htmlFor="crud-fw">
                Target
              </label>
              <select id="crud-fw" className={controlClass} value={crudTargetKey} onChange={(e) => setCrudTargetKey(e.target.value)}>
                <option value="express-prisma">Express + Prisma</option>
                <option value="express-typeorm">Express + TypeORM</option>
                <option value="nestjs-prisma">NestJS + Prisma</option>
                <option value="nestjs-typeorm">NestJS + TypeORM</option>
                <option value="express-ts-experimental">Express TS (experimental scaffold)</option>
                <option value="nestjs-experimental">NestJS in-memory (experimental)</option>
              </select>
            </div>
            <button type="button" className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500" onClick={handleGenerateCrud}>
              Generate CRUD
            </button>
          </div>
          <div className={`min-w-0 lg:col-span-2 ${panelClass}`}>
            <div className="mb-3 flex justify-end">
              <button type="button" className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700" onClick={() => handleCopy(crudPreview, "CRUD code")}>
                Copy
              </button>
            </div>
            <div className="min-w-0 overflow-hidden rounded-lg">
              <CodeEditor
                value={crudPreview || "Generate CRUD to preview project files."}
                language="typescript"
                readOnly
                height="420px"
                dark={themeDark}
                onChange={() => {}}
              />
            </div>
          </div>
        </div>
      )}

      {tab === "export" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className={`min-w-0 ${panelClass}`}>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">Preview each artifact, then download the ZIP bundle.</p>
            <label className={labelClass} htmlFor="export-file">
              Artifact
            </label>
            <select id="export-file" className={controlClass} value={selectedExportPath} onChange={(e) => setSelectedExportPath(e.target.value)}>
              {artifacts.map((a) => (
                <option key={a.path} value={a.path}>
                  {a.path}
                </option>
              ))}
            </select>
            <button type="button" className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500" onClick={handleDownloadZip}>
              Download ZIP
            </button>
          </div>
          <div className={`min-w-0 lg:col-span-2 ${panelClass}`}>
            <div className="min-w-0 overflow-hidden rounded-lg">
              <CodeEditor value={exportPreview || "Export preview appears after schema inference."} language="javascript" readOnly height="420px" dark={themeDark} onChange={() => {}} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
