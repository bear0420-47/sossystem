// Zustand store - UI state management
import { create } from "zustand"
import type { Incident } from "@/lib/types"

interface ToastState {
  id: string
  title: string
  description?: string
  type: "success" | "error" | "info" | "warning"
}

interface ModalState {
  isOpen: boolean
  type: "incident-detail" | "confirm-close" | null
  data?: Incident | null
}

interface UIStore {
  // Toast
  toast: ToastState | null
  showToast: (toast: Omit<ToastState, "id">) => void
  hideToast: () => void

  // Modal
  modal: ModalState
  openModal: (type: ModalState["type"], data?: Incident | null) => void
  closeModal: () => void

  // Selected incident for detail view
  selectedIncidentId: string | null
  setSelectedIncidentId: (id: string | null) => void

  // Sidebar collapsed state
  sidebarCollapsed: boolean
  toggleSidebar: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  // Toast
  toast: null,
  showToast: (toast) =>
    set({
      toast: {
        ...toast,
        id: Date.now().toString(),
      },
    }),
  hideToast: () => set({ toast: null }),

  // Modal
  modal: { isOpen: false, type: null, data: null },
  openModal: (type, data) => set({ modal: { isOpen: true, type, data } }),
  closeModal: () => set({ modal: { isOpen: false, type: null, data: null } }),

  // Selected incident
  selectedIncidentId: null,
  setSelectedIncidentId: (id) => set({ selectedIncidentId: id }),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}))
