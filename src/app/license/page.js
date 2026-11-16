import Link from "next/link";
import { siteConfig } from "../siteConfig";

export const metadata = {
  title: `License | ${siteConfig.name}`,
  description: "MIT license for the JSON to SQL open-source project.",
};

export default function LicensePage() {
  return (
    <article className="mx-auto w-full max-w-3xl min-w-0 py-6">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">MIT License</h1>
      <pre className="mt-6 overflow-x-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-100 p-4 text-sm leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">{`MIT License

Copyright (c) ${new Date().getFullYear()} JSON to SQL contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`}</pre>
      <p className="mt-8">
        <Link href="/" className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
          Back to app
        </Link>
      </p>
    </article>
  );
}
