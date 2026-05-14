// API Client - fetch wrapper + types
import type {
  Incident,
  CreateIncidentPayload,
  UpdateIncidentPayload,
  UserIncidentView,
  ApiResponse,
  PaginatedResponse,
  DispatchHistory,
  Location,
  TicketStatus,
  UrgentLevel,
} from "./types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ""

// e.g. http://localhost:8080
class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

type BackendTicket = {
  ticket_id: string
  status: TicketStatus
  urgent: UrgentLevel
  location: string
  voice_clip: string
  timestamp: string
}

type VoiceUploadResponse = {
  voice_url: string
  file_name: string
  size: number
  mime_type: string
}

function parseLocationText(location: string): Location {
  const [latText, lngText] = location.split(",").map((part) => part.trim())
  const lat = Number(latText)
  const lng = Number(lngText)

  return {
    lat: Number.isFinite(lat) ? lat : 13.7563,
    lng: Number.isFinite(lng) ? lng : 100.5018,
  }
}

export function resolveBackendAssetUrl(path: string): string {
  if (!path) {
    return path
  }

  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) {
    return path
  }

  return `${API_BASE_URL}${path}`
}

function toIncident(ticket: BackendTicket): Incident {
  return {
    id: ticket.ticket_id,
    incidentNumber: ticket.ticket_id,
    userId: "",
    location: parseLocationText(ticket.location),
    audioUrl: resolveBackendAssetUrl(ticket.voice_clip),
    status: ticket.status,
    urgentLevel: ticket.urgent,
    createdAt: ticket.timestamp,
    updatedAt: ticket.timestamp,
  }
}

function toUserIncident(ticket: BackendTicket): UserIncidentView {
  return {
    id: ticket.ticket_id,
    incidentNumber: ticket.ticket_id,
    status: ticket.status,
    createdAt: ticket.timestamp,
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
    const tickets = await fetchApi<BackendTicket[]>(`/api/v1/sos/admin/tickets${query ? `?${query}` : ""}`)
    const incidents = tickets.map(toIncident)

    return {
      data: incidents,
      total: incidents.length,
      page: params?.page || 1,
      pageSize: params?.pageSize || incidents.length || 10,
    }
  },

  // Get single incident by ID
  getIncident: async (id: string): Promise<ApiResponse<Incident>> => {
    const ticket = await fetchApi<BackendTicket>(`/api/v1/sos/admin/tickets/${id}`)
    return { data: toIncident(ticket), success: true }
  },

  // Update incident (acknowledge, close, update urgency)
  updateIncident: async (
    id: string,
    payload: UpdateIncidentPayload
  ): Promise<ApiResponse<Incident>> => {
    if (payload.urgentLevel) {
      const ticket = await fetchApi<BackendTicket>(`/api/v1/sos/admin/tickets/${id}/urgent`, {
        method: "PATCH",
        body: JSON.stringify({ urgent: payload.urgentLevel }),
      })
      return { data: toIncident(ticket), success: true }
    }

    const ticket = await fetchApi<BackendTicket>(`/api/v1/sos/admin/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    })
    return { data: toIncident(ticket), success: true }
  },

  // Acknowledge incident
  acknowledgeIncident: async (id: string): Promise<ApiResponse<Incident>> => {
    const ticket = await fetchApi<BackendTicket>(`/api/v1/sos/admin/tickets/${id}/acknowledge`, {
      method: "PATCH",
    })
    return { data: toIncident(ticket), success: true }
  },

  // Close incident
  closeIncident: async (id: string): Promise<ApiResponse<Incident>> => {
    const ticket = await fetchApi<BackendTicket>(`/api/v1/sos/admin/tickets/${id}/close`, {
      method: "PATCH",
    })
    return { data: toIncident(ticket), success: true }
  },

  // Get dispatch history for an incident
  getDispatchHistory: async (
    incidentId: string
  ): Promise<ApiResponse<DispatchHistory[]>> => {
    return { data: [], success: true }
  },

  // Get dashboard stats
  getStats: async (): Promise<
    ApiResponse<{
      pending: number
      inProgress: number
      closedToday: number
    }>
  > => {
    const incidents = await adminApi.getIncidents()
    const pending = incidents.data.filter((i) => i.status === "Pending").length
    const inProgress = incidents.data.filter((i) => i.status === "In Progress").length
    const closedToday = incidents.data.filter((i) => i.status === "Closed").length

    return {
      data: {
        pending,
        inProgress,
        closedToday,
      },
      success: true,
    }
  },
}

// ==================== User API ====================

export const userApi = {
  // Create new SOS incident
  createIncident: async (
    payload: CreateIncidentPayload
  ): Promise<ApiResponse<UserIncidentView>> => {
    // backend expects POST /api/v1/sos/tickets with body { user_name, location, voice_clip }
    const body = {
      user_name: payload.userId || "",
      location: (payload.location && `${payload.location.lat}, ${payload.location.lng}`) || "",
      voice_clip: payload.audioUrl || "",
    }

    const ticket = await fetchApi<BackendTicket>(`/api/v1/sos/tickets`, {
      method: "POST",
      body: JSON.stringify(body),
    })

    return { data: toUserIncident(ticket), success: true }
  },

  // Get user's current active incident
  getMyIncident: async (userId: string): Promise<ApiResponse<UserIncidentView>> => {
    return fetchApi(`/api/v1/sos/tickets/${userId}`)
  },

  // Poll for incident status updates
  getIncidentStatus: async (
    incidentId: string
  ): Promise<ApiResponse<UserIncidentView>> => {
    const ticket = await fetchApi<BackendTicket>(`/api/v1/sos/tickets/${incidentId}`)
    return { data: toUserIncident(ticket), success: true }
  },

  // Upload audio recording
  uploadAudio: async (file: Blob): Promise<VoiceUploadResponse> => {
    const formData = new FormData()
    // backend expects field name `voice`
    formData.append("voice", file)

    const response = await fetch(`${API_BASE_URL}/api/v1/sos/upload-voice`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new ApiError(response.status, `Failed to upload audio: ${text}`)
    }

    return response.json() as Promise<VoiceUploadResponse>
  },

  // SSE helper for user ticket stream
  createTicketEventSource: (ticketId: string, onMessage: (data: any) => void) => {
    const url = `${API_BASE_URL}/api/v1/sos/tickets/${ticketId}/stream`
    const es = new EventSource(url)
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data)
        onMessage(parsed)
      } catch (e) {
        // ignore
      }
    }
    es.onerror = () => es.close()
    return es
  },
}

export { ApiError }
