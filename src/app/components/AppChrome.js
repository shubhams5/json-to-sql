"use client";

import { useEffect, useState } from "react";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

export default function AppChrome({ children }) {
  const [themeDark, setThemeDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeDark);
  }, [themeDark]);

  return (
    <div className={`flex min-h-screen flex-col overflow-x-hidden ${themeDark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50 text-zinc-900"}`}>
      <SiteHeader themeDark={themeDark} onToggleTheme={() => setThemeDark((v) => !v)} />
      <main className="mx-auto w-full max-w-6xl flex-1 overflow-x-hidden px-4 py-6 sm:px-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
