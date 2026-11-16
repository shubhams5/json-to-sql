import Link from "next/link";
import { siteConfig } from "../siteConfig";

export const metadata = {
  title: `Security | ${siteConfig.name}`,
  description: "Security policy for JSON to SQL: local processing, safe SQL generation, vulnerability reporting.",
};

export default function SecurityPage() {
  return (
    <article className="mx-auto w-full max-w-3xl min-w-0 py-6">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Security</h1>
      <ul className="mt-6 list-disc space-y-2 pl-5 text-zinc-700 dark:text-zinc-300">
        <li>Conversion runs in your browser or local CLI.</li>
        <li>Generated SQL is never executed by this tool.</li>
        <li>JSON input is limited by size, depth, and node count.</li>
        <li>Identifiers and literals are escaped per database dialect.</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Report a vulnerability</h2>
      <p className="mt-2 text-zinc-700 dark:text-zinc-300">
        Prefer a private GitHub security advisory once the repository is published. Do not file public issues for undisclosed vulnerabilities.
      </p>

      <p className="mt-10">
        <Link href="/" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
          Back to app
        </Link>
      </p>
    </article>
  );
}
