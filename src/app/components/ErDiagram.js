"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, MarkerType, Handle, Position } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

function TableNode({ data }) {
  return (
    <div className="min-w-[180px] rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 shadow-lg">
      <Handle type="target" position={Position.Left} className="!bg-zinc-400" />
      <div className="rounded-t-md border-b border-zinc-700 bg-zinc-800 px-3 py-2 font-semibold">{data.label}</div>
      <ul className="space-y-1 px-3 py-2 font-mono text-xs">
        {data.columns.map((col) => (
          <li
            key={col.name}
            className={col.isPrimaryKey ? "text-amber-300" : col.isFk ? "text-sky-300" : "text-zinc-300"}
          >
            {col.isPrimaryKey ? "PK " : col.isFk ? "FK " : ""}
            {col.name}: {col.sqlType}
          </li>
        ))}
      </ul>
      <Handle type="source" position={Position.Right} className="!bg-zinc-400" />
    </div>
  );
}

const nodeTypes = { table: TableNode };

export default function ErDiagram({ schema, themeDark = true }) {
  const initial = useMemo(() => {
    if (!schema?.tables?.length) return { nodes: [], edges: [] };
    const fkCols = new Set();
    for (const table of schema.tables) {
      for (const fk of table.foreignKeys) {
        for (const c of fk.columns) fkCols.add(`${table.name}.${c}`);
      }
    }
    const nodes = schema.tables.map((table, index) => ({
      id: table.name,
      type: "table",
      position: { x: (index % 3) * 280, y: Math.floor(index / 3) * 220 },
      data: {
        label: table.name,
        columns: table.columns
          .filter((c) => !c.isExcluded)
          .map((c) => ({
            ...c,
            isFk: fkCols.has(`${table.name}.${c.name}`),
          })),
      },
    }));

    const edges = schema.tables.flatMap((table) =>
      table.foreignKeys.map((fk, i) => ({
        id: `${fk.id}-${i}`,
        source: table.name,
        target: fk.refTable,
        label: fk.columns.join(","),
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#a1a1aa" },
      }))
    );

    return { nodes, edges };
  }, [schema]);

  const [nodes, setNodes] = useState(initial.nodes);
  const [edges, setEdges] = useState(initial.edges);

  useEffect(() => {
    setNodes(initial.nodes);
    setEdges(initial.edges);
  }, [initial]);

  const onNodesChange = useCallback((changes) => {
    setNodes((current) => {
      let next = current;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          next = next.map((n) => (n.id === change.id ? { ...n, position: change.position } : n));
        }
      }
      return next;
    });
  }, []);

  if (!schema?.tables?.length) {
    return <p className="text-sm text-zinc-400">No schema to visualize.</p>;
  }

  const dark = themeDark !== false;

  return (
    <div className={`er-diagram h-[420px] rounded-lg border ${dark ? "border-zinc-700 bg-zinc-950" : "border-zinc-300 bg-white"}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        colorMode={dark ? "dark" : "light"}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color={dark ? "#3f3f46" : "#d4d4d8"} />
        <MiniMap
          pannable
          zoomable
          maskColor={dark ? "rgba(9, 9, 11, 0.7)" : "rgba(255,255,255,0.7)"}
          nodeColor={dark ? "#3f3f46" : "#e4e4e7"}
          nodeStrokeColor="#71717a"
          className="!border !border-zinc-700 !bg-zinc-900"
        />
        <Controls className="!border !border-zinc-700 !bg-zinc-900 !shadow-none [&>button]:!border-zinc-700 [&>button]:!bg-zinc-900 [&>button]:!fill-zinc-200 [&>button:hover]:!bg-zinc-800" />
      </ReactFlow>
    </div>
  );
}
