import * as React from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

function useStats() {
  const [stats, setStats] = React.useState({ totalToday: 0, active: 0, resolvedToday: 0, totalVolunteers: 0 });
  React.useEffect(() => {
    const load = () => fetch(`${API_BASE}/api/stats`).then(r => r.json()).then(setStats).catch(() => {});
    load();
    const i = setInterval(load, 15_000);
    return () => clearInterval(i);
  }, []);
  return stats;
}

const STATUS_COLORS: Record<string, string> = {
  unassigned: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  triaged: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  assigned: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  en_route: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  active: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  resolved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
};
const STATUS_ICONS: Record<string, string> = {
  unassigned: "📩", triaged: "🔍", assigned: "👤", en_route: "🚑", active: "🔥", resolved: "✅",
};

function IncidentCard({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
  const navigate = useNavigate();
  const [data, setData] = React.useState<any>(null);

  React.useEffect(() => {
    const fetch_ = () =>
      fetch(`${API_BASE}/api/incident/${id}`)
        .then(r => r.json())
        .then(d => { if (!d.error) setData(d); })
        .catch(() => {});
    fetch_();
    const t = setInterval(fetch_, 10_000);
    return () => clearInterval(t);
  }, [id]);

  const status = data?.status || "unassigned";
  const colorClass = STATUS_COLORS[status] || "text-muted-foreground bg-muted/10 border-border";

  return (
    <div className="rounded-xl border border-border/60 bg-card/70 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 gap-2">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${colorClass}`}>
              {STATUS_ICONS[status]} {status.replace("_", " ")}
            </span>
            {data?.severity && (
              <span className="text-[9px] text-muted-foreground font-semibold">P{data.severity}</span>
            )}
          </div>
          <p className="text-xs font-bold truncate">{data ? `${data.emergency_type} — ${data.location}` : <span className="text-muted-foreground animate-pulse">Loading…</span>}</p>
          <p className="text-[9px] text-muted-foreground font-mono truncate">{id}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => navigate(`/track/${id}`)}
            className="rounded-lg bg-primary/15 border border-primary/30 px-2.5 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/25 transition-colors"
          >
            Track →
          </button>
          <button
            onClick={() => onRemove(id)}
            className="rounded-lg bg-muted/20 border border-border/40 px-2 py-1.5 text-[10px] text-muted-foreground hover:text-red-400 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CitizenPortal() {
  const navigate = useNavigate();
  const name = sessionStorage.getItem("userName") || "Citizen";
  const stats = useStats();

  const [trackId, setTrackId] = React.useState("");
  const [trackError, setTrackError] = React.useState("");

  const [recentIds, setRecentIds] = React.useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("civrescue_my_incidents") || "[]"); } catch { return []; }
  });

  const removeIncident = (id: string) => {
    setRecentIds(prev => {
      const updated = prev.filter(x => x !== id);
      localStorage.setItem("civrescue_my_incidents", JSON.stringify(updated));
      return updated;
    });
  };

  const handleTrack = () => {
    const id = trackId.trim();
    if (!id) { setTrackError("Please enter your incident ID"); return; }
    setTrackError("");
    // Also add to recentIds if not already there
    setRecentIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [id, ...prev].slice(0, 10);
      localStorage.setItem("civrescue_my_incidents", JSON.stringify(updated));
      return updated;
    });
    navigate(`/track/${id}`);
  };

  const statItems = [
    { value: stats.resolvedToday, label: "Resolved Today", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
    { value: stats.active, label: "Active Now", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
    { value: stats.totalVolunteers, label: "Volunteers Ready", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/95 backdrop-blur-xl px-4 py-3">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">CivRescue</p>
            <h1 className="text-base font-black">Hello, {name} 👋</h1>
          </div>
          <button
            onClick={() => { sessionStorage.clear(); navigate("/login"); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto w-full p-4 space-y-5">

        {/* Emergency action banner */}
        <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-950/40 via-card/80 to-card p-5 space-y-4">
          <div className="text-center space-y-0.5">
            <p className="text-3xl">🚨</p>
            <h2 className="text-xl font-black">Emergency Services</h2>
            <p className="text-xs text-muted-foreground">India's AI-powered disaster response platform</p>
          </div>

          {/* Report Emergency — big CTA */}
          <button
            onClick={() => navigate("/emergency")}
            className="w-full rounded-xl bg-red-600 hover:bg-red-700 active:scale-[0.98] py-5 px-5 text-white font-bold shadow-lg shadow-red-600/25 transition-all"
          >
            <p className="text-xl">🆘 Report Emergency</p>
            <p className="text-[11px] font-normal opacity-80 mt-0.5">Describe your situation — AI dispatches help instantly</p>
          </button>
        </div>

        {/* Live stats */}
        <div className="grid grid-cols-3 gap-3">
          {statItems.map(s => (
            <div key={s.label} className={`rounded-xl border p-3 text-center ${s.bg}`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider leading-tight mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Track My Request */}
        <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔍</span>
            <div>
              <p className="text-sm font-bold">Track My Request</p>
              <p className="text-[10px] text-muted-foreground">Enter your incident ID to see live status and volunteer location</p>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Paste your Incident ID…"
              value={trackId}
              onChange={e => { setTrackId(e.target.value); setTrackError(""); }}
              onKeyDown={e => e.key === "Enter" && handleTrack()}
              className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
            />
            <button
              onClick={handleTrack}
              className="rounded-lg bg-primary/20 border border-primary/40 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/30 transition-colors"
            >
              Track →
            </button>
          </div>
          {trackError && <p className="text-xs text-red-400">{trackError}</p>}
        </div>

        {/* My Incidents — live status cards */}
        {recentIds.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Incidents</p>
              <span className="text-[9px] text-muted-foreground/60 font-medium">Updates every 10s</span>
            </div>
            {recentIds.slice(0, 5).map(id => (
              <IncidentCard key={id} id={id} onRemove={removeIncident} />
            ))}
          </div>
        )}

        {/* How it works */}
        <div className="rounded-xl border border-border/50 bg-muted/5 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">How It Works</p>
          <div className="space-y-3">
            {[
              { num: "1", icon: "📝", title: "Submit Report", desc: "Fill in your name, location, emergency type and number of people affected" },
              { num: "2", icon: "🤖", title: "AI Analysis", desc: "Claude AI assesses severity, estimates coordinates and classifies the emergency" },
              { num: "3", icon: "📍", title: "Volunteer Dispatched", desc: "Nearest available volunteer is automatically assigned via SMS" },
              { num: "4", icon: "🗺", title: "Live Tracking", desc: "Track volunteer location in real time on an interactive map" },
            ].map(step => (
              <div key={step.num} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-black text-primary flex-shrink-0">
                  {step.num}
                </div>
                <div>
                  <p className="text-xs font-bold">{step.icon} {step.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency numbers */}
        <div className="rounded-xl border border-border/50 bg-muted/5 p-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Emergency Helplines</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Police", num: "100" },
              { label: "Ambulance", num: "108" },
              { label: "Fire", num: "101" },
              { label: "Disaster Mgmt", num: "1078" },
            ].map(h => (
              <a key={h.label} href={`tel:${h.num}`}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-3 py-2 hover:bg-muted/20 transition-colors">
                <span className="text-xs text-muted-foreground">{h.label}</span>
                <span className="text-sm font-black text-primary">{h.num}</span>
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
