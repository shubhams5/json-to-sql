"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { siteConfig } from "../siteConfig";

const SITE_LINKS = [
  { href: "/", label: "App" },
  { href: siteConfig.docsPath, label: "Docs" },
  ...(siteConfig.github ? [{ href: siteConfig.github, label: "GitHub", external: true }] : []),
  { href: siteConfig.securityPath, label: "Security" },
];

export default function SiteHeader({ themeDark, onToggleTheme }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const linkClass = "rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white";

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 text-zinc-900 no-underline dark:text-white" aria-label={`${siteConfig.name} home`}>
          <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden">
            <Image src="/logo.png" alt="" width={32} height={32} className="object-contain" style={{ width: 32, height: 32, maxWidth: 32, maxHeight: 32 }} priority />
          </span>
          <span className="truncate text-lg font-semibold tracking-tight sm:text-xl">{siteConfig.name}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {SITE_LINKS.map((link) =>
            link.external ? (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                {link.label}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className={linkClass}>
                {link.label}
              </Link>
            )
          )}
          <button
            type="button"
            className="ml-1 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            onClick={onToggleTheme}
          >
            {themeDark ? "Light" : "Dark"}
          </button>
        </nav>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 md:hidden dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="border-t border-zinc-200 bg-white px-4 py-3 md:hidden dark:border-zinc-800 dark:bg-zinc-950">
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {SITE_LINKS.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              )
            )}
            <button
              type="button"
              className="rounded-md px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              onClick={() => {
                onToggleTheme();
                setOpen(false);
              }}
            >
              Switch to {themeDark ? "light" : "dark"} mode
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
