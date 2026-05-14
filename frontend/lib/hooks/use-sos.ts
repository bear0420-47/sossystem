// Custom hooks - TanStack Query for SOS (User)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { userApi } from "@/lib/api"
import type { CreateIncidentPayload } from "@/lib/types"

// Query keys
export const sosKeys = {
  all: ["sos"] as const,
  incident: (id: string) => [...sosKeys.all, "incident", id] as const,
  myIncident: (userId: string) => [...sosKeys.all, "my", userId] as const,
}

// Get user's current incident status
export function useMyIncident(userId: string | null) {
  return useQuery({
    queryKey: sosKeys.myIncident(userId ?? ""),
    queryFn: () => userApi.getMyIncident(userId!),
    enabled: !!userId,
    refetchInterval: 3000, // Poll every 3 seconds for status updates
  })
}

// Get incident status (for polling after SOS sent)
export function useIncidentStatus(incidentId: string | null, enabled = true) {
  return useQuery({
    queryKey: sosKeys.incident(incidentId ?? ""),
    queryFn: () => userApi.getIncidentStatus(incidentId!),
    enabled: !!incidentId && enabled,
    refetchInterval: 2000, // Poll every 2 seconds for real-time status
  })
}

// Create SOS incident mutation
export function useCreateSOS() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: CreateIncidentPayload) =>
      userApi.createIncident(payload),
    onSuccess: (data) => {
      if (data.data) {
        queryClient.setQueryData(sosKeys.incident(data.data.id), data)
      }
    },
  })
}

// Upload audio mutation
export function useUploadAudio() {
  return useMutation({
    mutationFn: (file: Blob) => userApi.uploadAudio(file),
  })
}
