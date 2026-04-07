import * as React from "react";
import { useCivRescue } from "@/components/civrescue/CivRescueProvider";
import { severityClass } from "@/components/civrescue/status";
import { severityLabel } from "@/lib/civrescue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CircleMarker, MapContainer, Tooltip, TileLayer, useMap } from "react-leaflet";
const latMin = 20;
const latMax = 24.8;
const lngMin = 68;
const lngMax = 74.5;

const gujaratCenter: [number, number] = [22.2587, 71.1924];
const gujaratBounds: [[number, number], [number, number]] = [
  [latMin, lngMin],
  [latMax, lngMax],
];

const severityColor: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

const statusOptions = ["reported", "active", "contained", "resolved"] as const;

function MapFlyTo({ targetId, center }: { targetId: string | undefined; center: [number, number] | null }) {
  const map = useMap();
  React.useEffect(() => {
    if (center && Number.isFinite(center[0]) && Number.isFinite(center[1])) {
      map.flyTo(center, Math.max(map.getZoom(), 9), { animate: true, duration: 1.2 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, map]);
  return null;
}

export default function LiveMapPage() {
  const { incidents, volunteers, createAssignment, updateIncidentStatus } = useCivRescue();
  const [severityFilter, setSeverityFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [volunteerId, setVolunteerId] = React.useState<string>("none");

  const typeOptions = React.useMemo(
    () => ["all", ...new Set((incidents.data ?? []).map((item) => item.incident_type))],
    [incidents.data],
  );

  const filteredIncidents = React.useMemo(() => {
    return (incidents.data ?? []).filter((item) => {
      if (item.status === "reported" || item.status === "rejected") return false;
      if (severityFilter !== "all" && item.severity !== severityFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (typeFilter !== "all" && item.incident_type !== typeFilter) return false;
      return true;
    });
  }, [incidents.data, severityFilter, statusFilter, typeFilter]);

  const mapIncidents = React.useMemo(
    () =>
      filteredIncidents.filter(
        (incident) => Number.isFinite(incident.latitude) && Number.isFinite(incident.longitude),
      ),
    [filteredIncidents],
  );

  const selectedIncident = filteredIncidents.find((item) => item.id === selectedId) ?? filteredIncidents[0];
  const availableVolunteers = (volunteers.data ?? []).filter((item) => item.availability === "available");

  React.useEffect(() => {
    if (!filteredIncidents.length) {
      if (selectedId) setSelectedId(null);
      return;
    }

    const selectedStillExists = selectedId && filteredIncidents.some((item) => item.id === selectedId);
    if (!selectedStillExists) setSelectedId(filteredIncidents[0].id);
  }, [filteredIncidents, selectedId]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <Card className="border-border/80 bg-card/90 backdrop-blur">
        <CardHeader className="space-y-3">
          <CardTitle className="text-xl">Live Gujarat Incident Map</CardTitle>
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {statusOptions.map((status) => <SelectItem key={status} value={status}>{status.replace("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {typeOptions.map((type) => <SelectItem key={type} value={type}>{type === "all" ? "All Types" : type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative h-[480px] overflow-hidden rounded-xl border border-border/50 bg-muted/10 shadow-sm">
            <MapContainer
              center={gujaratCenter}
              zoom={7}
              minZoom={6}
              maxZoom={12}
              maxBounds={gujaratBounds}
              className="h-full w-full"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <MapFlyTo 
                targetId={selectedIncident?.id} 
                center={selectedIncident ? [selectedIncident.latitude, selectedIncident.longitude] : null} 
              />

              {mapIncidents.map((incident) => {
                const isSelected = selectedIncident?.id === incident.id;
                const color = severityColor[incident.severity];

                return (
                  <CircleMarker
                    key={incident.id}
                    center={[incident.latitude, incident.longitude]}
                    radius={isSelected ? 10 : 8}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: isSelected ? 0.5 : 0.35,
                      weight: isSelected ? 3 : 2,
                    }}
                    eventHandlers={{ click: () => setSelectedId(incident.id) }}
                  >
                    <Tooltip direction="top" offset={[0, -10]} opacity={1} className="custom-leaflet-tooltip shadow-xl border-border bg-card/95 backdrop-blur">
                      <div className="space-y-1.5 p-1 min-w-[200px]">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold leading-tight">{incident.title}</p>
                          <span className={severityClass[incident.severity] + " px-1.5 py-0.5 rounded text-[10px] uppercase font-bold whitespace-nowrap"}>
                            {severityLabel[incident.severity]}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {incident.incident_type} · {incident.district}
                        </p>
                        <div className="text-[10px] text-muted-foreground/80 mt-1 uppercase font-semibold tracking-wider">
                          Status: {incident.status.replace("_", " ")}
                        </div>
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              })}
            </MapContainer>

            <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-border bg-card/80 px-3 py-2 text-xs text-muted-foreground">
              Gujarat, India
            </div>
            {!filteredIncidents.length && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-md border border-border bg-card/80 px-3 py-2 text-xs text-muted-foreground">
                No incidents match current filters.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/90">
        <CardHeader>
          <CardTitle className="text-xl">Incident Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedIncident ? (
            <>
              <div className="space-y-3 rounded-xl border border-border/50 bg-muted/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{selectedIncident.title}</p>
                      {selectedIncident.status === 'active' && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{selectedIncident.incident_type} · {selectedIncident.district}</p>
                  </div>
                  <Badge variant="outline" className="bg-background/50 shadow-sm border-primary/20 text-primary">Priority {selectedIncident.priority_score}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/40">
                  <Badge className={severityClass[selectedIncident.severity]}>{severityLabel[selectedIncident.severity]}</Badge>
                  <Badge variant="outline" className="bg-background/30">{(selectedIncident.affected_estimate || 0).toLocaleString()} affected</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Quick Status Update</p>
                <div className="grid grid-cols-2 gap-2">
                  {statusOptions.map((status) => {
                    const isCurrent = selectedIncident.status === status;
                    return (
                      <Button 
                        key={status} 
                        variant={isCurrent ? "default" : "outline"}
                        size="sm" 
                        disabled={isCurrent || updateIncidentStatus.isPending}
                        onClick={() => updateIncidentStatus.mutate({ incidentId: selectedIncident.id, status })}
                        className="capitalize"
                      >
                        {status.replace("_", " ")}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Assign Volunteer</p>
                <Select value={volunteerId} onValueChange={setVolunteerId}>
                  <SelectTrigger><SelectValue placeholder="Pick available volunteer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select volunteer</SelectItem>
                    {availableVolunteers.map((volunteer) => (
                      <SelectItem key={volunteer.id} value={volunteer.id}>{volunteer.full_name} · {volunteer.district}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="w-full"
                  onClick={() => volunteerId !== "none" && createAssignment.mutate({ incidentId: selectedIncident.id, volunteerId })}
                  disabled={volunteerId === "none"}
                >
                  Dispatch Volunteer
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No incidents match current filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
