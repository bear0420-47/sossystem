// Example: TanStack Query hooks for Majors
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Types
export interface Major {
  id: string
  name: string
  code: string
  faculty: string
  createdAt: string
}

// Mock API functions (replace with real API calls)
const API_URL = "/api/majors"

async function fetchMajors(): Promise<Major[]> {
  // Simulated API call
  await new Promise((resolve) => setTimeout(resolve, 500))
  return [
    { id: "1", name: "วิศวกรรมคอมพิวเตอร์", code: "CPE", faculty: "วิศวกรรมศาสตร์", createdAt: "2024-01-01" },
    { id: "2", name: "วิทยาการคอมพิวเตอร์", code: "CS", faculty: "วิทยาศาสตร์", createdAt: "2024-01-01" },
    { id: "3", name: "เทคโนโลยีสารสนเทศ", code: "IT", faculty: "เทคโนโลยีสารสนเทศ", createdAt: "2024-01-01" },
  ]
}

async function createMajor(data: Omit<Major, "id" | "createdAt">): Promise<Major> {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return {
    ...data,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  }
}

async function updateMajor(id: string, data: Partial<Major>): Promise<Major> {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return {
    id,
    name: data.name || "",
    code: data.code || "",
    faculty: data.faculty || "",
    createdAt: new Date().toISOString(),
  }
}

async function deleteMajor(id: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500))
}

// Query keys
export const majorKeys = {
  all: ["majors"] as const,
  lists: () => [...majorKeys.all, "list"] as const,
  list: (filters?: { faculty?: string }) => [...majorKeys.lists(), filters] as const,
  details: () => [...majorKeys.all, "detail"] as const,
  detail: (id: string) => [...majorKeys.details(), id] as const,
}

// Hooks
export function useMajors(filters?: { faculty?: string }) {
  return useQuery({
    queryKey: majorKeys.list(filters),
    queryFn: fetchMajors,
  })
}

export function useCreateMajor() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: createMajor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: majorKeys.lists() })
    },
  })
}

export function useUpdateMajor() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Major> }) =>
      updateMajor(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: majorKeys.lists() })
      queryClient.invalidateQueries({ queryKey: majorKeys.detail(variables.id) })
    },
  })
}

export function useDeleteMajor() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: deleteMajor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: majorKeys.lists() })
    },
  })
}
