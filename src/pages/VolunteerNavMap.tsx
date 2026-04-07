import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

/* ── pre-arrival checklist items ── */
const CHECKLIST = [
  { id: "gear", label: "Safety gear on" },
  { id: "contact", label: "Contacted caller / victim" },
  { id: "assess", label: "Scene assessed — no immediate threat" },
  { id: "backup", label: "Backup notified if needed" },
];

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const incidentIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:36px;height:36px;border-radius:50%;background:radial-gradient(circle,#ef4444,#991b1b);border:3px solid #fca5a5;box-shadow:0 0 16px rgba(239,68,68,0.8),0 0 30px rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;">🚨</div>`,
  iconSize: [36, 36], iconAnchor: [18, 18],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points.map(p => L.latLng(p[0], p[1]))).pad(0.25), { animate: true, maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
    }
  }, [points, map]);
  return null;
}

const NAV_STEPS = ["assigned", "en_route", "on_scene", "resolved"] as const;
const NAV_STEP_LABELS = ["Assigned", "En Route", "On Scene", "Resolved"];
const NAV_STEP_ICONS = ["📋", "🚗", "📍", "✅"];

function navStepIdx(status: string) { return NAV_STEPS.indexOf(status as typeof NAV_STEPS[number]); }

export default function VolunteerNavMap() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const userId = sessionStorage.getItem("userId") || "";
  const authToken = sessionStorage.getItem("authToken") || "";

  const [incident, setIncident] = React.useState<any>(null);
  const [myPos, setMyPos] = React.useState<{ lat: number; lng: number; speed: number | null; heading: number | null } | null>(null);
  const [status, setStatus] = React.useState("assigned");
  const [resolved, setResolved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Checklist state
  const [showChecklist, setShowChecklist] = React.useState(false);
  const [checked, setChecked] = React.useState<Record<string, boolean>>({});
  const allChecked = CHECKLIST.every(item => checked[item.id]);

  // Fetch incident
  React.useEffect(() => {
    if (!incidentId) return;
    fetch(`${API_BASE}/api/incident/${incidentId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setIncident(data);
        setStatus(data.status || "assigned");
      })
      .catch(() => setError("Failed to load incident"));
  }, [incidentId]);

  // Live GPS
  React.useEffect(() => {
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setMyPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
        });
        fetch(`${API_BASE}/api/volunteer/location`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-user-id": userId, "Authorization": `Bearer ${authToken}` },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [userId, authToken]);

  const patchStatus = async (newStatus: string) => {
    if (!incidentId) return;
    await fetch(`${API_BASE}/api/incident/${incidentId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setStatus(newStatus);
    if (newStatus === "resolved") setResolved(true);
  };

  const distance = incident && myPos ? haversineKm(myPos.lat, myPos.lng, incident.lat, incident.lng) : null;
  const eta = distance != null ? Math.max(1, Math.round((distance / 30) * 60)) : null;
  const speedKmh = myPos?.speed != null && myPos.speed >= 0 ? Math.round(myPos.speed * 3.6) : null;
  const curStepIdx = navStepIdx(status);

  const mapPoints: [number, number][] = [];
  if (incident?.lat) mapPoints.push([incident.lat, incident.lng]);
  if (myPos) mapPoints.push([myPos.lat, myPos.lng]);

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <p className="text-destructive">{error}</p>
    </div>
  );

  if (!incident) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Loading incident…</div>
    </div>
  );

  if (resolved) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center space-y-5">
      <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center">
        <svg className="w-12 h-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-emerald-400">Incident Resolved</h1>
        <p className="text-sm text-muted-foreground">Outstanding work. You made a difference today.</p>
      </div>
      <button onClick={() => navigate("/volunteer")}
        className="rounded-xl bg-emerald-500/20 border border-emerald-500/40 px-8 py-3 text-sm font-bold text-emerald-400 hover:bg-emerald-500/30 transition-colors">
        ← Back to Dashboard
      </button>
    </div>
  );

  return (
    <div className="h-screen w-full flex flex-col relative overflow-hidden">

      {/* ── Floating top-left: Back ── */}
      <button onClick={() => navigate("/volunteer")}
        className="absolute top-4 left-4 z-[1001] rounded-xl bg-card/90 backdrop-blur-md border border-border px-3 py-2 text-xs font-semibold shadow-lg hover:bg-card transition-colors">
        ← Back
      </button>

      {/* ── Floating HUD (top right) ── */}
      <div className="absolute top-4 right-4 z-[1001] flex flex-col gap-2 items-end">
        {/* Distance + ETA */}
        {distance != null && (
          <div className="rounded-xl bg-card/90 backdrop-blur-md border border-border px-3 py-2 shadow-lg text-right">
            <p className="text-xl font-black text-primary leading-none">{distance.toFixed(1)} km</p>
            <p className="text-[10px] text-muted-foreground font-bold mt-0.5">{eta} min ETA</p>
          </div>
        )}
        {/* Speed */}
        {speedKmh != null && (
          <div className="rounded-xl bg-card/90 backdrop-blur-md border border-border px-3 py-1.5 shadow-lg text-right">
            <p className="text-sm font-black text-blue-400 leading-none">{speedKmh} <span className="text-[9px] text-muted-foreground">km/h</span></p>
          </div>
        )}
        {/* Heading arrow */}
        {myPos?.heading != null && (
          <div className="rounded-full bg-card/90 backdrop-blur-md border border-border w-9 h-9 flex items-center justify-center shadow-lg"
            style={{ transform: `rotate(${myPos.heading}deg)` }}>
            <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L4 20l8-4 8 4L12 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* ── Floating SOS button ── */}
      <a href="tel:112"
        className="absolute bottom-[260px] right-4 z-[1001] w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 border-2 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] flex items-center justify-center transition-all active:scale-95"
        title="Emergency SOS — calls 112">
        <span className="text-white text-[10px] font-black leading-none">SOS</span>
      </a>

      {/* ── Fullscreen Map ── */}
      <div className="flex-1">
        <MapContainer center={[incident.lat, incident.lng]} zoom={13} className="h-full w-full z-0" scrollWheelZoom zoomControl={false}>
          <TileLayer attribution='&copy; <a href="https://carto.com">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <FitBounds points={mapPoints} />
          <Marker position={[incident.lat, incident.lng]} icon={incidentIcon}>
            <Tooltip direction="top" permanent className="!font-semibold !text-xs">🚨 {incident.emergency_type}</Tooltip>
          </Marker>
          {myPos && (
            <>
              <CircleMarker center={[myPos.lat, myPos.lng]} radius={18}
                pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.14, weight: 1 }} />
              <CircleMarker center={[myPos.lat, myPos.lng]} radius={8}
                pathOptions={{ color: "#fff", fillColor: "#3b82f6", fillOpacity: 1, weight: 3 }}>
                <Tooltip direction="top" permanent className="!font-semibold !text-xs">📍 You</Tooltip>
              </CircleMarker>
              <Polyline
                positions={[[myPos.lat, myPos.lng], [incident.lat, incident.lng]]}
                pathOptions={{ color: "#3b82f6", weight: 3, dashArray: "8 8", opacity: 0.75 }}
              />
            </>
          )}
        </MapContainer>
      </div>

      {/* ── Pre-arrival Checklist Overlay ── */}
      {showChecklist && (
        <div className="absolute inset-0 z-[1002] bg-black/60 backdrop-blur-sm flex items-end">
          <div className="w-full bg-card border-t border-border rounded-t-3xl p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">Pre-Arrival Checklist</h3>
              <button onClick={() => setShowChecklist(false)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            <p className="text-xs text-muted-foreground">Complete all items before marking the incident as resolved.</p>
            <div className="space-y-2">
              {CHECKLIST.map(item => (
                <button key={item.id}
                  onClick={() => setChecked(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium text-left transition-all ${checked[item.id] ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-border bg-muted/10 text-foreground hover:bg-muted/20"}`}>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${checked[item.id] ? "border-emerald-500 bg-emerald-500" : "border-border"}`}>
                    {checked[item.id] && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { if (allChecked) { setShowChecklist(false); patchStatus("resolved"); } }}
              disabled={!allChecked}
              className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98]">
              {allChecked ? "✅ Mark Resolved" : `Complete all ${CHECKLIST.length - Object.values(checked).filter(Boolean).length} remaining items`}
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom Sheet ── */}
      <div className="border-t border-border bg-card/95 backdrop-blur-xl p-4 pb-6">
        <div className="max-w-lg mx-auto space-y-3">

          {/* Incident header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black">{incident.emergency_type}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  incident.severity >= 4 ? "bg-red-500/20 text-red-400 border-red-500/40" :
                  incident.severity === 3 ? "bg-amber-500/20 text-amber-400 border-amber-500/40" :
                  "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                }`}>SEV {incident.severity}</span>
              </div>
              <p className="text-xs text-muted-foreground">{incident.location}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-muted-foreground">People</p>
              <p className="text-xl font-black text-primary">{incident.people_affected || "—"}</p>
            </div>
          </div>

          {/* 4-step progress */}
          <div className="flex items-start">
            {NAV_STEPS.map((step, i) => (
              <React.Fragment key={step}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border-2 transition-all ${
                    i < curStepIdx ? "bg-emerald-500 border-emerald-400 text-white" :
                    i === curStepIdx ? "bg-primary border-primary text-white shadow-[0_0_10px_rgba(59,130,246,0.4)]" :
                    "bg-muted/20 border-border/50 text-muted-foreground/40"
                  }`}>
                    {i <= curStepIdx ? NAV_STEP_ICONS[i] : "·"}
                  </div>
                  <p className={`text-[9px] font-semibold ${i === curStepIdx ? "text-primary" : "text-muted-foreground/50"}`}>
                    {NAV_STEP_LABELS[i]}
                  </p>
                </div>
                {i < NAV_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mt-3.5 mx-0.5 rounded-full ${i < curStepIdx ? "bg-emerald-500" : "bg-border/50"}`} />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Caller call button */}
          {incident.caller_phone && (
            <a href={`tel:${incident.caller_phone}`}
              className="flex items-center justify-between rounded-xl border border-border bg-muted/10 px-4 py-2.5 hover:bg-muted/20 transition-colors">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Caller</p>
                <p className="text-sm font-bold">{incident.caller_phone}</p>
              </div>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-bold text-emerald-400">
                📞 Call
              </span>
            </a>
          )}

          {/* Action buttons based on current status */}
          <div className="flex gap-2">
            {status === "assigned" && (
              <button onClick={() => patchStatus("en_route")}
                className="flex-1 rounded-xl bg-primary/20 border border-primary/40 py-3 text-sm font-bold text-primary hover:bg-primary/30 transition-all active:scale-[0.98]">
                🚗 Accept & En Route
              </button>
            )}
            {status === "en_route" && (
              <button onClick={() => patchStatus("on_scene")}
                className="flex-1 rounded-xl bg-amber-500/20 border border-amber-500/40 py-3 text-sm font-bold text-amber-400 hover:bg-amber-500/30 transition-all active:scale-[0.98]">
                📍 Mark Arrived
              </button>
            )}
            {status === "on_scene" && (
              <button onClick={() => setShowChecklist(true)}
                className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]">
                ✅ Mark Resolved
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
