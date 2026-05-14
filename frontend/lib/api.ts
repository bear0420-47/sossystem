// API Client - fetch wrapper + types
import type {
  Incident,
  CreateIncidentPayload,
  UpdateIncidentPayload,
  UserIncidentView,
  ApiResponse,
  PaginatedResponse,
  DispatchHistory,
} from "./types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "/api"

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  if (!response.ok) {
    throw new ApiError(response.status, `API Error: ${response.statusText}`)
  }

  return response.json()
}

// ==================== Admin API ====================

export const adminApi = {
  // Get all incidents with optional filters
  getIncidents: async (params?: {
    status?: string
    page?: number
    pageSize?: number
  }): Promise<PaginatedResponse<Incident>> => {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set("status", params.status)
    if (params?.page) searchParams.set("page", String(params.page))
    if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))

    const query = searchParams.toString()
    return fetchApi(`/incidents${query ? `?${query}` : ""}`)
  },

  // Get single incident by ID
  getIncident: async (id: string): Promise<ApiResponse<Incident>> => {
    return fetchApi(`/incidents/${id}`)
  },

  // Update incident (acknowledge, close, update urgency)
  updateIncident: async (
    id: string,
    payload: UpdateIncidentPayload
  ): Promise<ApiResponse<Incident>> => {
    return fetchApi(`/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    })
  },

  // Acknowledge incident
  acknowledgeIncident: async (id: string): Promise<ApiResponse<Incident>> => {
    return fetchApi(`/incidents/${id}/acknowledge`, {
      method: "POST",
    })
  },

  // Close incident
  closeIncident: async (id: string): Promise<ApiResponse<Incident>> => {
    return fetchApi(`/incidents/${id}/close`, {
      method: "POST",
    })
  },

  // Get dispatch history for an incident
  getDispatchHistory: async (
    incidentId: string
  ): Promise<ApiResponse<DispatchHistory[]>> => {
    return fetchApi(`/incidents/${incidentId}/history`)
  },

  // Get dashboard stats
  getStats: async (): Promise<
    ApiResponse<{
      pending: number
      inProgress: number
      closedToday: number
    }>
  > => {
    return fetchApi("/stats")
  },
}

// ==================== User API ====================

export const userApi = {
  // Create new SOS incident
  createIncident: async (
    payload: CreateIncidentPayload
  ): Promise<ApiResponse<UserIncidentView>> => {
    return fetchApi("/sos", {
      method: "POST",
      body: JSON.stringify(payload),
    })
  },

  // Get user's current active incident
  getMyIncident: async (userId: string): Promise<ApiResponse<UserIncidentView>> => {
    return fetchApi(`/sos/user/${userId}`)
  },

  // Poll for incident status updates
  getIncidentStatus: async (
    incidentId: string
  ): Promise<ApiResponse<UserIncidentView>> => {
    return fetchApi(`/sos/${incidentId}/status`)
  },

  // Upload audio recording
  uploadAudio: async (file: Blob): Promise<ApiResponse<{ url: string }>> => {
    const formData = new FormData()
    formData.append("audio", file)

    const response = await fetch(`${API_BASE_URL}/upload/audio`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      throw new ApiError(response.status, "Failed to upload audio")
    }

    return response.json()
  },
}

export { ApiError }
