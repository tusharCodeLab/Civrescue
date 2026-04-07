import * as React from "react";
import { useParams } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

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
  html: `<div style="
    width:38px;height:38px;border-radius:50%;
    background:radial-gradient(circle,#ef4444,#991b1b);
    border:3px solid #fca5a5;
    box-shadow:0 0 18px rgba(239,68,68,0.8),0 0 35px rgba(239,68,68,0.4);
    display:flex;align-items:center;justify-content:center;
    font-size:18px;line-height:1;
  ">🚨</div>`,
  iconSize: [38, 38], iconAnchor: [19, 19],
});

const volunteerIcon = new L.DivIcon({
  className: "",
  html: `<div style="position:relative;width:44px;height:44px;">
    <div style="
      position:absolute;inset:0;border-radius:50%;
      background:rgba(59,130,246,0.25);
      animation:ping 1.5s cubic-bezier(0,0,.2,1) infinite;
    "></div>
    <div style="
      position:absolute;inset:6px;border-radius:50%;
      background:radial-gradient(circle,#3b82f6,#1d4ed8);
      border:3px solid #93c5fd;
      box-shadow:0 0 16px rgba(59,130,246,0.9);
      display:flex;align-items:center;justify-content:center;
      font-size:14px;line-height:1;
    ">🚑</div>
  </div>
  <style>@keyframes ping{75%,100%{transform:scale(2.2);opacity:0}}</style>`,
  iconSize: [44, 44], iconAnchor: [22, 22],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (points.length >= 2) {
      // Swiggy style - focus clearly on the path between both
      map.flyToBounds(L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng))).pad(0.35), { duration: 1.5, maxZoom: 15 });
    } else if (points.length === 1) {
      map.flyTo(points[0], 14, { duration: 1.5 });
    }
  }, [points, map]);
  return null;
}

// Global scope injection for animated dashed line
if (typeof document !== "undefined") {
  const style = document.createElement('style');
  style.innerHTML = `
    .animated-route-path {
      animation: dash-move 20s linear infinite;
    }
    @keyframes dash-move {
      to {
        stroke-dashoffset: -1000;
      }
    }
  `;
  document.head.appendChild(style);
}

const TIMELINE_STEPS = [
  { key: "unassigned", label: "Received", icon: "📩" },
  { key: "triaged", label: "Triaged", icon: "🔍" },
  { key: "assigned", label: "Volunteer Assigned", icon: "👤" },
  { key: "en_route", label: "Help On The Way", icon: "🚑" },
  { key: "resolved", label: "Resolved", icon: "✅" },
] as const;

function getActiveStep(status: string): number {
  if (status === "resolved") return 4;
  if (status === "en_route" || status === "active") return 3;
  if (status === "assigned") return 2;
  if (status === "triaged") return 1;
  return 0;
}

export default function VictimTrackPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const [incident, setIncident] = React.useState<any>(null);
  const [volunteer, setVolunteer] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Poll incident every 5s
  React.useEffect(() => {
    if (!incidentId) return;
    const fetchData = async () => {
      try {
        const incRes = await fetch(`${API_BASE}/api/incident/${incidentId}`);
        const incData = await incRes.json();
        if (incData.error) { setError(incData.error); return; }
        setIncident(incData);

        if (incData.assigned_volunteer_id) {
          const volRes = await fetch(`${API_BASE}/api/volunteer/${incData.assigned_volunteer_id}/location`);
          const volData = await volRes.json();
          if (!volData.error) setVolunteer(volData);
        }
      } catch { setError("Connection lost. Retrying..."); }
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [incidentId]);

  const activeStep = incident ? getActiveStep(incident.status) : 0;

  const distance = incident && volunteer?.current_lat
    ? haversineKm(incident.lat, incident.lng, volunteer.current_lat, volunteer.current_lng) : null;
  const eta = distance != null ? Math.max(1, Math.round((distance / 30) * 60)) : null;

  const mapPoints: [number, number][] = [];
  if (incident) mapPoints.push([incident.lat, incident.lng]);
  if (volunteer?.current_lat) mapPoints.push([volunteer.current_lat, volunteer.current_lng]);

  if (error && !incident) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading incident…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b border-border bg-card/50 backdrop-blur">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">CivRescue Tracking</p>
        <h1 className="text-lg font-black truncate">{incident.emergency_type} — {incident.location}</h1>
        <p className="text-xs text-muted-foreground">ID: {incident._id}</p>
      </div>

      {/* Status Timeline */}
      <div className="px-4 py-4 bg-card/30 border-b border-border">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {TIMELINE_STEPS.map((step, i) => {
            const isActive = i === activeStep;
            const isDone = i < activeStep;
            return (
              <React.Fragment key={step.key}>
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all
                    ${isDone ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : ""}
                    ${isActive ? "bg-primary/20 border-primary text-primary ring-4 ring-primary/20 scale-110" : ""}
                    ${!isDone && !isActive ? "bg-muted/20 border-border text-muted-foreground opacity-50" : ""}
                  `}>
                    {isDone ? "✓" : step.icon}
                  </div>
                  <p className={`text-[9px] font-bold uppercase tracking-wider text-center leading-tight max-w-[60px]
                    ${isActive ? "text-primary" : isDone ? "text-emerald-400" : "text-muted-foreground/50"}
                  `}>{step.label}</p>
                </div>
                {i < TIMELINE_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 rounded ${i < activeStep ? "bg-emerald-500" : "bg-border"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative min-h-[400px] w-full" style={{ height: "calc(100vh - 280px)" }}>
        {/* LIVE badge overlay */}
        {volunteer?.current_lat && (
          <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-blue-600/90 backdrop-blur border border-blue-400/50 px-3 py-1.5 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative rounded-full h-2 w-2 bg-white" />
            </span>
            <span className="text-[11px] font-bold text-white tracking-widest">LIVE</span>
          </div>
        )}
        <MapContainer center={[incident.lat, incident.lng]} zoom={13} style={{ height: "100%", width: "100%", zIndex: 0 }} scrollWheelZoom zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <FitBounds points={mapPoints} />

          {/* Dashed animated route line */}
          {mapPoints.length === 2 && (
            <Polyline
              positions={mapPoints}
              pathOptions={{ className: 'animated-route-path', color: "#3b82f6", weight: 4, opacity: 0.9, dashArray: "15, 15", lineCap: "round" }}
            />
          )}

          <Marker position={[incident.lat, incident.lng]} icon={incidentIcon}>
            <Tooltip direction="top" permanent
              className="!bg-red-900/90 !border-red-500/60 !text-red-200 !font-bold !text-xs !px-2 !py-1 !rounded-lg">
              🚨 {incident.emergency_type}
            </Tooltip>
          </Marker>

          {volunteer?.current_lat && (
            <Marker position={[volunteer.current_lat, volunteer.current_lng]} icon={volunteerIcon}>
              <Tooltip direction="top" permanent
                className="!bg-blue-900/90 !border-blue-500/60 !text-blue-200 !font-bold !text-xs !px-2 !py-1 !rounded-lg">
                🚗 {volunteer.name || volunteer.full_name}
              </Tooltip>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Bottom Card */}
      <div className="border-t border-border bg-card/95 backdrop-blur-xl p-4">
        {volunteer ? (
          <div className="max-w-lg mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Assigned Volunteer</p>
                <p className="text-lg font-bold">{volunteer.name || volunteer.full_name}</p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/30 px-3 py-1">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute h-full w-full rounded-full bg-blue-500 opacity-75" />
                  <span className="relative rounded-full h-2 w-2 bg-blue-500" />
                </span>
                <span className="text-xs font-bold text-blue-500">LIVE</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/40 border-b-2 border-primary/40 p-3 text-center transition-all hover:bg-muted/60">
                <p className="text-2xl font-black text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">{distance?.toFixed(1) ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">km away</p>
              </div>
              <div className={`rounded-xl border-b-2 p-3 text-center transition-all ${eta != null && eta <= 5 ? "bg-emerald-500/10 border-emerald-500/50" : "bg-muted/40 border-primary/40"}`}>
                <p className={`text-2xl font-black drop-shadow-[0_0_8px_currentColor] ${eta != null && eta <= 5 ? "text-emerald-400" : "text-primary"}`}>{eta ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">{eta != null && eta <= 5 ? "Arriving Very Soon" : "Minutes ETA"}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground animate-pulse">
            {incident.status === "unassigned" ? "Finding nearest volunteer…" : "Waiting for volunteer location…"}
          </p>
        )}
      </div>
    </div>
  );
}
