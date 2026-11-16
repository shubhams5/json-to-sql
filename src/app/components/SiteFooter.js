"use client";

import Link from "next/link";
import { siteConfig } from "../siteConfig";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  const item = "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white";

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-2">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{siteConfig.name}</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{siteConfig.tagline}</p>
          <p className="mt-4 text-xs text-zinc-500">
            © {year} {siteConfig.name} · MIT
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Project</p>
          <ul className="mt-2 space-y-2 text-sm">
            <li>
              <Link href={siteConfig.docsPath} className={item}>
                Documentation
              </Link>
            </li>
            <li>
              <Link href={siteConfig.licensePath} className={item}>
                License
              </Link>
            </li>
            <li>
              <Link href={siteConfig.securityPath} className={item}>
                Security
              </Link>
            </li>
            <li>
              <Link href={siteConfig.contributingPath} className={item}>
                Contributing
              </Link>
            </li>
            {siteConfig.github ? (
              <li>
                <a href={siteConfig.github} target="_blank" rel="noopener noreferrer" className={item}>
                  GitHub
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </footer>
  );
}
