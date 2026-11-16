"use client";

export default function AlertBanner({ type = "info", message, onDismiss }) {
  if (!message) return null;

  const styles = {
    success: "border-emerald-500/50 bg-emerald-50 text-emerald-900 dark:border-emerald-600/60 dark:bg-emerald-950/50 dark:text-emerald-100",
    error: "border-red-500/50 bg-red-50 text-red-900 dark:border-red-600/60 dark:bg-red-950/50 dark:text-red-100",
    warning: "border-amber-500/50 bg-amber-50 text-amber-950 dark:border-amber-600/60 dark:bg-amber-950/40 dark:text-amber-100",
    info: "border-sky-500/50 bg-sky-50 text-sky-950 dark:border-sky-600/60 dark:bg-sky-950/40 dark:text-sky-100",
  };

  return (
    <div role="status" className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${styles[type] || styles.info}`}>
      <p className="min-w-0 break-words">{message}</p>
      {onDismiss && (
        <button type="button" className="shrink-0 text-xs opacity-80 hover:opacity-100" onClick={onDismiss} aria-label="Dismiss">
          Dismiss
        </button>
      )}
    </div>
  );
}
