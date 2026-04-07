import * as React from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import NotificationBell from "@/components/NotificationBell";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

// ─── helpers ────────────────────────────────────────────────────────────────
function fmtDate(d: string | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const sevColor = (n: number) => n >= 4 ? "#ef4444" : n === 3 ? "#eab308" : "#22c55e";
const sevBadge = (n: number) => n >= 4 ? "bg-red-500/20 text-red-400 border-red-500/40" : n === 3 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
const statusBadge = (s: string) => {
  const m: Record<string, string> = { unassigned: "bg-red-500/20 text-red-400 border-red-500/40", assigned: "bg-blue-500/20 text-blue-400 border-blue-500/40", en_route: "bg-violet-500/20 text-violet-400 border-violet-500/40", on_scene: "bg-amber-500/20 text-amber-400 border-amber-500/40", resolved: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" };
  return m[s] || "bg-muted text-muted-foreground border-border";
};
const volBadge = (s: string) => s === "available" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : s === "busy" ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "bg-muted/40 text-muted-foreground border-border";
const locStr = (loc: any): string => { if (!loc) return "Unknown"; if (typeof loc === "string") return loc; return loc.address || (loc.lat ? `${loc.lat}, ${loc.lng}` : "Unknown"); };
const incLatLng = (inc: any): [number, number] | null => { if (inc.lat && inc.lng) return [inc.lat, inc.lng]; if (inc.location && typeof inc.location === "object" && inc.location.lat && inc.location.lng) return [inc.location.lat, inc.location.lng]; return null; };

// ─── map helpers ─────────────────────────────────────────────────────────────
const incidentIcon = (sev: number) => new L.DivIcon({
  className: "",
  html: `<div style="position:relative;width:16px;height:16px"><div style="position:absolute;inset:0;border-radius:50%;background:${sevColor(sev)};border:2px solid white;box-shadow:0 0 8px ${sevColor(sev)}66"></div>${sev >= 4 ? `<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${sevColor(sev)};opacity:0.5;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>` : ""}</div>`,
  iconSize: [16, 16], iconAnchor: [8, 8],
});
function FitAll({ points }: { points: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (points.length >= 2) map.fitBounds(L.latLngBounds(points.map(p => L.latLng(p[0], p[1]))).pad(0.2), { maxZoom: 12 });
    else if (points.length === 1) map.setView(points[0], 12);
  }, [points, map]);
  return null;
}

// ─── ConfirmDialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel }: { title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[3000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-base">{title}</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted/20 transition-colors">Cancel</button>
          <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors ${danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─── EditVolunteerModal ───────────────────────────────────────────────────────
function EditVolunteerModal({ vol, onSave, onClose }: { vol: any; onSave: (data: any) => void; onClose: () => void }) {
  const [form, setForm] = React.useState({ full_name: vol.name || vol.full_name || "", phone: vol.phone || "", district: vol.district || "", skills: (vol.skills || []).join(", ") });
  const [saving, setSaving] = React.useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/volunteer/${vol._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, skills: form.skills }) });
      if (!r.ok) throw new Error("Save failed");
      onSave({ ...vol, ...form });
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[3000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm space-y-3 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-black text-base">Edit Volunteer</h3>
        {([["Name", "full_name"], ["Phone", "phone"], ["District", "district"]] as [string, keyof typeof form][]).map(([label, key]) => (
          <div key={key}>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
            <input value={form[key]} onChange={e => set(key, e.target.value)} className="w-full rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
        ))}
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Skills <span className="normal-case font-normal">(comma-separated)</span></p>
          <input value={form.skills} onChange={e => set("skills", e.target.value)} className="w-full rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted/20 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── pinIcon for incident panel mini-map ─────────────────────────────────────
const pinIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41],
});

// ─── IncidentSidePanel ────────────────────────────────────────────────────────
function IncidentSidePanel({ incident, volunteers, onClose, onRefresh }: { incident: any; volunteers: any[]; onClose: () => void; onRefresh: () => void }) {
  const [reassignVolId, setReassignVolId] = React.useState("");
  const [acting, setActing] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const availableVols = volunteers.filter(v => v.status === "available");
  const assignedVol = incident.assigned_volunteer_id ? volunteers.find(v => v._id === incident.assigned_volunteer_id?.toString() || v._id?.toString() === incident.assigned_volunteer_id?.toString()) : null;

  const act = async (fn: () => Promise<void>) => { setActing(true); try { await fn(); onRefresh(); } finally { setActing(false); } };

  const handleReassign = () => act(async () => {
    if (!reassignVolId) return;
    await fetch(`${API_BASE}/api/admin/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidentId: incident._id, volunteerId: reassignVolId }) });
    setReassignVolId("");
  });
  const handleResolve = () => act(async () => { await fetch(`${API_BASE}/api/incident/${incident._id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "resolved" }) }); });
  const handleEscalate = () => act(async () => { await fetch(`${API_BASE}/api/incident/${incident._id}/escalate`, { method: "PATCH" }); });
  const handleDelete = async () => { await fetch(`${API_BASE}/api/admin/incident/${incident._id}`, { method: "DELETE" }); onRefresh(); onClose(); };

  const timeline = [
    { step: "Received", done: true, time: incident.created_at },
    { step: "AI Triaged", done: !!incident.summary, time: incident.summary ? incident.created_at : null },
    { step: "Volunteer Assigned", done: !!incident.assigned_volunteer_id, time: incident.assigned_volunteer_id ? incident.created_at : null },
    { step: "En Route", done: ["en_route", "on_scene", "resolved"].includes(incident.status), time: null },
    { step: "Resolved", done: incident.status === "resolved", time: null },
  ];

  return (
    <>
      {confirmDelete && <ConfirmDialog title="Delete Incident" message={`Permanently delete "${incident.emergency_type} — ${locStr(incident.location)}"? This cannot be undone.`} confirmLabel="Delete" danger onConfirm={handleDelete} onCancel={() => setConfirmDelete(false)} />}
      <div className="fixed inset-0 z-[1001] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-[1002] w-full max-w-lg bg-card border-l border-border shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black truncate">{incident.emergency_type}</h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${sevBadge(incident.severity)}`}>SEV {incident.severity}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge(incident.status)}`}>{incident.status?.replace("_", " ").toUpperCase()}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{locStr(incident.location)}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted/30 flex-shrink-0">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {(() => { const pos = incLatLng(incident); return pos ? (
            <div className="rounded-xl border border-border overflow-hidden h-[160px]">
              <MapContainer center={pos} zoom={14} className="h-full w-full" scrollWheelZoom={false} zoomControl={false} dragging={false}>
                <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="CARTO" />
                <Marker position={pos} icon={pinIcon} />
              </MapContainer>
            </div>
          ) : null; })()}

          <div className="grid grid-cols-2 gap-2">
            {[["Caller", incident.caller_phone || "—"], ["People", incident.people_affected || "—"], ["Severity", `${incident.severity}/5`], ["Reported", fmtDate(incident.created_at)]].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{l}</p>
                <p className="text-sm font-semibold mt-0.5 break-all">{v}</p>
              </div>
            ))}
          </div>

          {incident.summary && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1">
              <p className="text-[10px] text-primary uppercase tracking-wider font-bold">✨ Claude AI Summary</p>
              <p className="text-sm leading-relaxed">{incident.summary}</p>
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/10 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Assigned Volunteer</p>
            {assignedVol ? (
              <div className="flex items-center justify-between gap-2">
                <div><p className="text-sm font-bold">{assignedVol.name || assignedVol.full_name}</p><p className="text-xs text-muted-foreground">{assignedVol.phone}</p></div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${volBadge(assignedVol.status || assignedVol.availability)}`}>{assignedVol.status || assignedVol.availability}</span>
              </div>
            ) : <p className="text-xs text-muted-foreground">No volunteer assigned</p>}
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-border bg-muted/10 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3">Status Timeline</p>
            <div className="space-y-2">
              {timeline.map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 flex-shrink-0 ${s.done ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "bg-muted/20 border-border text-muted-foreground/30"}`}>{s.done ? "✓" : i + 1}</div>
                  <p className={`text-xs font-semibold flex-1 ${s.done ? "" : "text-muted-foreground/40"}`}>{s.step}</p>
                  {s.time && <p className="text-[10px] text-muted-foreground">{fmtDate(s.time)}</p>}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <select value={reassignVolId} onChange={e => setReassignVolId(e.target.value)} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Reassign to volunteer…</option>
                {availableVols.map(v => <option key={v._id} value={v._id}>{v.name || v.full_name} · {v.phone}</option>)}
              </select>
              <button onClick={handleReassign} disabled={!reassignVolId || acting} className="rounded-lg bg-blue-500/20 border border-blue-500/40 px-3 py-2 text-xs font-bold text-blue-400 hover:bg-blue-500/30 disabled:opacity-40 transition-colors">Reassign</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleResolve} disabled={incident.status === "resolved" || acting} className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 py-2 text-xs font-bold text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-40 transition-colors">✅ Resolve</button>
              <button onClick={handleEscalate} disabled={incident.severity >= 5 || acting} className="rounded-lg bg-amber-500/20 border border-amber-500/40 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/30 disabled:opacity-40 transition-colors">⬆ Escalate</button>
              <button onClick={() => setConfirmDelete(true)} className="rounded-lg bg-red-500/20 border border-red-500/40 py-2 text-xs font-bold text-red-400 hover:bg-red-500/30 transition-colors">🗑 Delete</button>
            </div>
            {incident.caller_phone && (
              <a href={`tel:${incident.caller_phone}`} className="flex items-center justify-center gap-2 w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                📞 Call Victim ({incident.caller_phone})
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── VolunteerSidePanel ───────────────────────────────────────────────────────
function VolunteerSidePanel({ vol, onClose, onRefresh, onEdit, onForceStatus, onDelete }: { vol: any; onClose: () => void; onRefresh: () => void; onEdit: () => void; onForceStatus: (s: string) => void; onDelete: () => void }) {
  const [history, setHistory] = React.useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = React.useState(true);
  const initials = (vol.name || vol.full_name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  React.useEffect(() => {
    fetch(`${API_BASE}/api/admin/volunteer/${vol._id}/history`).then(r => r.json()).then(d => { if (Array.isArray(d)) setHistory(d); }).catch(() => {}).finally(() => setLoadingHistory(false));
  }, [vol._id]);

  return (
    <>
      <div className="fixed inset-0 z-[1001] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-[1002] w-full max-w-lg bg-card border-l border-border shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-black">Volunteer Profile</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground w-7 h-7 flex items-center justify-center rounded-lg hover:bg-muted/30">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Profile header */}
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-black text-white flex-shrink-0 ${vol.status === "available" ? "bg-gradient-to-br from-emerald-500 to-emerald-700" : vol.status === "busy" ? "bg-gradient-to-br from-amber-500 to-amber-700" : "bg-muted"}`}>{initials}</div>
            <div className="min-w-0">
              <p className="text-lg font-black truncate">{vol.name || vol.full_name}</p>
              <p className="text-xs text-muted-foreground">{vol.district}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${volBadge(vol.status || vol.availability)}`}>{vol.status || vol.availability}</span>
                {vol.current_lat && <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-400"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />GPS Live</span>}
              </div>
            </div>
          </div>

          {/* Info tiles */}
          <div className="grid grid-cols-2 gap-2">
            {[["Phone", vol.phone || "—"], ["District", vol.district || "—"], ["Resolved", vol.resolved_count ?? 0], ["GPS", vol.current_lat ? `${vol.current_lat.toFixed(4)}, ${vol.current_lng.toFixed(4)}` : "No data"]].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-border/50 bg-muted/10 p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{l}</p>
                <p className="text-sm font-semibold mt-0.5 break-all">{String(v)}</p>
              </div>
            ))}
          </div>

          {/* Skills */}
          {(vol.skills || []).length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {(vol.skills || []).map((s: string) => <span key={s} className="rounded-full border border-border bg-muted/20 px-2.5 py-0.5 text-xs font-semibold">{s}</span>)}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onEdit} className="rounded-lg border border-border bg-muted/10 py-2.5 text-xs font-bold hover:bg-muted/20 transition-colors">✏️ Edit Profile</button>
            <a href={`tel:${vol.phone}`} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors text-center">📞 Call</a>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => onForceStatus("available")} disabled={vol.status === "available"} className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 py-2 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">✅ Set Available</button>
            <button onClick={() => onForceStatus("offline")} disabled={vol.status === "offline"} className="rounded-lg border border-border bg-muted/10 py-2 text-[10px] font-bold text-muted-foreground hover:bg-muted/20 disabled:opacity-40 transition-colors">⭕ Set Offline</button>
            <button onClick={onDelete} className="rounded-lg border border-red-500/40 bg-red-500/10 py-2 text-[10px] font-bold text-red-400 hover:bg-red-500/20 transition-colors">🗑 Remove</button>
          </div>

          {/* Performance history */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Incident History</p>
            {loadingHistory ? (
              <div className="space-y-2">{Array.from({length: 3}).map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted/20 animate-pulse" />)}</div>
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">No incidents handled yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map(inc => (
                  <div key={inc._id} className="rounded-lg border border-border/50 bg-muted/10 p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{inc.emergency_type}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{locStr(inc.location)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${sevBadge(inc.severity)}`}>SEV {inc.severity}</span>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{timeAgo(inc.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main AdminDashboard ──────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [tab, setTab] = React.useState<"all" | "unassigned" | "volunteers" | "activity">("all");
  const [stats, setStats] = React.useState({ totalToday: 0, unassigned: 0, activeVols: 0, resolved: 0, gpsOnline: 0, avgSeverity: 0 });
  const [incidents, setIncidents] = React.useState<any[]>([]);
  const [volunteers, setVolunteers] = React.useState<any[]>([]);
  const [assignMap, setAssignMap] = React.useState<Record<string, string>>({});
  const [selectedIncidentId, setSelectedIncidentId] = React.useState<string | null>(null);
  const [selectedVolId, setSelectedVolId] = React.useState<string | null>(null);
  const [incFilter, setIncFilter] = React.useState("all");
  const [incSearch, setIncSearch] = React.useState("");
  const [mapFilter, setMapFilter] = React.useState<"all" | "incidents" | "volunteers">("all");
  const [editingVol, setEditingVol] = React.useState<any | null>(null);
  const [deletingVolId, setDeletingVolId] = React.useState<string | null>(null);
  const [broadcastMsg, setBroadcastMsg] = React.useState("");
  const [broadcasting, setBroadcasting] = React.useState(false);
  const [broadcastResult, setBroadcastResult] = React.useState<string | null>(null);
  const [clock, setClock] = React.useState(new Date());

  React.useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  const fetchAll = React.useCallback(async () => {
    const [statsR, incR, volR] = await Promise.all([
      fetch(`${API_BASE}/api/admin/stats/enhanced`).then(r => r.json()).catch(() => stats),
      fetch(`${API_BASE}/api/admin/incidents`).then(r => r.json()).catch(() => []),
      fetch(`${API_BASE}/api/admin/volunteers`).then(r => r.json()).catch(() => []),
    ]);
    setStats(statsR);
    if (Array.isArray(incR)) setIncidents(incR);
    if (Array.isArray(volR)) setVolunteers(volR);
  }, []);

  React.useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 10_000); return () => clearInterval(t); }, [fetchAll]);

  const unassigned = incidents.filter(i => i.status === "unassigned");
  const availableVols = volunteers.filter(v => v.status === "available");
  const onlineVols = volunteers.filter(v => v.status !== "offline" && v.current_lat);
  const selectedIncident = incidents.find(i => i._id === selectedIncidentId);
  const selectedVol = volunteers.find(v => v._id === selectedVolId);

  const filteredIncidents = incidents.filter(inc => {
    if (incFilter !== "all" && inc.status !== incFilter) return false;
    if (incSearch) { const q = incSearch.toLowerCase(); return inc.emergency_type?.toLowerCase().includes(q) || locStr(inc.location).toLowerCase().includes(q); }
    return true;
  });

  const mapPoints: [number, number][] = [
    ...(mapFilter !== "volunteers" ? incidents.map(i => incLatLng(i)).filter((p): p is [number, number] => p !== null) : []),
    ...(mapFilter !== "incidents" ? onlineVols.map(v => [v.current_lat, v.current_lng] as [number, number]) : []),
  ];

  const handleAssign = async (incidentId: string) => {
    const volunteerId = assignMap[incidentId];
    if (!volunteerId) return;
    await fetch(`${API_BASE}/api/admin/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidentId, volunteerId }) });
    fetchAll();
  };

  const handleForceStatus = async (volId: string, status: string) => {
    await fetch(`${API_BASE}/api/admin/volunteer/${volId}/force-status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    fetchAll();
    setSelectedVolId(null);
  };

  const handleDeleteVol = async (volId: string) => {
    await fetch(`${API_BASE}/api/admin/volunteer/${volId}`, { method: "DELETE" });
    setDeletingVolId(null);
    setSelectedVolId(null);
    fetchAll();
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const r = await fetch(`${API_BASE}/api/admin/broadcast`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: broadcastMsg }) });
      const d = await r.json();
      setBroadcastResult(`✅ Sent to ${d.sent} volunteer${d.sent !== 1 ? "s" : ""}${d.failed ? `, ${d.failed} failed` : ""}`);
      setBroadcastMsg("");
    } catch { setBroadcastResult("❌ Broadcast failed"); } finally { setBroadcasting(false); }
  };

  const statTiles = [
    { label: "Today", value: stats.totalToday, color: "text-blue-400", ring: "border-blue-500/30 bg-blue-500/10" },
    { label: "Unassigned", value: stats.unassigned, color: "text-red-400", ring: "border-red-500/30 bg-red-500/10" },
    { label: "Active Vols", value: stats.activeVols, color: "text-emerald-400", ring: "border-emerald-500/30 bg-emerald-500/10" },
    { label: "GPS Online", value: stats.gpsOnline, color: "text-blue-300", ring: "border-blue-400/30 bg-blue-400/10" },
    { label: "Resolved Today", value: stats.resolved, color: "text-amber-400", ring: "border-amber-500/30 bg-amber-500/10" },
    { label: "Avg Severity", value: stats.avgSeverity || "—", color: stats.avgSeverity >= 4 ? "text-red-400" : "text-yellow-400", ring: "border-yellow-500/30 bg-yellow-500/10" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border bg-card/95 backdrop-blur-xl sticky top-0 z-50 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">CivRescue</p>
            <h1 className="text-xl font-black leading-tight">Admin Command Center</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-400">SYSTEM ONLINE</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono hidden md:block">{clock.toLocaleTimeString("en-IN")}</span>
            <NotificationBell role="admin" />
            <button onClick={() => { sessionStorage.clear(); window.location.href = "/login"; }} className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted/20">Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        {/* ── Stats Strip ── */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {statTiles.map(s => (
            <div key={s.label} className={`rounded-xl border p-3 ${s.ring}`}>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">{s.label}</p>
              <p className={`text-2xl font-black mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* ── Dark Live Map ── */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-card/80 border-b border-border">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Live Operational Map</p>
            <div className="flex gap-1">
              {(["all", "incidents", "volunteers"] as const).map(f => (
                <button key={f} onClick={() => setMapFilter(f)} className={`rounded-full px-3 py-0.5 text-[10px] font-semibold capitalize transition-colors ${mapFilter === f ? "bg-primary/20 text-primary border border-primary/40" : "text-muted-foreground hover:text-foreground"}`}>{f}</button>
              ))}
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />SEV 4–5</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" />SEV 3</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />SEV 1–2</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />Volunteer</span>
            </div>
          </div>
          <div className="h-[380px]">
            <MapContainer center={[22.3, 71.2]} zoom={7} className="h-full w-full" scrollWheelZoom>
              <TileLayer attribution='&copy; <a href="https://carto.com">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              <FitAll points={mapPoints} />
              {mapFilter !== "volunteers" && incidents.map(inc => { const pos = incLatLng(inc); if (!pos) return null; return (
                <Marker key={inc._id} position={pos} icon={incidentIcon(inc.severity)} eventHandlers={{ click: () => { setSelectedIncidentId(inc._id); setSelectedVolId(null); } }}>
                  <Tooltip direction="top" opacity={0.95}><b>{inc.emergency_type}</b> · SEV {inc.severity}<br />{locStr(inc.location)}<br /><span className="opacity-60 text-[10px]">{inc.status} · click for details</span></Tooltip>
                </Marker>
              ); })}
              {mapFilter !== "incidents" && onlineVols.map(vol => (
                <CircleMarker key={vol._id} center={[vol.current_lat, vol.current_lng]} radius={7} pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.8, weight: 2 }}
                  eventHandlers={{ click: () => { setSelectedVolId(vol._id); setSelectedIncidentId(null); } }}>
                  <Tooltip direction="top" opacity={0.95}><b>{vol.name || vol.full_name}</b> · {vol.status}</Tooltip>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>

        {/* ── 4-Tab Bar ── */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {([["all", `All Incidents (${incidents.length})`], ["unassigned", `Unassigned (${unassigned.length})`], ["volunteers", `Volunteers (${volunteers.length})`], ["activity", "Activity Feed"]] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label}</button>
          ))}
        </div>

        {/* ── All Incidents Tab ── */}
        {tab === "all" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <input value={incSearch} onChange={e => setIncSearch(e.target.value)} placeholder="Search type or location…" className="rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 w-48" />
              <div className="flex gap-1 flex-wrap">
                {["all", "unassigned", "assigned", "en_route", "on_scene", "resolved"].map(f => (
                  <button key={f} onClick={() => setIncFilter(f)} className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition-colors ${incFilter === f ? "bg-primary/20 border-primary/40 text-primary" : "bg-muted/10 border-border/50 text-muted-foreground hover:bg-muted/20"}`}>
                    {f === "all" ? "All" : f.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            {filteredIncidents.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No incidents match the filter.</p>}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredIncidents.map(inc => (
                <button key={inc._id} onClick={() => { setSelectedIncidentId(inc._id); setSelectedVolId(null); }} className="rounded-xl border border-border/60 bg-card/60 p-3 text-left space-y-2 hover:border-primary/40 hover:bg-muted/10 transition-all active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold leading-snug line-clamp-1">{inc.emergency_type}</p>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${sevBadge(inc.severity)}`}>SEV{inc.severity}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{locStr(inc.location)}</p>
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${statusBadge(inc.status)}`}>{inc.status?.replace("_", " ")}</span>
                    <span className="text-[10px] text-muted-foreground">{timeAgo(inc.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Unassigned Tab ── */}
        {tab === "unassigned" && (
          <div className="space-y-3">
            {unassigned.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">🎉 All incidents are assigned!</p>}
            {unassigned.map(inc => (
              <div key={inc._id} className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3 cursor-pointer hover:border-red-500/40 transition-colors" onClick={() => { setSelectedIncidentId(inc._id); setSelectedVolId(null); }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{inc.emergency_type} — {locStr(inc.location)}</p>
                    <p className="text-xs text-muted-foreground">{inc.people_affected} people · {timeAgo(inc.created_at)}</p>
                    {inc.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{inc.summary}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${sevBadge(inc.severity)}`}>SEV {inc.severity}</span>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <select value={assignMap[inc._id] || ""} onChange={e => setAssignMap(p => ({ ...p, [inc._id]: e.target.value }))} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">Select volunteer…</option>
                    {availableVols.map(v => <option key={v._id} value={v._id}>{v.name || v.full_name} · {v.phone}</option>)}
                  </select>
                  <button onClick={() => handleAssign(inc._id)} disabled={!assignMap[inc._id]} className="rounded-lg bg-primary/20 border border-primary/40 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/30 disabled:opacity-40 transition-colors">Assign</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Volunteers Tab ── */}
        {tab === "volunteers" && (
          <div className="space-y-4">
            {/* Broadcast bar */}
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-2">
              <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">📢 Broadcast SMS to All Volunteers</p>
              <div className="flex gap-2">
                <input value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Type your message…" className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40" onKeyDown={e => e.key === "Enter" && handleBroadcast()} />
                <button onClick={handleBroadcast} disabled={broadcasting || !broadcastMsg.trim()} className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-colors whitespace-nowrap">{broadcasting ? "Sending…" : "Send All"}</button>
              </div>
              {broadcastResult && <p className="text-xs font-semibold text-blue-300">{broadcastResult}</p>}
            </div>

            {/* Volunteer card grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {volunteers.map(vol => {
                const initials = (vol.name || vol.full_name || "?").split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                return (
                  <div key={vol._id} className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-3 hover:border-border transition-colors">
                    {/* Card header */}
                    <div className="flex items-center gap-2.5">
                      <div className={`relative w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0 ${vol.status === "available" ? "bg-gradient-to-br from-emerald-500 to-emerald-700" : vol.status === "busy" ? "bg-gradient-to-br from-amber-500 to-amber-700" : "bg-muted"}`}>
                        {initials}
                        {vol.current_lat && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-background"><span className="w-1 h-1 rounded-full bg-white animate-pulse block m-auto mt-[3px]" /></span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{vol.name || vol.full_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{vol.district}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border flex-shrink-0 ${volBadge(vol.status || vol.availability)}`}>{vol.status || vol.availability}</span>
                    </div>
                    {/* Skills */}
                    <div className="flex flex-wrap gap-1">
                      {(vol.skills || []).slice(0, 3).map((s: string) => <span key={s} className="rounded-full border border-border/60 bg-muted/20 px-2 py-0 text-[9px] font-semibold">{s}</span>)}
                      {(vol.skills || []).length > 3 && <span className="rounded-full border border-border/60 px-2 py-0 text-[9px] text-muted-foreground">+{(vol.skills || []).length - 3}</span>}
                    </div>
                    {/* Stats row */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>✅ {vol.resolved_count ?? 0} resolved</span>
                      <span>{vol.current_lat ? `GPS: ${vol.current_lat.toFixed(3)}` : "No GPS"}</span>
                    </div>
                    {/* Action row */}
                    <div className="flex gap-1.5">
                      <button onClick={() => { setSelectedVolId(vol._id); setSelectedIncidentId(null); }} className="flex-1 rounded-lg border border-border bg-muted/10 py-1.5 text-[10px] font-semibold hover:bg-muted/20 transition-colors">View</button>
                      <button onClick={() => setEditingVol(vol)} className="flex-1 rounded-lg border border-border bg-muted/10 py-1.5 text-[10px] font-semibold hover:bg-muted/20 transition-colors">✏️ Edit</button>
                      <button onClick={() => handleForceStatus(vol._id, vol.status === "available" ? "offline" : "available")} className={`flex-1 rounded-lg border py-1.5 text-[10px] font-semibold transition-colors ${vol.status === "available" ? "border-muted bg-muted/10 text-muted-foreground hover:bg-muted/20" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"}`}>{vol.status === "available" ? "⭕ Offline" : "✅ Free"}</button>
                      <button onClick={() => setDeletingVolId(vol._id)} className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/20 transition-colors">🗑</button>
                    </div>
                  </div>
                );
              })}
              {volunteers.length === 0 && <p className="text-sm text-muted-foreground col-span-3 text-center py-8">No volunteers registered.</p>}
            </div>
          </div>
        )}

        {/* ── Activity Feed Tab ── */}
        {tab === "activity" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Last {Math.min(incidents.length, 30)} events (newest first)</p>
            {incidents.slice(0, 30).map(inc => (
              <div key={inc._id} className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/5 p-3 hover:bg-muted/10 cursor-pointer transition-colors" onClick={() => { setSelectedIncidentId(inc._id); setSelectedVolId(null); setTab("all"); }}>
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-base ${inc.severity >= 4 ? "bg-red-500/20" : inc.severity === 3 ? "bg-yellow-500/20" : "bg-emerald-500/20"}`}>
                  {inc.status === "resolved" ? "✅" : inc.severity >= 4 ? "🚨" : "⚠️"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{inc.emergency_type} <span className="text-muted-foreground font-normal">— {locStr(inc.location)}</span></p>
                  <p className="text-[10px] text-muted-foreground">{inc.people_affected} people · Sev {inc.severity}/5 · <span className={`font-semibold ${statusBadge(inc.status).split(" ").find(c => c.startsWith("text-"))}`}>{inc.status?.replace("_", " ")}</span></p>
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo(inc.created_at)}</span>
              </div>
            ))}
            {incidents.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No activity yet.</p>}
          </div>
        )}
      </div>

      {/* ── Side Panels ── */}
      {selectedIncident && !selectedVol && (
        <IncidentSidePanel incident={selectedIncident} volunteers={volunteers} onClose={() => setSelectedIncidentId(null)} onRefresh={fetchAll} />
      )}
      {selectedVol && !selectedIncident && (
        <VolunteerSidePanel
          vol={selectedVol}
          onClose={() => setSelectedVolId(null)}
          onRefresh={fetchAll}
          onEdit={() => setEditingVol(selectedVol)}
          onForceStatus={s => handleForceStatus(selectedVol._id, s)}
          onDelete={() => setDeletingVolId(selectedVol._id)}
        />
      )}

      {/* ── Modals ── */}
      {editingVol && (
        <EditVolunteerModal vol={editingVol} onClose={() => setEditingVol(null)} onSave={() => { setEditingVol(null); fetchAll(); }} />
      )}
      {deletingVolId && (
        <ConfirmDialog
          title="Remove Volunteer"
          message={`Remove "${volunteers.find(v => v._id === deletingVolId)?.name || volunteers.find(v => v._id === deletingVolId)?.full_name}"? Their user account will also be deleted. This cannot be undone.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => handleDeleteVol(deletingVolId)}
          onCancel={() => setDeletingVolId(null)}
        />
      )}
    </div>
  );
}
