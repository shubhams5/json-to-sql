"use client";

import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded border border-red-700 bg-red-950 text-red-100 p-4 m-4">
          <h2 className="font-semibold mb-2">Something went wrong</h2>
          <pre className="text-xs whitespace-pre-wrap">{String(this.state.error?.message || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
