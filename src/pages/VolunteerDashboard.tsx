import * as React from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import NotificationBell from "@/components/NotificationBell";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function timeAgo(dateStr: string) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 60000;
  if (diff < 1) return "just now";
  if (diff < 60) return `${Math.round(diff)}m ago`;
  return `${Math.round(diff / 60)}h ago`;
}

function sevGlow(sev: number) {
  if (sev >= 4) return "border-red-500/70 shadow-[0_0_22px_rgba(239,68,68,0.28)]";
  if (sev === 3) return "border-amber-500/60 shadow-[0_0_16px_rgba(245,158,11,0.22)]";
  return "border-emerald-500/30";
}
function sevBadge(sev: number) {
  if (sev >= 4) return "bg-red-500/20 text-red-400 border-red-500/40";
  if (sev === 3) return "bg-amber-500/20 text-amber-400 border-amber-500/40";
  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
}

const STEPS = ["assigned", "en_route", "on_scene", "resolved"] as const;
const STEP_LABELS = ["Assigned", "En Route", "On Scene", "Resolved"];
const STEP_ICONS = ["📋", "🚗", "📍", "✅"];

function stepIdx(status: string) { return STEPS.indexOf(status as typeof STEPS[number]); }
function nextStep(status: string): string | null {
  const i = stepIdx(status); return i >= 0 && i < STEPS.length - 1 ? STEPS[i + 1] : null;
}

const incidentDivIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:26px;height:26px;border-radius:50%;background:radial-gradient(circle,#ef4444,#991b1b);border:2px solid #fca5a5;box-shadow:0 0 12px rgba(239,68,68,0.7);display:flex;align-items:center;justify-content:center;font-size:12px;">🚨</div>`,
  iconSize: [26, 26], iconAnchor: [13, 13],
});

function FitBounds({ incidents, myPos }: { incidents: any[]; myPos: { lat: number; lng: number } | null }) {
  const map = useMap();
  React.useEffect(() => {
    const pts: L.LatLng[] = incidents.filter(i => i.lat && i.lng).map(i => L.latLng(i.lat, i.lng));
    if (myPos) pts.push(L.latLng(myPos.lat, myPos.lng));
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 13 });
  }, [incidents, myPos, map]);
  return null;
}

export default function VolunteerDashboard() {
  const navigate = useNavigate();
  const userId = sessionStorage.getItem("userId") || "";
  const userName = sessionStorage.getItem("userName") || "Volunteer";
  const authToken = sessionStorage.getItem("authToken") || "";

  const [isOnline, setIsOnline] = React.useState(true);
  const [isSharing, setIsSharing] = React.useState(false);
  const [incidents, setIncidents] = React.useState<any[]>([]);
  const [profile, setProfile] = React.useState<any>(null);
  const [myPos, setMyPos] = React.useState<{ lat: number; lng: number } | null>(null);
  const watchIdRef = React.useRef<number | null>(null);
  const lastSentRef = React.useRef(0);

  // Fetch volunteer profile
  React.useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/volunteer/${userId}/location`)
      .then(r => r.json())
      .then(data => { if (!data.error) setProfile(data); })
      .catch(() => {});
  }, [userId]);

  // Fetch assigned incidents (poll every 10s)
  React.useEffect(() => {
    if (!userId) return;
    const load = () => fetch(`${API_BASE}/api/volunteer/${userId}/incidents`)
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setIncidents(d); }).catch(() => {});
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [userId]);

  // Online/offline toggle
  const handleToggle = async () => {
    const newStatus = isOnline ? "offline" : "available";
    try {
      await fetch(`${API_BASE}/api/volunteer/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ status: newStatus }),
      });
      setIsOnline(v => !v);
    } catch {}
  };

  // GPS watch — starts when online
  React.useEffect(() => {
    if (!isOnline || !navigator.geolocation) {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null; setIsSharing(false); return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setIsSharing(true);
        setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        const now = Date.now();
        if (now - lastSentRef.current < 15_000) return;
        lastSentRef.current = now;
        fetch(`${API_BASE}/api/volunteer/location`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-id": userId, "Authorization": `Bearer ${authToken}` },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      },
      () => setIsSharing(false),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => { if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current); };
  }, [isOnline, userId, authToken]);

  // Advance incident along 4-step flow
  const advanceStatus = async (id: string, newStatus: string) => {
    await fetch(`${API_BASE}/api/incident/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setIncidents(prev => prev.map(i => i._id === id ? { ...i, status: newStatus } : i));
  };

  const activeIncidents = incidents.filter(i => i.status !== "resolved");
  const resolvedIncidents = incidents.filter(i => i.status === "resolved");
  const initials = userName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) || "V";
  const skills: string[] = profile?.skills || [];
  const resolvedCount = profile?.resolved_count ?? resolvedIncidents.length;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-xl px-4 py-3">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            {/* Avatar with online ring */}
            <div className={`relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-black text-white flex-shrink-0 transition-all ${isOnline ? "bg-gradient-to-br from-emerald-500 to-emerald-700 ring-2 ring-emerald-400/50 ring-offset-1 ring-offset-background" : "bg-muted"}`}>
              {initials}
              {isSharing && (
                <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
                  <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-background" />
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-bold leading-none">{userName}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                {isOnline ? (isSharing ? "📍 Live · Sharing GPS" : "🟢 Online · GPS pending") : "⚫ Offline"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <NotificationBell role="volunteer" />
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">{isOnline ? "On" : "Off"}</span>
              <button onClick={handleToggle}
                className={`relative w-11 h-6 rounded-full transition-all duration-300 ${isOnline ? "bg-emerald-500" : "bg-muted"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ${isOnline ? "translate-x-5" : ""}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-5">

        {/* ── Stats Strip ── */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border bg-card/60 p-3 text-center space-y-0.5">
            <p className="text-2xl font-black text-primary">{activeIncidents.length}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Active</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-center space-y-0.5">
            <p className="text-2xl font-black text-emerald-400">{resolvedCount}</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Resolved</p>
          </div>
          <div className={`rounded-xl border p-3 text-center space-y-0.5 transition-colors ${isSharing ? "border-blue-500/30 bg-blue-500/5" : "border-border bg-card/60"}`}>
            <p className={`text-2xl font-black ${isSharing ? "text-blue-400" : "text-muted-foreground"}`}>
              {isSharing ? "●" : "○"}
            </p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">GPS</p>
          </div>
        </div>

        {/* ── Skills chips ── */}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <span key={skill} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {skill}
              </span>
            ))}
          </div>
        )}

        {/* ── Active Assignments ── */}
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Active Assignments ({activeIncidents.length})
          </h2>

          {activeIncidents.length === 0 && (
            <div className="rounded-xl border border-border/40 bg-muted/5 p-8 text-center space-y-3">
              <div className="text-5xl">🛡️</div>
              <p className="text-sm font-bold">All clear — standing by</p>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                No active assignments. Stay online and dispatch will assign you automatically when an incident occurs nearby.
              </p>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${isOnline ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-border bg-muted/10 text-muted-foreground"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                {isOnline ? "Ready for dispatch" : "Go online to receive assignments"}
              </span>
            </div>
          )}

          <div className="space-y-4">
            {activeIncidents.map((inc) => {
              const dist = myPos && inc.lat ? haversineKm(myPos.lat, myPos.lng, inc.lat, inc.lng) : null;
              const eta = dist != null ? Math.max(1, Math.round((dist / 30) * 60)) : null;
              const curIdx = stepIdx(inc.status);
              const next = nextStep(inc.status);

              return (
                <div key={inc._id} className={`rounded-2xl border-2 bg-card/70 p-4 space-y-3.5 transition-all ${sevGlow(inc.severity)}`}>

                  {/* Top: type + location + meta */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-base font-black truncate">{inc.emergency_type}</p>
                      <p className="text-xs text-muted-foreground truncate">📍 {inc.location}</p>
                      <p className="text-[10px] text-muted-foreground">{timeAgo(inc.created_at)} · {inc.people_affected} people</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${sevBadge(inc.severity)}`}>
                        SEV {inc.severity}
                      </span>
                      {dist != null && <span className="text-sm font-black text-primary">{dist.toFixed(1)} km</span>}
                      {eta != null && <span className="text-[10px] text-muted-foreground">~{eta} min ETA</span>}
                    </div>
                  </div>

                  {/* AI Summary */}
                  {inc.summary && (
                    <p className="text-xs text-muted-foreground bg-muted/10 rounded-xl px-3 py-2 border border-border/40 leading-relaxed">
                      {inc.summary}
                    </p>
                  )}

                  {/* 4-step progress bar */}
                  <div className="flex items-start">
                    {STEPS.map((step, i) => (
                      <React.Fragment key={step}>
                        <div className="flex flex-col items-center gap-1" style={{ minWidth: 0 }}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] border-2 transition-all ${
                            i < curIdx ? "bg-emerald-500 border-emerald-400 text-white" :
                            i === curIdx ? "bg-primary border-primary text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]" :
                            "bg-muted/20 border-border/50 text-muted-foreground/40"
                          }`}>
                            {i <= curIdx ? STEP_ICONS[i] : "·"}
                          </div>
                          <p className={`text-[9px] font-semibold text-center leading-tight ${i === curIdx ? "text-primary" : "text-muted-foreground/50"}`}>
                            {STEP_LABELS[i]}
                          </p>
                        </div>
                        {i < STEPS.length - 1 && (
                          <div className={`flex-1 h-0.5 mt-3.5 mx-0.5 rounded-full transition-colors ${i < curIdx ? "bg-emerald-500" : "bg-border/50"}`} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {inc.caller_phone && (
                      <a href={`tel:${inc.caller_phone}`}
                        className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-[11px] font-bold text-emerald-400 hover:bg-emerald-500/25 transition-colors">
                        📞 Call Victim
                      </a>
                    )}
                    <button onClick={() => navigate(`/volunteer/map/${inc._id}`)}
                      className="flex items-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-500/15 px-3 py-2 text-[11px] font-bold text-blue-400 hover:bg-blue-500/25 transition-colors">
                      🗺 Navigate
                    </button>
                    {next && (
                      <button onClick={() => advanceStatus(inc._id, next)}
                        className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition-all active:scale-[0.98] border ${
                          next === "resolved"
                            ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30"
                            : "bg-primary/20 border-primary/40 text-primary hover:bg-primary/30"
                        }`}>
                        {STEP_ICONS[STEPS.indexOf(next as typeof STEPS[number])]} {STEP_LABELS[STEPS.indexOf(next as typeof STEPS[number])]}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Resolved History ── */}
        {resolvedIncidents.length > 0 && (
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Resolved ({resolvedIncidents.length})
            </h2>
            <div className="space-y-1.5">
              {resolvedIncidents.slice(0, 5).map((inc) => (
                <div key={inc._id} className="rounded-xl border border-border/40 bg-muted/5 px-4 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{inc.emergency_type} — {inc.location}</p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(inc.created_at)}</p>
                  </div>
                  <span className="text-emerald-400 text-sm flex-shrink-0">✅</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Coverage Map ── */}
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Coverage Map</h2>
          <div className="rounded-2xl border border-border overflow-hidden h-[300px]">
            <MapContainer center={[22.3, 71.2]} zoom={7} className="h-full w-full" scrollWheelZoom>
              <TileLayer
                attribution='&copy; <a href="https://carto.com">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <FitBounds incidents={activeIncidents} myPos={myPos} />
              {myPos && (
                <>
                  <CircleMarker center={[myPos.lat, myPos.lng]} radius={18}
                    pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.1, weight: 1 }} />
                  <CircleMarker center={[myPos.lat, myPos.lng]} radius={7}
                    pathOptions={{ color: "#fff", fillColor: "#3b82f6", fillOpacity: 1, weight: 2 }}>
                    <Tooltip direction="top" permanent className="!bg-blue-900/90 !border-blue-500/50 !text-blue-200 !text-xs !font-bold">📍 You</Tooltip>
                  </CircleMarker>
                </>
              )}
              {incidents.filter(i => i.lat && i.lng).map((inc) => (
                <Marker key={inc._id} position={[inc.lat, inc.lng]} icon={incidentDivIcon}>
                  <Tooltip direction="top">{inc.emergency_type} · SEV {inc.severity} · {inc.location}</Tooltip>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
