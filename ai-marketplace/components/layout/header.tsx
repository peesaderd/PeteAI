"use client"

import { useState } from "react"
import Link from "next/link"
import { Bot, Download, User, CreditCard, Settings, LogOut, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <Bot className="h-8 w-8 text-primary" />
            <span>AI Marketplace</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/store" className="text-sm font-medium hover:text-primary transition-colors">
              App Store
            </Link>
            <Link href="/pricing" className="text-sm font-medium hover:text-primary transition-colors">
              ราคา
            </Link>
            <Link href="/docs" className="text-sm font-medium hover:text-primary transition-colors">
              เอกสาร
            </Link>
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/login">
            <Button variant="ghost">เข้าสู่ระบบ</Button>
          </Link>
          <Link href="/register">
            <Button>เริ่มต้นใช้งานฟรี</Button>
          </Link>
        </div>

        <button
          className="md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t p-4 space-y-4 bg-background">
          <nav className="flex flex-col gap-2">
            <Link href="/store" className="text-sm font-medium py-2">App Store</Link>
            <Link href="/pricing" className="text-sm font-medium py-2">ราคา</Link>
            <Link href="/docs" className="text-sm font-medium py-2">เอกสาร</Link>
          </nav>
          <div className="flex flex-col gap-2">
            <Link href="/login">
              <Button variant="outline" className="w-full">เข้าสู่ระบบ</Button>
            </Link>
            <Link href="/register">
              <Button className="w-full">เริ่มต้นใช้งานฟรี</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

export function DashboardHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-bold text-xl">
            <Bot className="h-8 w-8 text-primary" />
            <span>AI Marketplace</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/dashboard" className="text-sm font-medium hover:text-primary transition-colors">
              แดชบอร์ด
            </Link>
            <Link href="/dashboard/apps" className="text-sm font-medium hover:text-primary transition-colors">
              Apps ของฉัน
            </Link>
            <Link href="/store" className="text-sm font-medium hover:text-primary transition-colors">
              App Store
            </Link>
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link href="/dashboard/billing">
            <Button variant="ghost" size="sm">
              <CreditCard className="h-4 w-4 mr-2" />
              สมัครสมาชิก
            </Button>
          </Link>
          <Link href="/dashboard/settings">
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            ออกจากระบบ
          </Button>
        </div>

        <button
          className="md:hidden"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
    </header>
  )
}