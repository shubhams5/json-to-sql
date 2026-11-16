"use client";

import ErrorBoundary from "./components/ErrorBoundary";
import JsonToSqlConverter from "./JsonToSqlConverter";

export default function Home() {
  return (
    <ErrorBoundary>
      <JsonToSqlConverter />
    </ErrorBoundary>
  );
}
