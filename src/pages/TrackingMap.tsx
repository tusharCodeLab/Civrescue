import * as React from "react";
import { useParams } from "react-router-dom";
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";

// ---- Haversine (km) ----
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const incidentIcon = new L.DivIcon({
  className: "",
  html: `<div style="width:38px;height:38px;border-radius:50%;background:radial-gradient(circle,#ef4444,#991b1b);border:3px solid #fca5a5;box-shadow:0 0 18px rgba(239,68,68,0.8),0 0 35px rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;">🚨</div>`,
  iconSize: [38, 38], iconAnchor: [19, 19],
});

const volunteerIcon = new L.DivIcon({
  className: "",
  html: `<div style="position:relative;width:44px;height:44px;"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(59,130,246,0.25);animation:ping 1.5s cubic-bezier(0,0,.2,1) infinite;"></div><div style="position:absolute;inset:6px;border-radius:50%;background:radial-gradient(circle,#3b82f6,#1d4ed8);border:3px solid #93c5fd;box-shadow:0 0 16px rgba(59,130,246,0.9);display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;">🚑</div></div><style>@keyframes ping{75%,100%{transform:scale(2.2);opacity:0}}</style>`,
  iconSize: [44, 44], iconAnchor: [22, 22],
});

// ---- Auto-fit bounds helper ----
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (points.length >= 2) {
      const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
      map.fitBounds(bounds.pad(0.3), { animate: true, maxZoom: 14 });
    } else if (points.length === 1) {
      map.setView(points[0], 13, { animate: true });
    }
  }, [points, map]);
  return null;
}

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

interface VolunteerLocation {
  name: string;
  phone: string;
  current_lat: number;
  current_lng: number;
  status: string;
}

export default function TrackingMapPage() {
  const { incidentId } = useParams<{ incidentId: string }>();

  // Incident data from query params (passed via navigation state or fetched)
  const [incident, setIncident] = React.useState<{
    title: string;
    lat: number;
    lng: number;
    severity: number;
    emergency_type: string;
    location: string;
    assigned_volunteer_id: string | null;
  } | null>(null);

  const [volunteer, setVolunteer] = React.useState<VolunteerLocation | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch incident data on mount
  React.useEffect(() => {
    if (!incidentId) return;
    fetch(`${API_BASE}/api/incident/${incidentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setIncident(data);
      })
      .catch(() => setError("Failed to load incident"));
  }, [incidentId]);

  // Poll volunteer location every 5 seconds
  React.useEffect(() => {
    if (!incident?.assigned_volunteer_id) return;

    const fetchLocation = () => {
      fetch(`${API_BASE}/api/volunteer/${incident.assigned_volunteer_id}/location`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.error) setVolunteer(data);
        })
        .catch(() => {});
    };

    fetchLocation(); // initial
    const interval = setInterval(fetchLocation, 5000);
    return () => clearInterval(interval);
  }, [incident?.assigned_volunteer_id]);

  // Compute distance & ETA
  const distance =
    incident && volunteer
      ? haversineKm(incident.lat, incident.lng, volunteer.current_lat, volunteer.current_lng)
      : null;
  const etaMinutes = distance != null ? Math.round((distance / 30) * 60) : null; // 30 km/h

  const mapPoints: [number, number][] = [];
  if (incident) mapPoints.push([incident.lat, incident.lng]);
  if (volunteer) mapPoints.push([volunteer.current_lat, volunteer.current_lng]);

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-destructive">
        <p className="text-lg">{error}</p>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading incident data…</div>
      </div>
    );
  }

  return (
    <div className="relative h-screen w-full">
      {/* Fullscreen Leaflet Map */}
      <MapContainer
        center={[incident.lat, incident.lng]}
        zoom={13}
        className="h-full w-full z-0"
        scrollWheelZoom
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <FitBounds points={mapPoints} />

        {/* Dashed route line */}
        {mapPoints.length === 2 && (
          <Polyline positions={mapPoints} pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.85, dashArray: "10 8" }} />
        )}

        {/* Incident – Glowing Red Icon */}
        <Marker position={[incident.lat, incident.lng]} icon={incidentIcon}>
          <Tooltip direction="top" permanent
            className="!bg-red-900/90 !border-red-500/60 !text-red-200 !font-bold !text-xs !px-2 !py-1 !rounded-lg">
            🚨 {incident.emergency_type || incident.title}
          </Tooltip>
        </Marker>

        {/* Volunteer – Pulsing Blue Icon */}
        {volunteer && (
          <Marker position={[volunteer.current_lat, volunteer.current_lng]} icon={volunteerIcon}>
            <Tooltip direction="top" permanent
              className="!bg-blue-900/90 !border-blue-500/60 !text-blue-200 !font-bold !text-xs !px-2 !py-1 !rounded-lg">
              � {volunteer.name || (volunteer as any).full_name}
            </Tooltip>
          </Marker>
        )}
      </MapContainer>

      {/* Top-left badge */}
      <div className="absolute top-4 left-4 z-[1000] rounded-lg border border-border bg-card/90 backdrop-blur px-4 py-2 shadow-lg">
        <p className="text-xs font-bold text-primary uppercase tracking-wider">Live Tracking</p>
        <p className="text-sm font-semibold">{incident.title}</p>
      </div>

      {/* Bottom Info Card */}
      <div className="absolute bottom-0 inset-x-0 z-[1000]">
        <div className="mx-auto max-w-lg rounded-t-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-5">
          {volunteer ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                    Assigned Volunteer
                  </p>
                  <p className="text-lg font-bold">{volunteer.name || (volunteer as any).full_name}</p>
                  <p className="text-xs text-muted-foreground">{volunteer.phone}</p>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 border border-blue-500/30 px-3 py-1">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                    <span className="text-xs font-bold text-blue-500">LIVE</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/30 border border-border/50 p-3 text-center">
                  <p className="text-2xl font-black text-primary">
                    {distance != null ? distance.toFixed(1) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                    km away
                  </p>
                </div>
                <div className="rounded-xl bg-muted/30 border border-border/50 p-3 text-center">
                  <p className="text-2xl font-black text-primary">
                    {etaMinutes != null ? (etaMinutes < 1 ? "<1" : etaMinutes) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                    min ETA @ 30km/h
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
                <span className="text-emerald-500 text-sm">✓</span>
                <p className="text-xs text-emerald-500 font-medium">
                  Severity {incident.severity}/5 · {incident.emergency_type} · {incident.location}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="animate-pulse text-muted-foreground text-sm">
                {incident.assigned_volunteer_id
                  ? "Waiting for volunteer location…"
                  : "No volunteer assigned yet"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
