"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Search,
  Bell,
  User,
  LayoutGrid,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { IncidentCard, IncidentDetail } from "./incident-card"
import { useUIStore } from "@/stores/ui"
import type { Incident, TicketStatus, UrgentLevel } from "@/lib/types"
import {
  useIncidents,
  useAcknowledgeIncident,
  useCloseIncident,
  useUpdateIncident,
} from "@/lib/hooks/use-incidents"

// Stats Card Component
function StatsCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string
  value: number
  icon: React.ElementType
  variant?: "default" | "warning" | "success"
}) {
  const variantStyles = {
    default: "bg-card",
    warning: "bg-amber-500/10 border-amber-500/20",
    success: "bg-emerald-500/10 border-emerald-500/20",
  }
  
  const iconStyles = {
    default: "text-muted-foreground",
    warning: "text-amber-500",
    success: "text-emerald-500",
  }
  
  return (
    <Card className={`p-4 ${variantStyles[variant]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
        <Icon className={`w-8 h-8 ${iconStyles[variant]}`} />
      </div>
    </Card>
  )
}

// Filter tabs
function FilterTabs({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string
  onFilterChange: (filter: string) => void
}) {
  const filters = [
    { id: "all", label: "ทั้งหมด" },
    { id: "pending", label: "รอดำเนินการ" },
    { id: "in-progress", label: "กำลังช่วยเหลือ" },
    { id: "closed", label: "เสร็จสิ้น" },
  ]
  
  return (
    <div className="flex gap-2">
      {filters.map((filter) => (
        <Button
          key={filter.id}
          variant={activeFilter === filter.id ? "default" : "outline"}
          size="sm"
          onClick={() => onFilterChange(filter.id)}
        >
          {filter.label}
        </Button>
      ))}
    </div>
  )
}

// Main Admin Dashboard Component
export default function AdminDashboard() {
  const [filter, setFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const { selectedIncidentId, setSelectedIncidentId } = useUIStore()

  const statusFilter =
    filter === "pending"
      ? "Pending"
      : filter === "in-progress"
      ? "In Progress"
      : filter === "closed"
      ? "Closed"
      : undefined

  const { data, isLoading, isError } = useIncidents({ status: statusFilter })
  const acknowledgeMutation = useAcknowledgeIncident()
  const closeMutation = useCloseIncident()
  const updateMutation = useUpdateIncident()

  const incidents = data?.data ?? []
  
  // Filter incidents
  const filteredIncidents = incidents.filter((incident) => {
    const matchesFilter =
      filter === "pending"
        ? incident.status === "Pending"
        : filter === "in-progress"
        ? incident.status === "In Progress"
        : filter === "closed"
        ? incident.status === "Closed"
        : true

    const q = searchQuery.trim().toLowerCase()
    const matchesSearch =
      q.length === 0 ||
      incident.incidentNumber.toLowerCase().includes(q) ||
      incident.id.toLowerCase().includes(q)

    return matchesFilter && matchesSearch
  })
  
  // Get selected incident
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId) || null
  
  // Stats
  const pendingCount = incidents.filter((i) => i.status === "Pending").length
  const inProgressCount = incidents.filter((i) => i.status === "In Progress").length
  
  // Handlers
  const handleAcknowledge = (id: string, urgentLevel: UrgentLevel) => {
    updateMutation.mutate({ id, payload: { urgentLevel } })
    acknowledgeMutation.mutate(id)
  }
  
  const handleClose = (id: string) => {
    closeMutation.mutate(id)
  }
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold">S.O.S. Thailand</h1>
              <p className="text-xs text-muted-foreground">Admin Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="ค้นหา..."
                className="pl-10 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </Button>
            
            <Button variant="ghost" size="icon">
              <User className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <div className="flex h-[calc(100vh-65px)]">
        {/* Left panel - Incident list */}
        <div className="flex-1 border-r border-border overflow-hidden flex flex-col">
          {/* Sub header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-medium">รายการแจ้งเหตุ</h2>
              </div>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <StatsCard
                label="รอดำเนินการ"
                value={pendingCount}
                icon={Clock}
                variant="warning"
              />
              <StatsCard
                label="กำลังช่วยเหลือ"
                value={inProgressCount}
                icon={CheckCircle2}
                variant="success"
              />
            </div>
            
            {/* Filters */}
            <FilterTabs activeFilter={filter} onFilterChange={setFilter} />
          </div>
          
          {/* Incident grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading && (
              <div className="text-sm text-muted-foreground mb-3">กำลังโหลดข้อมูล...</div>
            )}

            {isError && (
              <div className="text-sm text-red-500 mb-3">โหลดข้อมูลจาก backend ไม่สำเร็จ</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredIncidents.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  isSelected={selectedIncidentId === incident.id}
                  onSelect={(i) => setSelectedIncidentId(i.id)}
                  onAcknowledge={handleAcknowledge}
                  onClose={handleClose}
                />
              ))}
            </div>
            
            {filteredIncidents.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <AlertTriangle className="w-12 h-12 mb-4 opacity-50" />
                <p>ไม่มีเหตุการณ์</p>
              </div>
            )}
          </div>
          
        </div>
        
        {/* Right panel - Detail view */}
        <div className="w-[400px] bg-card flex flex-col">
          <IncidentDetail
            incident={selectedIncident}
            onAcknowledge={handleAcknowledge}
            onClose={handleClose}
          />
        </div>
      </div>
    </div>
  )
}
