"use client";

import { useMemo } from "react";
import { ReactFlow, Background, Controls, MiniMap, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

function TableNode({ data }) {
  return (
    <div className="rounded-md border border-zinc-600 bg-zinc-900 text-zinc-100 min-w-[180px] shadow-lg">
      <div className="px-3 py-2 font-semibold bg-zinc-800 rounded-t-md border-b border-zinc-700">{data.label}</div>
      <ul className="px-3 py-2 text-xs font-mono space-y-1">
        {data.columns.map((col) => (
          <li key={col.name} className={col.isPrimaryKey ? "text-amber-300" : "text-zinc-300"}>
            {col.isPrimaryKey ? "PK " : ""}
            {col.name}: {col.sqlType}
          </li>
        ))}
      </ul>
    </div>
  );
}

const nodeTypes = { table: TableNode };

export default function ErDiagram({ schema }) {
  const { nodes, edges } = useMemo(() => {
    if (!schema?.tables?.length) return { nodes: [], edges: [] };
    const nodes = schema.tables.map((table, index) => ({
      id: table.name,
      type: "table",
      position: { x: (index % 3) * 280, y: Math.floor(index / 3) * 220 },
      data: {
        label: table.name,
        columns: table.columns.filter((c) => !c.isExcluded),
      },
    }));

    const edges = schema.tables.flatMap((table) =>
      table.foreignKeys.map((fk) => ({
        id: fk.id,
        source: table.name,
        target: fk.refTable,
        label: fk.columns.join(","),
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#a1a1aa" },
      }))
    );

    return { nodes, edges };
  }, [schema]);

  if (!schema?.tables?.length) {
    return <p className="text-sm text-zinc-400">No schema to visualize.</p>;
  }

  return (
    <div className="er-diagram h-[420px] rounded-lg border border-zinc-700 bg-zinc-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} color="#3f3f46" />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(9, 9, 11, 0.7)"
          nodeColor="#3f3f46"
          nodeStrokeColor="#71717a"
          className="!bg-zinc-900 !border !border-zinc-700"
        />
        <Controls className="!bg-zinc-900 !border !border-zinc-700 !shadow-none [&>button]:!bg-zinc-900 [&>button]:!border-zinc-700 [&>button]:!fill-zinc-200 [&>button:hover]:!bg-zinc-800" />
      </ReactFlow>
    </div>
  );
}
