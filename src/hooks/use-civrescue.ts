import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReportIncidentValues } from "@/lib/civrescue";
import { civrescueApi, MissingPerson, Incident, Volunteer, Assignment, AssignmentStatus, IncidentStatus } from "@/lib/civrescue-api";

const incidentsKey = ["civrescue", "incidents"];
const volunteersKey = ["civrescue", "volunteers"];
const assignmentsKey = ["civrescue", "assignments"];
const missingPersonsKey = ["civrescue", "missing_persons"];

export function useCivRescueData() {
  const queryClient = useQueryClient();

  const incidents = useQuery({
    queryKey: incidentsKey,
    queryFn: () => civrescueApi.getIncidents() as Promise<Incident[]>,
    refetchInterval: 5000,
  });

  const volunteers = useQuery({
    queryKey: volunteersKey,
    queryFn: () => civrescueApi.getVolunteers() as Promise<Volunteer[]>,
    refetchInterval: 10000,
  });

  const assignments = useQuery({
    queryKey: assignmentsKey,
    queryFn: () => civrescueApi.getAssignments() as Promise<Assignment[]>,
    refetchInterval: 5000,
  });

  const missingPersons = useQuery({
    queryKey: missingPersonsKey,
    queryFn: () => civrescueApi.getMissingPersons() as Promise<MissingPerson[]>,
    refetchInterval: 10000,
  });

  const lastSync = React.useMemo(() => {
    const latest = Math.max(
      incidents.dataUpdatedAt || 0,
      volunteers.dataUpdatedAt || 0,
      assignments.dataUpdatedAt || 0,
      missingPersons.dataUpdatedAt || 0
    );
    return latest > 0 ? new Date(latest) : null;
  }, [assignments.dataUpdatedAt, incidents.dataUpdatedAt, volunteers.dataUpdatedAt, missingPersons.dataUpdatedAt]);

  React.useEffect(() => {
    // Relying on `refetchInterval` in React Query instead of Supabase Realtime now.
    // The query interval natively hooks into React suspense and lifecycle cleanly.
  }, [queryClient]);

  const createIncident = useMutation({
    mutationFn: (payload: ReportIncidentValues) => civrescueApi.createIncident(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentsKey });
    },
  });

  const createVolunteer = useMutation({
    mutationFn: (payload: { full_name: string; phone: string; district: string; skills: string[] }) => civrescueApi.createVolunteer(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: volunteersKey });
    },
  });

  const createAssignment = useMutation({
    mutationFn: ({ incidentId, volunteerId, notes }: { incidentId: string; volunteerId: string; notes?: string }) =>
      civrescueApi.createAssignment({ incidentId, volunteerId, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentsKey });
      queryClient.invalidateQueries({ queryKey: volunteersKey });
    },
  });

  const updateAssignmentStatus = useMutation({
    mutationFn: ({ assignmentId, status, volunteerId }: { assignmentId: string; status: AssignmentStatus; volunteerId: string }) =>
      civrescueApi.updateAssignmentStatus({ assignmentId, status, volunteerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentsKey });
      queryClient.invalidateQueries({ queryKey: volunteersKey });
    },
  });

  const updateIncidentStatus = useMutation({
    mutationFn: ({ incidentId, status }: { incidentId: string; status: IncidentStatus }) =>
      civrescueApi.updateIncidentStatus({ incidentId, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentsKey });
    },
  });

  const createMissingPerson = useMutation({
    mutationFn: (payload: {
      full_name: string;
      age: number;
      last_seen_location: string;
      contact_number: string;
    }) => civrescueApi.createMissingPerson(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: missingPersonsKey });
    },
  });

  const updateMissingPersonStatus = useMutation({
    mutationFn: ({ personId, status }: { personId: string; status: "missing" | "found" }) =>
      civrescueApi.updateMissingPersonStatus({ personId, status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: missingPersonsKey });
    },
  });

  const simulateSms = useMutation({
    mutationFn: (payload: { raw_sms: string; phone_number: string }) => civrescueApi.simulateSms(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: incidentsKey });
      queryClient.invalidateQueries({ queryKey: assignmentsKey });
    },
  });

  const isSimulatingSms = simulateSms.isPending;

  return {
    incidents,
    volunteers,
    assignments,
    missingPersons,
    lastSync,
    createIncident,
    createVolunteer,
    createAssignment,
    updateAssignmentStatus,
    updateIncidentStatus,
    simulateSms,
    isSimulatingSms,
    createMissingPerson,
    updateMissingPersonStatus,
  };
}
