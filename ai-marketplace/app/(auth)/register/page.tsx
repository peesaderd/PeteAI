"use client"

import { useState } from "react"
import Link from "next/link"
import { Bot, Mail, User, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

export default function RegisterPage() {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: name,
        },
      },
    })

    if (error) {
      toast.error(error.message)
      setLoading(false)
    } else {
      toast.success("ส่งลิงก์ยืนยันไปยังอีเมลของคุณแล้ว")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <Bot className="h-8 w-8 text-primary" />
          <span>AI Marketplace</span>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">สร้างบัญชีใหม่</CardTitle>
            <CardDescription>
              สมัครสมาชิกฟรีและเริ่มใช้งาน AI Apps วันนี้
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">ชื่อ-นามสกุล</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="สมชาย มากมาย"
                    className="pl-10"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">อีเมล</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    className="pl-10"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "กำลังส่ง..." : "สมัครสมาชิกฟรี"}
              </Button>
              <p className="text-sm text-muted-foreground text-center">
                มีบัญชีอยู่แล้ว?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  เข้าสู่ระบบ
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}