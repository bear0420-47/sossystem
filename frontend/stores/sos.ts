// Zustand store - SOS state for user app
import { create } from "zustand"
import type { UserIncidentView } from "@/lib/types"

export type SOSState =
  | "idle" // Initial state - ready to send SOS
  | "recording" // Recording audio
  | "processing" // Uploading data
  | "waiting" // Waiting for admin acknowledgment
  | "help-coming" // Admin acknowledged, help is on the way

interface SOSStore {
  // Current state
  state: SOSState
  setState: (state: SOSState) => void

  // Current incident
  currentIncident: UserIncidentView | null
  setCurrentIncident: (incident: UserIncidentView | null) => void

  // Location
  location: string | null
  setLocation: (location: string | null) => void

  // Recording
  recordingSeconds: number
  setRecordingSeconds: (seconds: number) => void
  incrementRecordingSeconds: () => void

  // Audio blob
  audioBlob: Blob | null
  setAudioBlob: (blob: Blob | null) => void

  // Reset all state
  reset: () => void
}

export const useSOSStore = create<SOSStore>((set) => ({
  state: "idle",
  setState: (state) => set({ state }),

  currentIncident: null,
  setCurrentIncident: (incident) => set({ currentIncident: incident }),

  location: null,
  setLocation: (location) => set({ location }),

  recordingSeconds: 0,
  setRecordingSeconds: (seconds) => set({ recordingSeconds: seconds }),
  incrementRecordingSeconds: () =>
    set((state) => ({ recordingSeconds: state.recordingSeconds + 1 })),

  audioBlob: null,
  setAudioBlob: (blob) => set({ audioBlob: blob }),

  reset: () =>
    set({
      state: "idle",
      currentIncident: null,
      recordingSeconds: 0,
      audioBlob: null,
    }),
}))
