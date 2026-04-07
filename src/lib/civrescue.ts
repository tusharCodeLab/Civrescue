import { z } from "zod";


export const gujaratDistricts = [
  "Ahmedabad",
  "Surat",
  "Vadodara",
  "Rajkot",
  "Bhavnagar",
  "Jamnagar",
  "Kutch",
  "Junagadh",
  "Gandhinagar",
  "Mehsana",
  "Bharuch",
  "Anand",
] as const;

export const incidentTypeOptions = ["Flood", "Earthquake", "Cyclone", "Heatwave", "Fire", "Landslide"] as const;

export const assignmentStatusOptions = ["dispatched", "on_scene", "completed", "recalled"] as const;

export const severityWeights: Record<string, number> = {
  critical: 50,
  high: 35,
  medium: 20,
  low: 10,
};

export const districtCoordinates: Record<string, { lat: number; lng: number }> = {
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Surat: { lat: 21.1702, lng: 72.8311 },
  Vadodara: { lat: 22.3072, lng: 73.1812 },
  Rajkot: { lat: 22.3039, lng: 70.8022 },
  Bhavnagar: { lat: 21.7645, lng: 72.1519 },
  Jamnagar: { lat: 22.4707, lng: 70.0577 },
  Kutch: { lat: 23.7337, lng: 69.8597 },
  Junagadh: { lat: 21.5222, lng: 70.4579 },
  Gandhinagar: { lat: 23.2156, lng: 72.6369 },
  Mehsana: { lat: 23.588, lng: 72.3693 },
  Bharuch: { lat: 21.7051, lng: 72.9959 },
  Anand: { lat: 22.5645, lng: 72.9289 },
};

export const reportIncidentSchema = z.object({
  emergencyType: z.enum(incidentTypeOptions),
  location: z.string().trim().min(2, "Location is required").max(120, "Location must be under 120 characters"),
  description: z.string().trim().min(15, "Description must be at least 15 characters").max(1200),
  affectedEstimate: z.coerce.number().int().min(0).max(500000),
  reporterPhone: z.string().trim().regex(/^[0-9+\-\s]{8,20}$/, "Enter a valid contact number"),
});

export type ReportIncidentValues = z.infer<typeof reportIncidentSchema>;

export const calculatePriorityScore = ({
  severity,
  affectedEstimate,
}: {
  severity: "low" | "medium" | "high" | "critical";
  affectedEstimate: number;
}) => {
  const affectedWeight = Math.min(40, Math.floor(affectedEstimate / 25));
  return Math.min(100, severityWeights[severity] + affectedWeight + 10);
};

export const incidentCode = () => `CIV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export const severityLabel = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

export const availabilityLabel = {
  available: "Available",
  busy: "Busy",
  offline: "Offline",
} as const;
