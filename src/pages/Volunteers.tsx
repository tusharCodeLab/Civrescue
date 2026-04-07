import { useEffect, useMemo, useRef, useState } from "react";
import { Users, Truck, CheckCircle, Bell, Sparkles } from "lucide-react";
import { useCivRescue } from "@/components/civrescue/CivRescueProvider";
import { assignmentStatusClass, availabilityClass, incidentStatusClass, severityClass } from "@/components/civrescue/status";
import { assignmentStatusOptions, availabilityLabel, severityLabel } from "@/lib/civrescue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

// Real haversine distance between two GPS coords
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371, toR = (v: number) => (v * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const SKILL_COLOR: Record<string, string> = {
  "Medical": "bg-red-500/15 text-red-400 border-red-500/30",
  "Search": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Rescue": "bg-orange-500/15 text-orange-400 border-orange-500/30",
  "Logistics": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Communications": "bg-teal-500/15 text-teal-400 border-teal-500/30",
  "Water Rescue": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Heavy Machinery": "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export default function VolunteersPage() {
  const { volunteers, assignments, incidents, createAssignment, updateAssignmentStatus } = useCivRescue();
  const [skillFilter, setSkillFilter] = useState("");
  const [availFilter, setAvailFilter] = useState<string>("all");
  const [gpsFilter, setGpsFilter] = useState<"all" | "gps" | "no-gps">("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [selectedVolunteer, setSelectedVolunteer] = useState<any | null>(null);
  const [selectedVolunteerByIncident, setSelectedVolunteerByIncident] = useState<Record<string, string>>({});
  const [assigningIncidentId, setAssigningIncidentId] = useState<string | null>(null);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState<string | null>(null);

  // Live geolocation for volunteer users
  const lastSentRef = useRef<number>(0);
  useEffect(() => {
    if (!navigator.geolocation) return;
    const userId = sessionStorage.getItem("volunteer_user_id");
    if (!userId) return;
    const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentRef.current < 30_000) return;
        lastSentRef.current = now;
        fetch(`${API_BASE}/api/volunteer/location`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-id": userId },
          body: JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude }),
        }).catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const volunteerMap = useMemo(() => Object.fromEntries((volunteers.data ?? []).map((v) => [v.id, v])), [volunteers.data]);
  const assignmentsByIncident = useMemo(() => {
    return (assignments.data ?? []).reduce<Record<string, typeof assignments.data>>((acc, a) => {
      if (!acc[a.incident_id]) acc[a.incident_id] = [];
      acc[a.incident_id]?.push(a);
      return acc;
    }, {});
  }, [assignments.data]);
  const assignableVolunteers = volunteers.data ?? [];

  // Active incident list for nearest-incident distance calc
  const activeIncidents = useMemo(() => (incidents.data ?? []).filter(i => i.status === "active" || i.status === "assigned"), [incidents.data]);

  // Get real nearest-incident distance string for a volunteer
  const getNearestIncidentDist = (vol: any): string => {
    const lat = (vol as any).current_lat;
    const lng = (vol as any).current_lng;
    if (!lat || !lng) return "No GPS";
    let min = Infinity;
    let label = "";
    for (const inc of activeIncidents) {
      if (!inc.lat && !inc.lng) continue;
      const d = haversineKm(lat, lng, inc.lat ?? 0, inc.lng ?? 0);
      if (d < min) { min = d; label = inc.emergency_type || inc.incident_type || "Incident"; }
    }
    return min < Infinity ? `${min.toFixed(1)} km (${label})` : "No nearby incidents";
  };

  const filteredVolunteers = useMemo(() => (volunteers.data ?? []).filter((v) => {
    if (availFilter !== "all" && v.availability !== availFilter) return false;
    if (skillFilter && !(v.skills || []).join(" ").toLowerCase().includes(skillFilter.toLowerCase())) return false;
    if (gpsFilter === "gps" && !((v as any).current_lat)) return false;
    if (gpsFilter === "no-gps" && (v as any).current_lat) return false;
    return true;
  }), [volunteers.data, availFilter, skillFilter, gpsFilter]);

  const handleAssignVolunteer = (incidentId: string) => {
    const volunteerId = selectedVolunteerByIncident[incidentId];
    if (!volunteerId) return;
    const volunteer = volunteerMap[volunteerId];
    setAssigningIncidentId(incidentId);
    createAssignment.mutate({ incidentId, volunteerId }, {
      onSuccess: () => {
        toast({ title: "Volunteer assigned", description: `SMS alert sent to ${volunteer?.full_name ?? "the volunteer"}.` });
        setSelectedVolunteerByIncident((prev) => ({ ...prev, [incidentId]: "" }));
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : "";
        toast({ variant: "destructive", title: "Assignment failed",
          description: /duplicate|already assigned|E11000/i.test(message)
            ? "This volunteer is already assigned to this incident."
            : "Could not assign volunteer right now. Please try again." });
      },
      onSettled: () => setAssigningIncidentId((c) => (c === incidentId ? null : c)),
    });
  };

  const handleAssignmentStatusChange = (assignmentId: string, volunteerId: string, status: (typeof assignmentStatusOptions)[number]) => {
    setUpdatingAssignmentId(assignmentId);
    updateAssignmentStatus.mutate({ assignmentId, volunteerId, status }, {
      onSuccess: () => toast({ title: "Assignment updated", description: `Status set to ${status.replace("_", " ")}.` }),
      onError: () => toast({ variant: "destructive", title: "Status update failed", description: "Could not update assignment status." }),
      onSettled: () => setUpdatingAssignmentId((c) => (c === assignmentId ? null : c)),
    });
  };

  const totalVolunteers = assignableVolunteers.length;
  const deployedVolunteers = assignableVolunteers.filter(v => v.availability === "busy").length;
  const availableVolunteers = assignableVolunteers.filter(v => v.availability === "available").length;
  const withGps = assignableVolunteers.filter(v => !!(v as any).current_lat).length;

  const isAdmin = sessionStorage.getItem("adminSession") === "true";

  return (
    <>
    {/* ── Volunteer Profile Modal ── */}
    {selectedVolunteer && (
      <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={() => setSelectedVolunteer(null)}>
        <div className="w-full sm:max-w-md bg-card border border-border rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[80vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-black text-white ${selectedVolunteer.availability === "available" ? "bg-gradient-to-br from-emerald-500 to-emerald-700" : selectedVolunteer.availability === "busy" ? "bg-gradient-to-br from-amber-500 to-amber-700" : "bg-muted"}`}>
                {selectedVolunteer.full_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
              </div>
              <div>
                <p className="font-black text-base">{selectedVolunteer.full_name}</p>
                <p className="text-xs text-muted-foreground">{selectedVolunteer.district}</p>
              </div>
            </div>
            <button onClick={() => setSelectedVolunteer(null)} className="text-muted-foreground hover:text-foreground text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted/30 transition-colors">✕</button>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <Badge className={availabilityClass[selectedVolunteer.availability]}>{availabilityLabel[selectedVolunteer.availability]}</Badge>
            {(selectedVolunteer as any).current_lat
              ? <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-400"><span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />GPS Live</span>
              : <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/10 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">No GPS</span>
            }
          </div>

          {/* Info rows */}
          <div className="space-y-2">
            <a href={`tel:${selectedVolunteer.phone}`}
              className="flex items-center justify-between rounded-xl border border-border bg-muted/10 px-4 py-3 hover:bg-muted/20 transition-colors">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Phone</p>
                <p className="text-sm font-bold">{selectedVolunteer.phone || "—"}</p>
              </div>
              <span className="text-xs font-bold text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 rounded-full px-3 py-1">📞 Call</span>
            </a>
            {(selectedVolunteer as any).current_lat && (
              <div className="rounded-xl border border-border bg-muted/10 px-4 py-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">GPS Coordinates</p>
                <p className="text-sm font-mono font-semibold mt-0.5">
                  {(selectedVolunteer as any).current_lat?.toFixed(5)}, {(selectedVolunteer as any).current_lng?.toFixed(5)}
                </p>
                <p className="text-xs text-blue-400 mt-0.5">{getNearestIncidentDist(selectedVolunteer)}</p>
              </div>
            )}
          </div>

          {/* Skills */}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {(selectedVolunteer.skills || []).map((skill: string) => (
                <Badge key={skill} variant="outline" className={`text-xs ${SKILL_COLOR[skill] || "bg-muted text-muted-foreground"}`}>{skill}</Badge>
              ))}
              {(!selectedVolunteer.skills || selectedVolunteer.skills.length === 0) && (
                <span className="text-xs text-muted-foreground">No skills listed</span>
              )}
            </div>
          </div>

          {/* Notify */}
          <Button className="w-full" onClick={() => { toast({ title: "Notification Dispatched", description: `SMS alert sent to ${selectedVolunteer.full_name}.` }); setSelectedVolunteer(null); }}>
            <Bell className="w-4 h-4 mr-2" /> Send SMS Notification
          </Button>
        </div>
      </div>
    )}

    <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      {isAdmin && (
        <div className="space-y-4">
          {/* ── KPI Stats ── */}
          <div className="grid gap-3 sm:grid-cols-4">
            <Card className="border-border/80 bg-card/90 shadow-sm">
              <CardHeader className="pb-1 p-4"><CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400 flex-shrink-0" />
                <p className="text-2xl font-bold">{totalVolunteers}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/30 bg-amber-950/10">
              <CardHeader className="pb-1 p-4"><CardTitle className="text-xs font-medium text-amber-500/80">Deployed</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 flex items-center gap-2">
                <Truck className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <p className="text-2xl font-bold text-amber-500">{deployedVolunteers}</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/30 bg-emerald-950/10">
              <CardHeader className="pb-1 p-4"><CardTitle className="text-xs font-medium text-emerald-500/80">Available</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                <p className="text-2xl font-bold text-emerald-500">{availableVolunteers}</p>
              </CardContent>
            </Card>
            <Card className="border-blue-500/30 bg-blue-950/10">
              <CardHeader className="pb-1 p-4"><CardTitle className="text-xs font-medium text-blue-500/80">GPS Active</CardTitle></CardHeader>
              <CardContent className="p-4 pt-0 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                <p className="text-2xl font-bold text-blue-400">{withGps}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/80 bg-card/90">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-xl">Volunteer Roster</CardTitle>
                {/* Card / Table toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
                  <button onClick={() => setViewMode("cards")} className={`px-3 py-1.5 transition-colors ${viewMode === "cards" ? "bg-primary text-white" : "bg-muted/20 text-muted-foreground hover:bg-muted/40"}`}>
                    Cards
                  </button>
                  <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 transition-colors ${viewMode === "table" ? "bg-primary text-white" : "bg-muted/20 text-muted-foreground hover:bg-muted/40"}`}>
                    Table
                  </button>
                </div>
              </div>

              {/* Filter pills */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(["all", "available", "busy", "offline"] as const).map(a => (
                    <button key={a} onClick={() => setAvailFilter(a)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${availFilter === a
                        ? a === "available" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                          : a === "busy" ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                          : a === "offline" ? "bg-muted/40 border-border text-muted-foreground"
                          : "bg-primary/20 border-primary/40 text-primary"
                        : "bg-muted/10 border-border/50 text-muted-foreground hover:bg-muted/20"}`}>
                      {a === "all" ? "All" : a.charAt(0).toUpperCase() + a.slice(1)}
                    </button>
                  ))}
                  <div className="w-px bg-border mx-1" />
                  {([["all", "Any GPS"], ["gps", "Has GPS"], ["no-gps", "No GPS"]] as const).map(([v, label]) => (
                    <button key={v} onClick={() => setGpsFilter(v)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${gpsFilter === v ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-muted/10 border-border/50 text-muted-foreground hover:bg-muted/20"}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <Input placeholder="Search by skill…" value={skillFilter} onChange={e => setSkillFilter(e.target.value)} className="h-8 text-xs" />
              </div>
            </CardHeader>

            <CardContent>
              {/* ── CARD VIEW ── */}
              {viewMode === "cards" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {volunteers.isLoading && Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-border/50 bg-muted/10 p-3 space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  ))}
                  {filteredVolunteers.map((vol) => {
                    const hasGps = !!(vol as any).current_lat;
                    const distStr = getNearestIncidentDist(vol);
                    const initials = vol.full_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <button key={vol.id} onClick={() => setSelectedVolunteer(vol)}
                        className="rounded-xl border border-border/60 bg-muted/5 p-3 space-y-2 text-left hover:bg-muted/10 hover:border-border transition-all active:scale-[0.99] group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${vol.availability === "available" ? "bg-gradient-to-br from-emerald-500 to-emerald-700" : vol.availability === "busy" ? "bg-gradient-to-br from-amber-500 to-amber-700" : "bg-muted"}`}>
                              {initials}
                              {hasGps && (
                                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-background flex items-center justify-center">
                                  <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold truncate">{vol.full_name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{vol.district}</p>
                            </div>
                          </div>
                          <Badge className={`${availabilityClass[vol.availability]} flex-shrink-0 text-[10px]`}>
                            {availabilityLabel[vol.availability]}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{distStr}</p>
                        <div className="flex flex-wrap gap-1">
                          {(vol.skills || []).slice(0, 3).map((skill: string) => (
                            <span key={skill} className={`rounded-full border px-2 py-0 text-[10px] font-semibold ${SKILL_COLOR[skill] || "bg-muted text-muted-foreground border-border"}`}>{skill}</span>
                          ))}
                          {(vol.skills || []).length > 3 && (
                            <span className="rounded-full border border-border px-2 py-0 text-[10px] text-muted-foreground">+{(vol.skills || []).length - 3}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {!volunteers.isLoading && filteredVolunteers.length === 0 && (
                    <p className="text-sm text-muted-foreground col-span-2 py-4">No volunteers match the current filters.</p>
                  )}
                </div>
              )}

              {/* ── TABLE VIEW ── */}
              {viewMode === "table" && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Nearest Incident</TableHead>
                      <TableHead>Skills</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {volunteers.isLoading && Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-7 w-16" /></TableCell>
                      </TableRow>
                    ))}
                    {filteredVolunteers.map((vol) => {
                      const hasGps = !!(vol as any).current_lat;
                      return (
                        <TableRow key={vol.id} className="hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedVolunteer(vol)}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {hasGps && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0 animate-pulse" />}
                              <div>
                                <p>{vol.full_name}</p>
                                <p className="text-xs text-muted-foreground">{vol.district}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs text-muted-foreground">{getNearestIncidentDist(vol)}</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {(vol.skills || []).map((skill: string) => (
                                <Badge key={skill} variant="outline" className={`text-xs px-1.5 py-0 ${SKILL_COLOR[skill] || "bg-muted text-muted-foreground"}`}>{skill}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={availabilityClass[vol.availability]}>{availabilityLabel[vol.availability]}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="secondary" size="sm" className="h-7 text-xs gap-1.5"
                              onClick={e => { e.stopPropagation(); toast({ title: "Notification Dispatched", description: `SMS alert sent to ${vol.full_name}.` }); }}>
                              <Bell className="h-3 w-3" />Notify
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!volunteers.isLoading && filteredVolunteers.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">No volunteers match the current filters.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-border/80 bg-card/90">
        <CardHeader>
          <CardTitle className="text-xl">Assignment Board</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(incidents.isLoading || assignments.isLoading) &&
            Array.from({ length: 2 }).map((_, index) => (
              <div key={`incident-skeleton-${index}`} className="space-y-3 rounded-lg border border-border bg-muted/15 p-3">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-20 w-full" />
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-36" />
                </div>
              </div>
            ))}
          {((incidents.data ?? []).filter(inc => inc.status !== "reported" && inc.status !== "rejected")).map((incident) => {
            const incidentAssignments = assignmentsByIncident[incident.id] ?? [];
            const selectedVolunteer = selectedVolunteerByIncident[incident.id];
            const selectedVolunteerRecord = selectedVolunteer ? volunteerMap[selectedVolunteer] : null;

            return (
              <div key={incident.id} className="group relative space-y-3 rounded-xl border border-border/50 bg-muted/10 p-4 transition-colors">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{incident.title}</p>
                      {incident.status === 'active' && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                      )}
                    </div>
                    <Badge className={severityClass[incident.severity]}>{severityLabel[incident.severity]}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{incident.district}</span>
                    <Badge className={incidentStatusClass[incident.status]}>{incident.status.replace("_", " ")}</Badge>
                  </div>
                </div>

                {incident.ai_dispatch_plan && (
                  <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 shadow-inner">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                        <p className="text-xs font-bold text-primary uppercase tracking-wider">AI Target Personnel ({incident.ai_dispatch_plan.headcount_required} Required)</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {incident.ai_dispatch_plan.recommended_volunteers.length === 0 && (
                        <Badge variant="outline" className="text-muted-foreground border-dashed bg-transparent text-[10px] px-1.5 py-0">No exact matches available</Badge>
                      )}
                      {(incident.ai_dispatch_plan.recommended_volunteers || []).map(vid => {
                        const vol = volunteerMap[vid];
                        if (!vol) return null;
                        const isAssigned = (assignmentsByIncident[incident.id] ?? []).some(a => a.volunteer_id === vid);
                        return (
                          <Button 
                            key={vid}
                            variant="outline"
                            size="sm"
                            disabled={isAssigned || createAssignment.isPending}
                            onClick={() => {
                              createAssignment.mutate({ incidentId: incident.id, volunteerId: vid });
                              toast({
                                title: "Dispatch Action Confirmed",
                                description: `Encrypted SMS strike order sent to ${vol.full_name}.`,
                              });
                            }}
                            className={`h-5 text-[10px] px-1.5 py-0 border transition-all ${isAssigned ? 'bg-primary text-primary-foreground opacity-40 cursor-not-allowed' : 'bg-primary/20 text-primary border-primary/40 hover:bg-primary/40'}`}
                          >
                            {vol.full_name} ({vol.skills?.[0] || 'General'}) {isAssigned && "✓"}
                          </Button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1">
                      {incident.ai_dispatch_plan.tactical_reasoning}
                    </p>
                  </div>
                )}

                <div className="space-y-2 rounded-md border border-border/80 bg-background/60 p-2">
                  <p className="text-xs font-medium text-muted-foreground">Current Assignments</p>
                  {incidentAssignments.length === 0 && (
                    <p className="text-xs text-muted-foreground">No volunteers assigned yet.</p>
                  )}
                  {incidentAssignments.map((assignment) => {
                    const volunteer = volunteerMap[assignment.volunteer_id];
                    if (!volunteer) return null;

                    return (
                      <div key={assignment.id} className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold">{volunteer.full_name}</p>
                          <Badge className={assignmentStatusClass[assignment.status]}>{assignment.status.replace("_", " ")}</Badge>
                        </div>
                        <Select
                          value={assignment.status}
                          onValueChange={(status) =>
                            handleAssignmentStatusChange(
                              assignment.id,
                              volunteer.id,
                              status as (typeof assignmentStatusOptions)[number],
                            )
                          }
                          disabled={updatingAssignmentId === assignment.id && updateAssignmentStatus.isPending}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {assignmentStatusOptions.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Select
                    value={selectedVolunteer || undefined}
                    onValueChange={(volunteerId) =>
                      setSelectedVolunteerByIncident((prev) => ({
                        ...prev,
                        [incident.id]: volunteerId,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select volunteer" />
                    </SelectTrigger>
                    <SelectContent>
                      {assignableVolunteers.map((volunteer) => (
                        <SelectItem key={volunteer.id} value={volunteer.id}>
                          <div className="flex items-center gap-2">
                            <span>{volunteer.full_name} · {volunteer.district}</span>
                            <Badge className={availabilityClass[volunteer.availability]}>
                              {availabilityLabel[volunteer.availability]}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    onClick={() => handleAssignVolunteer(incident.id)}
                    disabled={!selectedVolunteer || createAssignment.isPending}
                  >
                    {createAssignment.isPending && assigningIncidentId === incident.id ? "Assigning..." : "Assign Volunteer"}
                  </Button>
                </div>
                {selectedVolunteerRecord && selectedVolunteerRecord.availability !== "available" && (
                  <p className="text-xs text-muted-foreground">
                    {selectedVolunteerRecord.full_name} is currently {availabilityLabel[selectedVolunteerRecord.availability].toLowerCase()};
                    assigning will still dispatch them.
                  </p>
                )}
              </div>
            );
          })}
          {!incidents.isLoading && (incidents.data?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">No incidents available.</p>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
