import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, Activity, AlertOctagon, CheckCircle2, Truck, Check, X, Sparkles } from "lucide-react";
import { useCivRescue } from "@/components/civrescue/CivRescueProvider";
import { incidentStatusClass, severityClass } from "@/components/civrescue/status";
import { CriticalAlertBanner } from "@/components/civrescue/CriticalAlertBanner";
import { severityLabel } from "@/lib/civrescue";
import { generateMockIncident } from "@/lib/mock-data";
import { useVoiceAlert } from "@/hooks/use-voice-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

const incidentStatusLabel = {
  reported: "Reported",
  active: "Active",
  contained: "Contained",
  resolved: "Resolved",
  rejected: "Rejected",
} as const;

const Index = () => {
  const navigate = useNavigate();
  const { incidents, volunteers, assignments, createIncident, updateIncidentStatus, createAssignment } = useCivRescue();
  const isAdmin = sessionStorage.getItem("adminSession") === "true";

  // Live stats from backend
  const [liveStats, setLiveStats] = useState({ totalToday: 0, active: 0, resolvedToday: 0, totalVolunteers: 0 });
  const [trackId, setTrackId] = useState("");

  useEffect(() => {
    const fetchStats = () => {
      fetch(`${API_BASE}/api/stats`).then(r => r.json()).then(setLiveStats).catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15_000);
    return () => clearInterval(interval);
  }, []);

  const allIncidents = incidents.data ?? [];
  const allAssignments = assignments.data ?? [];

  const reportedIncidents = allIncidents.filter((item) => item.status === "reported");
  const approvedIncidents = allIncidents.filter((item) => item.status !== "reported" && item.status !== "rejected");

  // ElevenLabs voice alert — fires when a new severity-5 (critical) incident arrives.
  const { lastAlert, dismissAlert, triggerAlert } = useVoiceAlert(allIncidents);

  const isLoading = incidents.isLoading || volunteers.isLoading || assignments.isLoading;

  const criticalIncidents = approvedIncidents.filter((item) => item.severity === "critical" && item.status !== "resolved");
  const dispatchedTeams = allAssignments.filter((item) => item.status !== "completed");
  const resolvedIncidents = approvedIncidents.filter((item) => item.status === "resolved");

  const sortedIncidents = useMemo(
    () =>
      [...approvedIncidents].sort(
        (a, b) => (b.priority_score || 0) - (a.priority_score || 0) || Date.parse(b.created_at || "") - Date.parse(a.created_at || ""),
      ),
    [approvedIncidents],
  );

  const kpis = [
    { label: "Valid Incidents", value: approvedIncidents.length, icon: Activity, textColor: "text-blue-400", cardClass: "" },
    { label: "Critical Incidents", value: criticalIncidents.length, icon: AlertOctagon, textColor: "text-red-400", cardClass: "border-red-500/30 bg-red-950/10 shadow-[0_0_15px_rgba(239,68,68,0.1)]" },
    { label: "Dispatched Teams", value: dispatchedTeams.length, icon: Truck, textColor: "text-amber-400", cardClass: "" },
    { label: "Resolved", value: resolvedIncidents.length, icon: CheckCircle2, textColor: "text-emerald-400", cardClass: "" },
  ];

  const handleTrack = () => {
    const id = trackId.trim();
    if (!id) { toast({ variant: "destructive", title: "Enter an Incident ID" }); return; }
    navigate(`/track/${id}`);
  };

  return (
    <div className="space-y-4">
      {/* ============ EMERGENCY HERO SECTION ============ */}
      <section className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-950/30 via-card to-card p-5 space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-black flex items-center justify-center gap-2">
            <span className="text-2xl">🚨</span> Emergency Services
          </h2>
          <p className="text-xs text-muted-foreground">Report an emergency or track your existing request</p>
        </div>

        {/* Two large buttons */}
        <div className="grid sm:grid-cols-2 gap-3">
          <button onClick={() => navigate("/emergency")}
            className="rounded-xl bg-red-600 hover:bg-red-700 py-4 px-5 text-white font-bold text-sm shadow-lg shadow-red-600/20 transition-all active:scale-[0.98] space-y-1">
            <p className="text-lg">🆘 Report Emergency</p>
            <p className="text-[10px] font-normal opacity-80">Submit a new emergency report for immediate dispatch</p>
          </button>

          <div className="rounded-xl border border-border bg-card/60 p-4 space-y-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">Track My Request</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Incident ID"
                value={trackId}
                onChange={e => setTrackId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleTrack()}
                className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
              />
              <button onClick={handleTrack}
                className="rounded-lg bg-primary/20 border border-primary/40 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/30 transition-colors">
                Track
              </button>
            </div>
          </div>
        </div>

        {/* Live counters */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Resolved Today", value: liveStats.resolvedToday, color: "text-emerald-400" },
            { label: "Active Now", value: liveStats.active, color: "text-amber-400" },
            { label: "Volunteers", value: liveStats.totalVolunteers, color: "text-blue-400" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border/50 bg-muted/10 p-3 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-muted-foreground uppercase font-semibold tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Critical voice alert banner — appears & auto-dismisses on severity-5 incidents */}
      <CriticalAlertBanner alert={lastAlert} onDismiss={dismissAlert} />

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs border-primary/20 hover:bg-primary/10 transition-colors"
          disabled={createIncident.isPending}
          onClick={() => {
            const mockData = generateMockIncident();
            createIncident.mutate(mockData, {
              onSuccess: () => toast({ title: "System Drill Initiated", description: "A simulated emergency context has been pushed for AI analysis." }),
              onError: (err) => {
                const detail = err instanceof Error ? err.message : String(err);
                toast({ variant: "destructive", title: "Drill Initialization Failed", description: detail });
              }
            });
          }}
        >
          <ShieldAlert className="h-4 w-4 text-primary/70" />
          {createIncident.isPending ? "Initializing Drill..." : "Run System Drill"}
        </Button>
      </div>

      {isAdmin && reportedIncidents.length > 0 && (
        <section className="grid gap-4">
          <Card className="border-amber-500/40 bg-amber-950/10 shadow-[0_0_15px_rgba(245,158,11,0.05)]">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <AlertOctagon className="h-5 w-5 text-amber-500" />
                Verification Queue ({reportedIncidents.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reportedIncidents.map((incident) => (
                <div key={incident.id} className="group relative space-y-3 rounded-xl border border-amber-500/30 bg-background/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{incident.title}</p>
                      <p className="text-xs text-muted-foreground">{incident.district} {incident.incident_code ? `· ${incident.incident_code}` : ""}</p>
                    </div>
                    <Badge variant="outline" className="bg-background/50 border-amber-500/30 text-amber-500">Unverified Report</Badge>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                    <Button size="sm" variant="outline" className="border-emerald-500/50 hover:bg-emerald-500/20 text-emerald-500" onClick={() => updateIncidentStatus.mutate({ incidentId: incident.id, status: "active" })}>
                      <Check className="h-4 w-4 mr-1.5" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500/50 hover:bg-red-500/20 text-red-500" onClick={() => updateIncidentStatus.mutate({ incidentId: incident.id, status: "rejected" })}>
                      <X className="h-4 w-4 mr-1.5" /> Reject
                    </Button>
                    <Badge variant="outline" className="ml-auto bg-background/30">{incident.incident_type || "Emergency"}</Badge>
                    <Badge variant="outline" className="bg-background/30">{(incident.affected_estimate || 0).toLocaleString()} affected</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <Card key={item.label} className={`border-border/80 bg-card/90 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 ${item.cardClass}`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{item.label}</CardTitle>
              <item.icon className={`h-4 w-4 ${item.textColor}`} />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4">
        <Card className="border-border/80 bg-card/90">
          <CardHeader>
            <CardTitle className="text-xl">All Incidents by Priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {incidents.isError && (
              <p className="text-sm text-destructive">Unable to load incidents right now. Live updates will retry automatically.</p>
            )}

            {isLoading && sortedIncidents.length === 0 && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="rounded-lg border border-border bg-muted/15 p-3">
                    <Skeleton className="mb-2 h-4 w-2/5" />
                    <Skeleton className="mb-3 h-3 w-1/3" />
                    <div className="flex gap-2">
                      <Skeleton className="h-6 w-24 rounded-full" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!isLoading && sortedIncidents.length === 0 && (
              <p className="text-sm text-muted-foreground">No incidents reported yet. New incidents will appear here in priority order.</p>
            )}

            {sortedIncidents.map((incident) => (
              <div key={incident.id} className="group relative space-y-3 rounded-xl border border-border/50 bg-muted/10 p-4 hover:bg-muted/30 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{incident.title}</p>
                      {incident.status === 'active' && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {incident.district}
                      {incident.incident_code ? ` · ${incident.incident_code}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-background/50 shadow-sm border-primary/20 text-primary">Priority {incident.priority_score || 0}</Badge>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                  <Badge className={severityClass[incident.severity]}>{severityLabel[incident.severity] || incident.severity}</Badge>
                  <Badge className={incidentStatusClass[incident.status]}>{incidentStatusLabel[incident.status] || incident.status}</Badge>
                  <Badge variant="outline" className="bg-background/30">{incident.incident_type || "Emergency"}</Badge>
                  <Badge variant="outline" className="bg-background/30">{(incident.affected_estimate || 0).toLocaleString()} affected</Badge>
                  {isAdmin && incident.status !== 'resolved' && (
                    <Button size="sm" variant="secondary" className="ml-auto h-7 text-xs" onClick={() => updateIncidentStatus.mutate({ incidentId: incident.id, status: "resolved" })}>
                      Mark Resolved
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default Index;
