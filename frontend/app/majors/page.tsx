"use client"

import { useState } from "react"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useMajors, useCreateMajor, useDeleteMajor, type Major } from "@/lib/hooks/use-majors"
import { useUIStore } from "@/stores/ui"

export default function MajorsPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newMajor, setNewMajor] = useState({ name: "", code: "", faculty: "" })
  
  // TanStack Query hooks
  const { data: majors, isLoading, error } = useMajors()
  const createMutation = useCreateMajor()
  const deleteMutation = useDeleteMajor()
  
  // Zustand store
  const { showToast } = useUIStore()
  
  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync(newMajor)
      setNewMajor({ name: "", code: "", faculty: "" })
      setIsDialogOpen(false)
      showToast({
        title: "สำเร็จ",
        description: "เพิ่มสาขาวิชาเรียบร้อยแล้ว",
        type: "success",
      })
    } catch {
      showToast({
        title: "ผิดพลาด",
        description: "ไม่สามารถเพิ่มสาขาวิชาได้",
        type: "error",
      })
    }
  }
  
  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id)
      showToast({
        title: "สำเร็จ",
        description: "ลบสาขาวิชาเรียบร้อยแล้ว",
        type: "success",
      })
    } catch {
      showToast({
        title: "ผิดพลาด",
        description: "ไม่สามารถลบสาขาวิชาได้",
        type: "error",
      })
    }
  }
  
  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>จัดการสาขาวิชา</CardTitle>
              <CardDescription>
                ตัวอย่างการใช้ TanStack Query + Zustand
              </CardDescription>
            </div>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  เพิ่มสาขาวิชา
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>เพิ่มสาขาวิชาใหม่</DialogTitle>
                  <DialogDescription>
                    กรอกข้อมูลสาขาวิชาที่ต้องการเพิ่ม
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">ชื่อสาขาวิชา</Label>
                    <Input
                      id="name"
                      value={newMajor.name}
                      onChange={(e) => setNewMajor({ ...newMajor, name: e.target.value })}
                      placeholder="เช่น วิศวกรรมคอมพิวเตอร์"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="code">รหัสสาขา</Label>
                    <Input
                      id="code"
                      value={newMajor.code}
                      onChange={(e) => setNewMajor({ ...newMajor, code: e.target.value })}
                      placeholder="เช่น CPE"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="faculty">คณะ</Label>
                    <Input
                      id="faculty"
                      value={newMajor.faculty}
                      onChange={(e) => setNewMajor({ ...newMajor, faculty: e.target.value })}
                      placeholder="เช่น วิศวกรรมศาสตร์"
                    />
                  </div>
                </div>
                
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    ยกเลิก
                  </Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    บันทึก
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-destructive">
              เกิดข้อผิดพลาดในการโหลดข้อมูล
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส</TableHead>
                  <TableHead>ชื่อสาขาวิชา</TableHead>
                  <TableHead>คณะ</TableHead>
                  <TableHead className="text-right">การดำเนินการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {majors?.map((major) => (
                  <TableRow key={major.id}>
                    <TableCell className="font-medium">{major.code}</TableCell>
                    <TableCell>{major.name}</TableCell>
                    <TableCell>{major.faculty}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(major.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Code explanation */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>โครงสร้างโค้ด</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-invert max-w-none">
          <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
{`// lib/hooks/use-majors.ts - Custom hooks ที่ห่อ useQuery/useMutation
export function useMajors() {
  return useQuery({
    queryKey: majorKeys.list(),
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

// stores/ui.ts - Zustand store for UI state
export const useUIStore = create((set) => ({
  toast: null,
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: null }),
}))`}
          </pre>
        </CardContent>
      </Card>
    </div>
  )
}
