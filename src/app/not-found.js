import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "./siteConfig";

export const metadata = {
  title: `Page not found | ${siteConfig.name}`,
  description: "The page you requested does not exist.",
};

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center py-16 text-center">
      <Image
        src="/logo.png"
        alt=""
        width={56}
        height={56}
        className="mb-6 object-contain opacity-90"
        style={{ width: 56, height: 56, maxWidth: 56, maxHeight: 56 }}
      />
      <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">404</p>
      <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">Page not found</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">That route does not exist in {siteConfig.name}. Head back to the converter or docs.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
          Open app
        </Link>
        <Link href={siteConfig.docsPath} className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900">
          Read docs
        </Link>
      </div>
    </div>
  );
}
