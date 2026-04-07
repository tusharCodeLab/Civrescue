import { ReportIncidentValues } from "@/lib/civrescue";

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";
const API_URL = `${API_BASE}/api/civrescue`;

export type IncidentStatus = "reported" | "active" | "contained" | "resolved" | "rejected";
export type AssignmentStatus = "dispatched" | "on_scene" | "completed" | "recalled";

export interface Incident {
  id: string;
  incident_code?: string;
  title: string;
  incident_type: string;
  severity: "low" | "medium" | "high" | "critical";
  status: IncidentStatus;
  district: string;
  latitude: number;
  longitude: number;
  affected_estimate: number;
  priority_score: number;
  reporter_name?: string;
  reporter_phone?: string;
  description: string;
  triage_notes?: string;
  ai_dispatch_plan?: {
    recommended_volunteers: string[];
    headcount_required: number;
    required_resources: string[];
    tactical_reasoning: string;
  };
  created_at: string;
  updated_at?: string;
}

export interface Volunteer {
  id: string;
  full_name: string;
  phone: string;
  district: string;
  skills: string[];
  availability: "available" | "busy" | "offline";
  created_at: string;
}

export interface Assignment {
  id: string;
  incident_id: string;
  volunteer_id: string;
  status: AssignmentStatus;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface MissingPerson {
  id: string;
  full_name: string;
  age: number;
  last_seen_location: string;
  contact_number: string;
  status: "missing" | "found";
  created_at: string;
  updated_at: string;
}

type Action =
  | "get-incidents"
  | "get-volunteers"
  | "create-volunteer"
  | "get-assignments"
  | "create-incident"
  | "update-incident-status"
  | "create-assignment"
  | "update-assignment-status"
  | "get-missing-persons"
  | "create-missing-person"
  | "update-missing-person-status"
  | "simulate-sms";

async function invokeCivRescue<T>(action: Action, payload?: Record<string, unknown>) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload ? { action, payload } : { action }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Error: ${response.status} ${response.statusText} ${errText}`);
  }

  const { data, error } = await response.json();
  if (error) throw new Error(error);

  return data as T;
}

export const civrescueApi = {
  getIncidents: () => invokeCivRescue<Incident[]>("get-incidents"),
  getVolunteers: () => invokeCivRescue<Volunteer[]>("get-volunteers"),
  createVolunteer: (payload: { full_name: string; phone: string; district: string; skills: string[] }) =>
    invokeCivRescue<Volunteer>("create-volunteer", payload),
  getAssignments: () => invokeCivRescue<Assignment[]>("get-assignments"),
  createIncident: (payload: ReportIncidentValues) => invokeCivRescue<Incident>("create-incident", payload),
  updateIncidentStatus: (payload: { incidentId: string; status: IncidentStatus }) =>
    invokeCivRescue<void>("update-incident-status", payload),
  createAssignment: (payload: { incidentId: string; volunteerId: string; notes?: string }) =>
    invokeCivRescue<Assignment>("create-assignment", payload),
  updateAssignmentStatus: (payload: {
    assignmentId: string;
    volunteerId: string;
    status: AssignmentStatus;
  }) => invokeCivRescue<void>("update-assignment-status", payload),
  getMissingPersons: () => invokeCivRescue<MissingPerson[]>("get-missing-persons"),
  createMissingPerson: (payload: {
    full_name: string;
    age: number;
    last_seen_location: string;
    contact_number: string;
  }) => invokeCivRescue<MissingPerson>("create-missing-person", payload),
  updateMissingPersonStatus: (payload: { personId: string; status: "missing" | "found" }) =>
    invokeCivRescue<void>("update-missing-person-status", payload),
  simulateSms: (payload: { raw_sms: string; phone_number: string }) => 
    invokeCivRescue<Incident>("simulate-sms", payload),
};
