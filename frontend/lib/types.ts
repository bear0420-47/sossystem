// SOS Emergency Response System Types

export type UrgentLevel = "" | "Low" | "Medium" | "High" | "Critical"

export type TicketStatus = "Pending" | "In Progress" | "Closed"

export interface Location {
  lat: number
  lng: number
  address?: string
}

export interface Incident {
  id: string
  incidentNumber: string // e.g., "INC-8892"
  userId: string
  userName?: string
  location: Location
  audioUrl?: string
  audioDuration?: number // seconds
  status: TicketStatus
  urgentLevel: UrgentLevel
  createdAt: string
  updatedAt: string
  acknowledgedAt?: string
  closedAt?: string
  assignedTo?: string
  notes?: string
}

export interface DispatchHistory {
  id: string
  incidentId: string
  action: string
  timestamp: string
  performedBy: string
  note?: string
}

export interface CreateIncidentPayload {
  userId: string
  location: Location
  audioUrl?: string
  audioDuration?: number
}

export interface UpdateIncidentPayload {
  status?: TicketStatus
  urgentLevel?: UrgentLevel
  assignedTo?: string
  notes?: string
}

// User-facing incident view (simplified)
export interface UserIncidentView {
  id: string
  incidentNumber: string
  status: TicketStatus
  responderName?: string
  responderUnit?: string
  estimatedArrival?: number // minutes
  createdAt: string
}

// API Response types
export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
