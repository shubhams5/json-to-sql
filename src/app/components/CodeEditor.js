"use client";

import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

const langMap = {
  json: json(),
  sql: sql(),
  javascript: javascript(),
  typescript: javascript({ typescript: true }),
};

export default function CodeEditor({ value, onChange, language = "json", readOnly = false, height = "260px", dark = true }) {
  const extensions = [langMap[language] || json()].filter(Boolean);
  return (
    <CodeMirror
      value={value}
      height={height}
      theme={dark ? oneDark : undefined}
      extensions={extensions}
      editable={!readOnly}
      onChange={onChange}
      basicSetup={{ lineNumbers: true, foldGutter: true }}
      className="rounded border border-zinc-700 overflow-hidden text-sm"
    />
  );
}
