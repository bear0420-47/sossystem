import Link from "next/link"
import { AlertTriangle, Monitor, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">S.O.S. Thailand</h1>
          <p className="text-muted-foreground">ระบบแจ้งเหตุฉุกเฉินและขอความช่วยเหลือ</p>
        </div>
      </div>
      
      {/* Description */}
      <p className="text-center text-muted-foreground max-w-xl mb-12">
        ระบบส่วนกลางสำหรับรับแจ้งเหตุฉุกเฉินและประสานงานช่วยเหลือ
        รองรับทั้งผู้ขอความช่วยเหลือผ่านแอปพลิเคชัน และผู้ให้ความช่วยเหลือผ่านแดชบอร์ด
      </p>
      
      {/* Navigation cards */}
      <div className="grid md:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* User App */}
        <Card className="group hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>แอปผู้ขอความช่วยเหลือ</CardTitle>
            <CardDescription>
              หน้าจอสำหรับผู้ใช้งานทั่วไป - กดปุ่ม SOS, บันทึกเสียง, และติดตามสถานะการช่วยเหลือ
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/user">
              <Button className="w-full bg-primary hover:bg-primary/90">
                เปิดแอป User
              </Button>
            </Link>
          </CardContent>
        </Card>
        
        {/* Admin Dashboard */}
        <Card className="group hover:border-primary/50 transition-colors">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center mb-2">
              <Monitor className="w-6 h-6 text-green-500" />
            </div>
            <CardTitle>แดชบอร์ดผู้ดูแลระบบ</CardTitle>
            <CardDescription>
              หน้าจอสำหรับเจ้าหน้าที่ - ดูรายการแจ้งเหตุ, รับเรื่อง, และจัดการสถานะเหตุการณ์
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin">
              <Button variant="outline" className="w-full border-green-500/30 text-green-500 hover:bg-green-500/10">
                เปิด Admin Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
      
      
      
    </main>
  )
}
