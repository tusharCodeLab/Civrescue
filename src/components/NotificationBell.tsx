import * as React from "react";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

interface Notif {
  _id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

function timeAgo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

const typeIcon: Record<string, string> = {
  new_incident: "🚨",
  assignment: "👤",
  escalation: "⬆",
};

export default function NotificationBell({ role }: { role: "admin" | "volunteer" }) {
  const userId = sessionStorage.getItem("userId") || "";
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notif[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  // Poll every 10 seconds
  React.useEffect(() => {
    const fetchNotifs = () => {
      fetch(`${API_BASE}/api/notifications`, {
        headers: { "x-role": role, "x-user-id": userId },
      })
        .then(r => r.json())
        .then(data => {
          if (data.notifications) setNotifications(data.notifications);
          if (typeof data.unreadCount === "number") setUnreadCount(data.unreadCount);
        })
        .catch(() => {});
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10_000);
    return () => clearInterval(interval);
  }, [role, userId]);

  // Mark all as read on dropdown open
  React.useEffect(() => {
    if (!open || unreadCount === 0) return;
    fetch(`${API_BASE}/api/notifications/read`, {
      method: "PATCH",
      headers: { "x-role": role, "x-user-id": userId },
    }).then(() => setUnreadCount(0)).catch(() => {});
  }, [open, unreadCount, role, userId]);

  // Close on click outside
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 rounded-lg hover:bg-muted/30 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {/* Red badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-black text-white shadow-lg shadow-red-500/30 animate-in zoom-in duration-200">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-border bg-card shadow-2xl z-[100] animate-in slide-in-from-top-2 fade-in duration-150">
          <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notifications</p>
          </div>

          {notifications.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {notifications.map(n => (
                <div key={n._id} className={`px-4 py-3 hover:bg-muted/10 transition-colors ${!n.read ? "bg-primary/5" : ""}`}>
                  <div className="flex items-start gap-2.5">
                    <span className="text-base flex-shrink-0 mt-0.5">{typeIcon[n.type] || "📣"}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs leading-tight ${!n.read ? "font-bold text-foreground" : "font-medium text-foreground/80"}`}>
                        {n.title}
                      </p>
                      {n.message && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{n.message}</p>
                      )}
                      <p className="text-[9px] text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
