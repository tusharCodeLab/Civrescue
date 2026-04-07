import * as React from "react";

interface CriticalAlertBannerProps {
  alert: string | null;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 8_000;

export function CriticalAlertBanner({ alert, onDismiss }: CriticalAlertBannerProps) {
  // Auto-dismiss after 8 s whenever a new alert fires.
  React.useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [alert, onDismiss]);

  if (!alert) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 rounded-lg border border-red-500/60 bg-red-950/80 px-4 py-3 text-red-100 shadow-lg shadow-red-900/40 backdrop-blur-sm animate-pulse"
    >
      {/* Speaker / alert icon */}
      <span className="mt-0.5 shrink-0 text-2xl leading-none" aria-hidden="true">
        🔊
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-400 mb-0.5">
          ⚠ Severity 5 — Critical Alert
        </p>
        <p className="text-sm font-medium leading-snug break-words">{alert}</p>
      </div>

      <button
        onClick={onDismiss}
        aria-label="Dismiss alert"
        className="shrink-0 ml-2 rounded px-2 py-0.5 text-xs text-red-300 hover:bg-red-800/60 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
