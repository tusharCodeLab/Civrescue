
export const severityClass: Record<string, string> = {
  critical: "border-severity-critical/40 bg-severity-critical/15 text-severity-critical",
  high: "border-severity-high/40 bg-severity-high/15 text-severity-high",
  medium: "border-severity-medium/40 bg-severity-medium/15 text-severity-medium",
  low: "border-severity-low/40 bg-severity-low/15 text-severity-low",
};

export const availabilityClass: Record<string, string> = {
  available: "border-availability-available/40 bg-availability-available/15 text-availability-available",
  busy: "border-availability-busy/40 bg-availability-busy/15 text-availability-busy",
  offline: "border-availability-offline/40 bg-availability-offline/15 text-availability-offline",
};

export const assignmentStatusClass: Record<string, string> = {
  assigned: "border-severity-medium/40 bg-severity-medium/15 text-severity-medium",
  en_route: "border-severity-high/40 bg-severity-high/15 text-severity-high",
  on_site: "border-primary/40 bg-primary/15 text-primary",
  completed: "border-availability-available/40 bg-availability-available/15 text-availability-available",
};

export const incidentStatusClass: Record<string, string> = {
  reported: "border-muted-foreground/40 bg-muted/40 text-muted-foreground",
  active: "border-primary/40 bg-primary/15 text-primary",
  contained: "border-severity-medium/40 bg-severity-medium/15 text-severity-medium",
  resolved: "border-availability-available/40 bg-availability-available/15 text-availability-available",
  rejected: "border-gray-500/40 bg-gray-500/15 text-gray-500",
};
