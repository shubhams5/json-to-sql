import Link from "next/link";
import { siteConfig } from "../siteConfig";

export const metadata = {
  title: `Docs | ${siteConfig.name}`,
  description: "How to use JSON to SQL locally: import JSON, infer schemas, generate SQL and CRUD, export artifacts.",
};

export default function DocsPage() {
  return (
    <article className="mx-auto w-full max-w-3xl min-w-0 py-6">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Documentation</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">Local-first workflow. Nothing is sent to a remote conversion API.</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">1. Import JSON</h2>
        <p className="text-zinc-700 dark:text-zinc-300">Paste JSON or use Import file. Arrays of objects work best. Nested objects can become child tables or JSON columns.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">2. Configure schema</h2>
        <p className="text-zinc-700 dark:text-zinc-300">Pick a dialect, root table name, and primary key hint. Refine columns on the Schema tab. Review relationships on ER Diagram.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">3. Generate SQL & CRUD</h2>
        <p className="text-zinc-700 dark:text-zinc-300">SQL tab builds INSERT/UPDATE/DELETE, CREATE schema, or a full bundle. CRUD tab emits Express or NestJS starters. Export downloads a ZIP preview.</p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">CLI</h2>
        <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-100 p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">{`npm run cli -- data.json --dialect postgres --table records --out ./out --crud express-ts`}</pre>
      </section>

      <p className="mt-10">
        <Link href="/" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
          Back to app
        </Link>
      </p>
    </article>
  );
}
