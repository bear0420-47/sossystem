"use client"

import { useEffect, useRef, useState } from "react"
import {
  Play,
  Pause,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Volume2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { LocationMap } from "./location-map"
import { resolveBackendAssetUrl } from "@/lib/api"
import type { Incident, UrgentLevel, TicketStatus } from "@/lib/types"

// Status badge colors
const statusColors: Record<TicketStatus, string> = {
  Pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "In Progress": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Closed: "bg-muted text-muted-foreground border-muted",
}

// Urgency badge colors
const urgencyColors: Record<UrgentLevel, string> = {
  "": "bg-muted text-muted-foreground",
  Low: "bg-emerald-500/20 text-emerald-400",
  Medium: "bg-amber-500/20 text-amber-400",
  High: "bg-orange-500/20 text-orange-400",
  Critical: "bg-red-500/20 text-red-400",
}

// Urgency labels
const urgencyLabels: Record<UrgentLevel, string> = {
  "": "ไม่ระบุ",
  Low: "ต่ำ",
  Medium: "ปานกลาง",
  High: "สูง",
  Critical: "วิกฤต",
}

interface IncidentCardProps {
  incident: Incident
  isSelected?: boolean
  onSelect?: (incident: Incident) => void
  onAcknowledge?: (id: string, urgentLevel: UrgentLevel) => void
  onClose?: (id: string) => void
}

// Audio player component - uses the real audio duration when metadata loads
function AudioPlayer({ audioUrl, duration = 0 }: { audioUrl?: string; duration?: number }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [audioDuration, setAudioDuration] = useState(duration)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const resolvedAudioUrl = audioUrl ? resolveBackendAssetUrl(audioUrl) : ""
  const cacheBustedAudioUrl = resolvedAudioUrl
    ? `${resolvedAudioUrl}${resolvedAudioUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(duration || 0)}`
    : ""

  useEffect(() => {
    if (!cacheBustedAudioUrl) {
      setIsPlaying(false)
      setProgress(0)
      setAudioDuration(duration)
      return
    }

    const audio = new Audio(cacheBustedAudioUrl)
    audio.preload = "metadata"
    audioRef.current = audio

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setAudioDuration(audio.duration)
      }
    }

    const handleTimeUpdate = () => {
      if (!audio.duration || Number.isNaN(audio.duration)) {
        return
      }

      setProgress((audio.currentTime / audio.duration) * 100)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setProgress(0)
    }

    audio.addEventListener("loadedmetadata", handleLoadedMetadata)
    audio.addEventListener("durationchange", handleLoadedMetadata)
    audio.addEventListener("timeupdate", handleTimeUpdate)
    audio.addEventListener("ended", handleEnded)

    return () => {
      audio.pause()
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
      audio.removeEventListener("durationchange", handleLoadedMetadata)
      audio.removeEventListener("timeupdate", handleTimeUpdate)
      audio.removeEventListener("ended", handleEnded)
      audioRef.current = null
      setIsPlaying(false)
      setProgress(0)
      setAudioDuration(duration)
    }
  }, [cacheBustedAudioUrl, duration])
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
      return
    }

    await audio.play()
    setIsPlaying(true)
  }
  
  return (
    <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
      <button
        onClick={togglePlayback}
        className="w-10 h-10 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 transition-colors"
        type="button"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-primary-foreground" />
        ) : (
          <Play className="w-4 h-4 text-primary-foreground ml-0.5" />
        )}
      </button>
      
      <div className="flex-1">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-muted-foreground">
          <span>{formatTime((progress / 100) * audioDuration)}</span>
          <span>{formatTime(audioDuration)}</span>
        </div>
      </div>
      
      <Volume2 className="w-4 h-4 text-muted-foreground" />
    </div>
  )
}

// Mini map - Real Leaflet Map with lat/lng
function MiniMap({ location }: { location: { lat: number; lng: number } }) {
  return (
    <div className="rounded-lg overflow-hidden">
      <LocationMap
        lat={location.lat}
        lng={location.lng}
        className="h-32"
        zoom={14}
      />
      
      {/* Coordinates overlay */}
      <div className="bg-card p-2 border-t border-border">
        <p className="text-xs font-mono text-muted-foreground">
          {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
        </p>
      </div>
    </div>
  )
}

// Incident Card Component
export function IncidentCard({
  incident,
  isSelected,
  onSelect,
  onAcknowledge,
  onClose,
}: IncidentCardProps) {
  const [selectedUrgent, setSelectedUrgent] = useState<UrgentLevel>(incident.urgentLevel)
  const [showUrgentSelect, setShowUrgentSelect] = useState(false)
  
  const formattedTime = new Date(incident.createdAt).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  })
  
  const formattedDate = new Date(incident.createdAt).toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  
  const handleAcknowledge = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (showUrgentSelect) {
      onAcknowledge?.(incident.id, selectedUrgent)
      setShowUrgentSelect(false)
    } else {
      setShowUrgentSelect(true)
    }
  }
  
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:border-primary/50",
        isSelected && "border-primary ring-1 ring-primary/20"
      )}
      onClick={() => onSelect?.(incident)}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {incident.urgentLevel === "Critical" && (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            )}
            <Badge variant="outline" className={urgencyColors[incident.urgentLevel]}>
              {urgencyLabels[incident.urgentLevel]}
            </Badge>
            <Badge variant="outline" className={statusColors[incident.status]}>
              {incident.status}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground" suppressHydrationWarning>
            {formattedTime} | {formattedDate}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2 space-y-3">
        {/* Map preview - lat/lng only */}
        <MiniMap location={incident.location} />
        
        {/* Audio player - uses the actual clip duration */}
        {incident.audioUrl && (
          <AudioPlayer
            audioUrl={incident.audioUrl}
            duration={incident.audioDuration}
          />
        )}
        
        {/* Urgency selector when acknowledging */}
        {showUrgentSelect && incident.status === "Pending" && (
          <div className="p-3 bg-muted/50 rounded-lg space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium">เลือกระดับความเร่งด่วน</p>
            <Select
              value={selectedUrgent}
              onValueChange={(value) => setSelectedUrgent(value as UrgentLevel)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกระดับ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">ต่ำ (Low)</SelectItem>
                <SelectItem value="Medium">ปานกลาง (Medium)</SelectItem>
                <SelectItem value="High">สูง (High)</SelectItem>
                <SelectItem value="Critical">วิกฤต (Critical)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        
        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {incident.status === "Pending" && (
            <Button
              size="sm"
              variant="default"
              className="flex-1"
              onClick={handleAcknowledge}
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              {showUrgentSelect ? "ยืนยัน" : "รับเรื่อง"}
            </Button>
          )}
          {incident.status !== "Closed" && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation()
                onClose?.(incident.id)
              }}
            >
              <XCircle className="w-4 h-4 mr-1" />
              ปิดเคส
            </Button>
          )}
          {incident.status === "Closed" && (
            <Badge variant="outline" className="w-full justify-center py-2">
              ปิดเคสแล้ว
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Incident Detail Panel
interface IncidentDetailProps {
  incident: Incident | null
  onAcknowledge?: (id: string, urgentLevel: UrgentLevel) => void
  onClose?: (id: string) => void
}

export function IncidentDetail({ incident, onAcknowledge, onClose }: IncidentDetailProps) {
  const [selectedUrgent, setSelectedUrgent] = useState<UrgentLevel>(incident?.urgentLevel || "Medium")
  const [showConfirm, setShowConfirm] = useState(false)
  
  if (!incident) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>เลือกเหตุการณ์เพื่อดูรายละเอียด</p>
      </div>
    )
  }
  
  const handleAccept = () => {
    if (showConfirm) {
      onAcknowledge?.(incident.id, selectedUrgent)
      setShowConfirm(false)
    } else {
      setShowConfirm(true)
    }
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-primary">
            #{incident.incidentNumber}
          </h2>
          <span className="text-sm text-muted-foreground" suppressHydrationWarning>
            {new Date(incident.createdAt).toLocaleTimeString("th-TH", {
              hour: "2-digit",
              minute: "2-digit",
            })} น.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={statusColors[incident.status]}>
            {incident.status}
          </Badge>
          <Badge variant="outline" className={urgencyColors[incident.urgentLevel]}>
            {urgencyLabels[incident.urgentLevel]}
          </Badge>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Audio - max 20 seconds */}
        <div>
          <h3 className="text-sm font-medium mb-2">ไฟล์เสียง (สูงสุด 20 วินาที)</h3>
          <AudioPlayer
            audioUrl={incident.audioUrl}
            duration={Math.min(incident.audioDuration || 20, 20)}
          />
        </div>
        
        {/* Map with lat/lng - Real Leaflet Map */}
        <div>
          <h3 className="text-sm font-medium mb-2">ตำแหน่ง (Location)</h3>
          <div className="rounded-lg overflow-hidden">
            <LocationMap
              lat={incident.location.lat}
              lng={incident.location.lng}
              className="h-48"
              zoom={15}
            />
            <div className="bg-card p-3 border-t border-border">
              <p className="text-sm font-mono">
                Lat: {incident.location.lat.toFixed(6)}
              </p>
              <p className="text-sm font-mono">
                Lng: {incident.location.lng.toFixed(6)}
              </p>
            </div>
          </div>
        </div>
        
        {/* Accept with Urgency Selection */}
        {incident.status === "Pending" && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <h3 className="text-sm font-medium">รับเรื่องและกำหนดระดับความเร่งด่วน</h3>
            
            <Select
              value={selectedUrgent}
              onValueChange={(value) => setSelectedUrgent(value as UrgentLevel)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="เลือกระดับความเร่งด่วน" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    ต่ำ (Low)
                  </div>
                </SelectItem>
                <SelectItem value="Medium">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    ปานกลาง (Medium)
                  </div>
                </SelectItem>
                <SelectItem value="High">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    สูง (High)
                  </div>
                </SelectItem>
                <SelectItem value="Critical">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    วิกฤต (Critical)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            
            <Button
              className="w-full"
              onClick={handleAccept}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              ตกลงรับเรื่อง
            </Button>
          </div>
        )}
        
        {/* Close case button */}
        {incident.status !== "Closed" && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onClose?.(incident.id)}
          >
            <XCircle className="w-4 h-4 mr-2" />
            ปิดเคส
          </Button>
        )}
      </div>
    </div>
  )
}
