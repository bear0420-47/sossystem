// Custom hooks - TanStack Query for incidents (Admin)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { adminApi } from "@/lib/api"
import type { UpdateIncidentPayload } from "@/lib/types"

// Query keys
export const incidentKeys = {
  all: ["incidents"] as const,
  lists: () => [...incidentKeys.all, "list"] as const,
  list: (filters: { status?: string; page?: number }) =>
    [...incidentKeys.lists(), filters] as const,
  details: () => [...incidentKeys.all, "detail"] as const,
  detail: (id: string) => [...incidentKeys.details(), id] as const,
  history: (id: string) => [...incidentKeys.all, "history", id] as const,
  stats: () => [...incidentKeys.all, "stats"] as const,
}

// Get all incidents
export function useIncidents(filters?: { status?: string; page?: number }) {
  return useQuery({
    queryKey: incidentKeys.list(filters ?? {}),
    queryFn: () => adminApi.getIncidents(filters),
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
  })
}

// Get single incident
export function useIncident(id: string | null) {
  return useQuery({
    queryKey: incidentKeys.detail(id ?? ""),
    queryFn: () => adminApi.getIncident(id!),
    enabled: !!id,
  })
}

// Get dispatch history
export function useDispatchHistory(incidentId: string | null) {
  return useQuery({
    queryKey: incidentKeys.history(incidentId ?? ""),
    queryFn: () => adminApi.getDispatchHistory(incidentId!),
    enabled: !!incidentId,
  })
}

// Get dashboard stats
export function useStats() {
  return useQuery({
    queryKey: incidentKeys.stats(),
    queryFn: () => adminApi.getStats(),
    refetchInterval: 10000, // Poll every 10 seconds
  })
}

// Update incident mutation
export function useUpdateIncident() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: UpdateIncidentPayload
    }) => adminApi.updateIncident(id, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: incidentKeys.detail(variables.id),
      })
      queryClient.invalidateQueries({ queryKey: incidentKeys.stats() })
    },
  })
}

// Acknowledge incident mutation
export function useAcknowledgeIncident() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => adminApi.acknowledgeIncident(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: incidentKeys.stats() })
    },
  })
}

// Close incident mutation
export function useCloseIncident() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => adminApi.closeIncident(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: incidentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: incidentKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: incidentKeys.stats() })
    },
  })
}
