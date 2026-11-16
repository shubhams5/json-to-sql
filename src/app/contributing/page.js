import Link from "next/link";
import { siteConfig } from "../siteConfig";

export const metadata = {
  title: `Contributing | ${siteConfig.name}`,
  description: "How to contribute to JSON to SQL: setup, guidelines, and pull request expectations.",
};

export default function ContributingPage() {
  return (
    <article className="mx-auto w-full max-w-3xl min-w-0 py-6">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Contributing</h1>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-zinc-700 dark:text-zinc-300">
        <li>Fork and clone the repository.</li>
        <li>Run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm install</code> then <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run build:packages</code>.</li>
        <li>Keep generation logic in <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">packages/core</code>.</li>
        <li>Add Vitest coverage for parser, inference, dialects, and export changes.</li>
        <li>Do not add paid APIs or auto-execute generated SQL.</li>
      </ol>
      <p className="mt-10">
        <Link href="/" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
          Back to app
        </Link>
      </p>
    </article>
  );
}
