"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Mic, Play, Pause, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useSOSStore, type SOSState } from "@/stores/sos"
import { LocationMap } from "./location-map"
import { cn } from "@/lib/utils"
import { useCreateSOS, useIncidentStatus, useUploadAudio } from "@/lib/hooks/use-sos"
import { userApi } from "@/lib/api"

// Sound wave animation component
function SoundWave({ isRecording }: { isRecording: boolean }) {
  return (
    <div className="flex items-center justify-center gap-1 h-16">
      {[...Array(7)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 bg-foreground/80 rounded-full transition-all duration-150",
            isRecording ? "animate-pulse" : ""
          )}
          style={{
            height: isRecording ? `${Math.random() * 40 + 20}px` : "8px",
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}
    </div>
  )
}

// Main SOS Button
function SOSButton({ onPress }: { onPress: () => void }) {
  const [isPressed, setIsPressed] = useState(false)
  const pressTimer = useRef<NodeJS.Timeout | null>(null)
  
  const handlePressStart = () => {
    setIsPressed(true)
    pressTimer.current = setTimeout(() => {
      onPress()
    }, 500)
  }
  
  const handlePressEnd = () => {
    setIsPressed(false)
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
    }
  }
  
  return (
    <div className="relative">
      <div className={cn(
        "absolute inset-0 rounded-full bg-primary/20 transition-all duration-300",
        isPressed ? "scale-110 opacity-100" : "scale-100 opacity-50"
      )} />
      
      <button
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        className={cn(
          "relative w-56 h-56 rounded-full flex flex-col items-center justify-center gap-3",
          "bg-gradient-to-br from-primary to-destructive",
          "shadow-[0_0_60px_rgba(239,68,68,0.5)]",
          "transition-all duration-200 active:scale-95",
          isPressed ? "scale-95 shadow-[0_0_80px_rgba(239,68,68,0.7)]" : ""
        )}
      >
        <span className="text-5xl font-bold text-primary-foreground">SOS</span>
        <span className="text-xs text-primary-foreground/80 uppercase tracking-wider">
          กดค้างเพื่อแจ้งเหตุ
        </span>
      </button>
    </div>
  )
}

// Recording State Screen - 20 seconds with actual audio recording
function RecordingScreen() {
  const { recordingSeconds, incrementRecordingSeconds, setState, setAudioBlob } = useSOSStore()
  const maxRecordTime = 20
  const remainingTime = maxRecordTime - recordingSeconds
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingStartedRef = useRef(false)
  
  useEffect(() => {
    // Start recording only once on first mount
    if (recordingStartedRef.current) return
    recordingStartedRef.current = true
    
    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream)
        mediaRecorderRef.current = mediaRecorder
        audioChunksRef.current = []
        
        mediaRecorder.ondataavailable = (event) => {
          audioChunksRef.current.push(event.data)
        }
        
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
          setAudioBlob(audioBlob)
        }
        
        mediaRecorder.start()
      } catch (error) {
        console.error("Failed to start recording:", error)
        setState("idle")
      }
    }
    
    startRecording()
    
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [setState, setAudioBlob])
  
  useEffect(() => {
    const interval = setInterval(() => {
      incrementRecordingSeconds()
    }, 1000)
    
    return () => clearInterval(interval)
  }, [incrementRecordingSeconds])
  
  useEffect(() => {
    if (recordingSeconds >= maxRecordTime) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      }
      setState("processing")
    }
  }, [recordingSeconds, setState])
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-amber-500 px-6 py-12">
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center">
          <Mic className="w-6 h-6 text-black/70" />
        </div>
        <h1 className="text-xl font-semibold text-black">S.O.S. Thailand</h1>
      </div>
      
      <Card className="w-full max-w-sm bg-black/10 border-none p-6 rounded-2xl">
        <p className="text-center text-black/80 text-sm mb-4">
          กำลังบันทึกเสียงและส่งข้อมูล...
        </p>
        <p className="text-center text-black/60 text-xs mb-6">
          ระบบกำลังรวบรวมข้อมูลและส่งไปยังศูนย์ช่วยเหลือ
        </p>
        
        <SoundWave isRecording={true} />
        
        <div className="mt-8 text-center">
          <span className="text-6xl font-bold text-black">{remainingTime}</span>
          <p className="text-black/60 text-sm mt-2">วินาที</p>
        </div>
        <div className="mt-6">
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => {
              // Stop recording early and proceed to processing/upload
              if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
                try {
                  mediaRecorderRef.current.stop()
                  mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
                } catch (e) {
                  console.error("Error stopping recorder:", e)
                }
              }
              setState("processing")
            }}
          >
            หยุดและส่ง
          </Button>
        </div>
        
        <p className="text-center text-black/50 text-xs mt-6">
          กรุณาอธิบายสถานการณ์ให้ชัดเจน
        </p>
      </Card>
      
      <Button
        variant="outline"
        className="mt-8 bg-black/10 border-black/20 text-black hover:bg-black/20"
        onClick={() => useSOSStore.getState().reset()}
      >
        ยกเลิกการแจ้งเหตุ
      </Button>
    </div>
  )
}

// Processing State Screen
function ProcessingScreen({
  onProcess,
  error,
}: {
  onProcess: () => Promise<void>
  error: string | null
}) {
  useEffect(() => {
    onProcess()
  }, [onProcess])
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-amber-500 px-6 py-12">
      <div className="animate-spin w-16 h-16 border-4 border-black/20 border-t-black rounded-full mb-8" />
      <h2 className="text-xl font-semibold text-black">กำลังส่งข้อมูล...</h2>
      <p className="text-black/60 text-sm mt-2">กรุณารอสักครู่</p>
      {error && <p className="text-red-700 text-sm mt-3">{error}</p>}
    </div>
  )
}

// Waiting State Screen
function WaitingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-emerald-500 px-6 py-12">
      <div className="flex flex-col items-center gap-2 mb-8">
        <h1 className="text-xl font-semibold text-white">S.O.S. Thailand</h1>
      </div>
      
      <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-6">
        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      
      <h2 className="text-2xl font-semibold text-white mb-2">ส่งข้อมูลสำเร็จแล้ว</h2>
      <p className="text-white/80 text-sm text-center mb-8">
        ข้อมูลถูกส่งเรียบร้อยแล้ว
      </p>
      
      <Card className="w-full max-w-sm bg-white/10 border-none p-6 rounded-2xl">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="flex gap-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-white animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
        <h3 className="text-lg font-medium text-white text-center">รอเจ้าหน้าที่รับเรื่อง...</h3>
        <p className="text-white/70 text-sm text-center mt-2">
          กำลังรอเจ้าหน้าที่รับเรื่องใกล้ที่สุด
        </p>
      </Card>
      
      <Button
        variant="outline"
        className="mt-8 bg-white/10 border-white/20 text-white hover:bg-white/20"
      >
        ดูข้อมูลที่ส่งไป
      </Button>
    </div>
  )
}

// Audio Player Component for Help Coming Screen
function AudioPlayerSimple({ audioBlob }: { audioBlob: Blob | null }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  useEffect(() => {
    if (!audioBlob) return
    
    const url = URL.createObjectURL(audioBlob)
    const audio = new Audio(url)
    audioRef.current = audio
    
    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration)
    })
    
    audio.addEventListener("timeupdate", () => {
      setProgress((audio.currentTime / audio.duration) * 100)
    })
    
    audio.addEventListener("ended", () => {
      setIsPlaying(false)
      setProgress(0)
    })
    
    return () => {
      URL.revokeObjectURL(url)
      audio.pause()
    }
  }, [audioBlob])
  
  const togglePlayback = () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }
  
  return (
    <div className="flex items-center gap-3 bg-white/10 rounded-lg p-3">
      <button
        onClick={togglePlayback}
        className="w-10 h-10 rounded-full bg-white flex items-center justify-center"
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 text-emerald-600" />
        ) : (
          <Play className="w-4 h-4 text-emerald-600 ml-0.5" />
        )}
      </button>
      
      <div className="flex-1">
        <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-white/60">
          <span>{Math.floor(progress / 100 * duration)}s</span>
          <span>{Math.floor(duration)}s</span>
        </div>
      </div>
      
      <Volume2 className="w-4 h-4 text-white/60" />
    </div>
  )
}

function parseLocation(location: string | null): { lat: number; lng: number } | null {
  if (!location) {
    return null
  }

  const [latText, lngText] = location.split(",").map((part) => part.trim())
  const lat = Number(latText)
  const lng = Number(lngText)

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null
  }

  return { lat, lng }
}

function handleLocationError(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      console.error("Permission denied")
      break
    case error.POSITION_UNAVAILABLE:
      console.error("Position unavailable")
      break
    case error.TIMEOUT:
      console.error("Timeout")
      break
    default:
      console.error("Error getting location:", error)
  }
}

// Help Coming State Screen - แสดง Map + Audio
function HelpComingScreen() {
  const { location, audioBlob } = useSOSStore()
  const parsedLocation = parseLocation(location)
  const lat = parsedLocation?.lat || 13.7563
  const lng = parsedLocation?.lng || 100.5018
  
  return (
    <div className="flex flex-col min-h-screen bg-emerald-500">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm text-white/80">S.O.S. Thailand</span>
        <span className="text-sm text-white/80">
          {new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.
        </span>
      </div>
      
      {/* Main content */}
      <div className="flex-1 px-6 py-4">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">
            เจ้าหน้าที่รับเรื่องแล้ว
          </h1>
          <p className="text-white/80 text-sm">
            กำลังเดินทางมาช่วยเหลือ
          </p>
        </div>
        
        {/* Map with Pin - Real Leaflet Map */}
        <Card className="bg-card border-none rounded-xl overflow-hidden mb-4">
          <LocationMap
            lat={lat}
            lng={lng}
            className="h-48"
            zoom={15}
          />
          
          {/* Coordinates */}
          <div className="p-3 bg-card">
            <p className="text-sm text-muted-foreground font-mono">
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
          </div>
        </Card>
        
        {/* Audio Recording */}
        <Card className="bg-white/10 border-none p-4 rounded-xl mb-4">
          <p className="text-white/80 text-sm mb-3">ไฟล์เสียงที่บันทึก</p>
          <AudioPlayerSimple audioBlob={audioBlob} />
        </Card>
        
        {/* ETA Info */}
        <Card className="bg-white/20 border-none p-4 rounded-xl">
          <p className="text-white/80 text-sm mb-1">ถึงภายใน</p>
          <p className="text-3xl font-bold text-white">
            8 <span className="text-lg font-normal">นาที</span>
          </p>
        </Card>
      </div>
      
      {/* Bottom action */}
      <div className="p-4">
        <Button
          variant="outline"
          className="w-full bg-white/10 border-white/20 text-white hover:bg-white/20"
          onClick={() => useSOSStore.getState().reset()}
        >
          กลับหน้าหลัก
        </Button>
      </div>
    </div>
  )
}

// Main SOS App Component
export default function SOSUserApp() {
  const {
    state,
    setState,
    setLocation,
    setRecordingSeconds,
    location,
    currentIncident,
    setCurrentIncident,
  } = useSOSStore()
  const [processingError, setProcessingError] = useState<string | null>(null)
  const isSubmittingRef = useRef(false)
  const createSOS = useCreateSOS()
  const uploadAudio = useUploadAudio()

  const statusQuery = useIncidentStatus(
    currentIncident?.id ?? null,
    !!currentIncident?.id && (state === "waiting" || state === "help-coming")
  )
  
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation(`${position.coords.latitude}, ${position.coords.longitude}`)
        },
        handleLocationError
      )
    }
  }, [setLocation])
  
  const handleSOSPress = useCallback(() => {
    setProcessingError(null)
    setRecordingSeconds(0)
    setState("recording")
  }, [setState, setRecordingSeconds])

  const processSOS = useCallback(async () => {
    if (isSubmittingRef.current) {
      return
    }

    try {
      isSubmittingRef.current = true
      setProcessingError(null)

      const { audioBlob } = useSOSStore.getState()
      if (!audioBlob) {
        setProcessingError("ไม่มีข้อมูลเสียง")
        isSubmittingRef.current = false
        return
      }

      const parsed = parseLocation(location)
      const file = new File([audioBlob], "recording.webm", { type: "audio/webm" })
      const uploadRes = await uploadAudio.mutateAsync(file)

      const incidentRes = await createSOS.mutateAsync({
        userId: "anonymous",
        location: parsed ?? { lat: 13.7563, lng: 100.5018 },
        audioUrl: uploadRes.voice_url,
      })

      setCurrentIncident(incidentRes.data)
      setState("waiting")
    } catch (error) {
      setProcessingError(error instanceof Error ? error.message : "ส่งข้อมูลไม่สำเร็จ")
      isSubmittingRef.current = false
    }
  }, [createSOS, location, setCurrentIncident, setState, uploadAudio])

  useEffect(() => {
    if (state !== "processing") {
      isSubmittingRef.current = false
    }
  }, [state])

  useEffect(() => {
    const status = statusQuery.data?.data?.status
    if (status === "In Progress") {
      setState("help-coming")
    }
    if (status === "Closed") {
      setState("idle")
    }
  }, [setState, statusQuery.data?.data?.status])

  useEffect(() => {
    if (!currentIncident?.id) {
      return
    }

    const es = userApi.createTicketEventSource(currentIncident.id, (event) => {
      const eventStatus = event?.ticket?.status
      if (eventStatus === "In Progress") {
        setState("help-coming")
      }
      if (eventStatus === "Closed") {
        setState("idle")
      }
    })

    return () => {
      es.close()
    }
  }, [currentIncident?.id, setState])
  
  if (state === "recording") {
    return <RecordingScreen />
  }
  
  if (state === "processing") {
    return <ProcessingScreen onProcess={processSOS} error={processingError} />
  }
  
  if (state === "waiting") {
    return <WaitingScreen />
  }
  
  if (state === "help-coming") {
    return <HelpComingScreen />
  }
  
  // Idle state - main SOS screen (only SOS button, no location/nearby info)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 py-12">
      {/* Header */}
      <div className="flex items-center gap-2 mb-8">
        <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
          <span className="text-primary font-bold text-sm">SOS</span>
        </div>
        <h1 className="text-lg font-semibold">S.O.S. Thailand</h1>
      </div>
      
      {/* SOS Button */}
      <div className="flex-1 flex items-center justify-center">
        <SOSButton onPress={handleSOSPress} />
      </div>
      
      {/* Instructions */}
      <div className="text-center mt-8">
        <h2 className="text-xl font-semibold mb-2">กดเพื่อแจ้งเหตุฉุกเฉิน</h2>
        <p className="text-muted-foreground text-sm">
          ระบบจะส่งสัญญาณของคุณไปยังศูนย์ช่วยเหลือ
        </p>
      </div>
    </div>
  )
}
