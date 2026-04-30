"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Bot,
  MessageSquare,
  Image,
  Database,
  ShoppingCart,
  Calendar,
  Globe,
  FileText,
  Settings,
  Plus,
  GripVertical,
  Smartphone,
  Grid3X3,
  List,
} from "lucide-react"
import Link from "next/link"

interface HomeApp {
  id: string
  name: string
  icon: string
  color: string
  bg: string
  position: number
}

const defaultApps: HomeApp[] = [
  { id: "chat", name: "AI Chat", icon: "💬", color: "text-blue-500", bg: "bg-blue-50", position: 0 },
  { id: "video", name: "AI Video", icon: "🎬", color: "text-red-500", bg: "bg-red-50", position: 1 },
  { id: "content", name: "Content Gen", icon: "📝", color: "text-green-500", bg: "bg-green-50", position: 2 },
  { id: "image", name: "Image Gen", icon: "🎨", color: "text-purple-500", bg: "bg-purple-50", position: 3 },
  { id: "trip", name: "Trip Planner", icon: "✈️", color: "text-teal-500", bg: "bg-teal-50", position: 4 },
  { id: "social", name: "Social Post", icon: "📱", color: "text-orange-500", bg: "bg-orange-50", position: 5 },
  { id: "shop", name: "Shopback", icon: "💰", color: "text-yellow-500", bg: "bg-yellow-50", position: 6 },
  { id: "ghost", name: "Ghost Chat", icon: "👻", color: "text-indigo-500", bg: "bg-indigo-50", position: 7 },
]

export default function HomeScreenPage() {
  const [apps, setApps] = useState<HomeApp[]>(defaultApps)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [editing, setEditing] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return

    const newApps = [...apps]
    const [removed] = newApps.splice(dragIndex, 1)
    newApps.splice(index, 0, removed)
    setApps(newApps.map((app, i) => ({ ...app, position: i })))
    setDragIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
  }

  const handleRemoveApp = (appId: string) => {
    setApps(apps.filter((app) => app.id !== appId))
  }

  return (
    <>
      <DashboardHeader />
      <main className="container py-8 px-4">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">หน้าหลัก</h1>
            <p className="text-muted-foreground">
              จัดเรียง Apps ที่คุณใช้บ่อยได้ตามต้องการ
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="icon"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={editing ? "default" : "outline"}
              onClick={() => setEditing(!editing)}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              {editing ? "เสร็จ" : "จัดเรียง"}
            </Button>
          </div>
        </div>

        {/* Mobile Preview */}
        <div className="flex justify-center mb-8">
          <div className="w-[375px] border-2 rounded-[2rem] p-4 bg-background shadow-xl">
            {/* Status Bar */}
            <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
              <span>9:41</span>
              <div className="flex gap-1">
                <div className="w-4 h-3 border rounded-sm" />
                <div className="w-4 h-3 border rounded-sm" />
                <div className="w-3 h-3 border rounded-full" />
              </div>
            </div>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold">PeteMarket</h2>
                <p className="text-xs text-muted-foreground">สวัสดี, ผู้ใช้</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Bot className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>

            {/* Search Bar */}
            <div className="bg-muted rounded-lg p-3 mb-6 flex items-center gap-2">
              <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm text-muted-foreground">ค้นหา Apps...</span>
            </div>

            {/* Apps Grid */}
            {viewMode === "grid" ? (
              <div className="grid grid-cols-4 gap-4">
                {apps.map((app, index) => (
                  <div
                    key={app.id}
                    draggable={editing}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                      dragIndex === index ? "opacity-50 scale-95" : ""
                    } ${editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer hover:bg-muted"}`}
                  >
                    <div className={`w-14 h-14 rounded-2xl ${app.bg} flex items-center justify-center text-2xl relative`}>
                      <span>{app.icon}</span>
                      {editing && (
                        <button
                          onClick={() => handleRemoveApp(app.id)}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <span className="text-xs text-center truncate w-full">{app.name}</span>
                  </div>
                ))}
                {editing && (
                  <div className="flex flex-col items-center gap-1 p-2">
                    <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                      <Plus className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <span className="text-xs text-muted-foreground">เพิ่ม</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {apps.map((app, index) => (
                  <div
                    key={app.id}
                    draggable={editing}
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      dragIndex === index ? "opacity-50" : ""
                    } ${editing ? "cursor-grab active:cursor-grabbing" : "cursor-pointer hover:bg-muted"}`}
                  >
                    {editing && <GripVertical className="h-4 w-4 text-muted-foreground" />}
                    <div className={`w-10 h-10 rounded-xl ${app.bg} flex items-center justify-center text-lg`}>
                      {app.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{app.name}</p>
                      <p className="text-xs text-muted-foreground">เปิดใช้งาน</p>
                    </div>
                    {editing && (
                      <button
                        onClick={() => handleRemoveApp(app.id)}
                        className="text-red-500 text-sm"
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Nav */}
            <div className="flex items-center justify-around mt-6 pt-4 border-t">
              <div className="flex flex-col items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-primary" />
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex flex-col items-center gap-1 text-muted-foreground">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* App List Settings */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Apps ที่แสดงบนหน้าหลัก</h3>
          <div className="grid gap-3">
            {apps.map((app, index) => (
              <div
                key={app.id}
                className="flex items-center gap-3 p-3 bg-muted rounded-lg"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <div className={`w-10 h-10 rounded-xl ${app.bg} flex items-center justify-center text-lg`}>
                  {app.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{app.name}</p>
                  <p className="text-xs text-muted-foreground">ตำแหน่งที่ {index + 1}</p>
                </div>
                <Link href={`/store`}>
                  <Button variant="outline" size="sm">เปลี่ยน</Button>
                </Link>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </>
  )
}
