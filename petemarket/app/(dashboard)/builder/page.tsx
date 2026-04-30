"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Bot,
  Globe,
  MessageSquare,
  Image,
  Database,
  ShoppingCart,
  Calendar,
  FileText,
  ArrowRight,
  Plus,
  Save,
  Eye,
  Smartphone,
} from "lucide-react"

const appTemplates = [
  {
    id: "chatbot",
    name: "AI Chatbot",
    description: "สร้าง Chatbot สำหรับให้ข้อมูลลูกค้า",
    icon: MessageSquare,
    color: "text-blue-500",
    bg: "bg-blue-50",
  },
  {
    id: "content",
    name: "Content Generator",
    description: "สร้างเนื้อหาบทความ โพสต์โซเชียล",
    icon: FileText,
    color: "text-green-500",
    bg: "bg-green-50",
  },
  {
    id: "image",
    name: "Image Generator",
    description: "สร้างรูปภาพด้วย AI",
    icon: Image,
    color: "text-purple-500",
    bg: "bg-purple-50",
  },
  {
    id: "data",
    name: "Data Dashboard",
    description: "แสดงข้อมูลและวิเคราะห์แบบ Real-time",
    icon: Database,
    color: "text-orange-500",
    bg: "bg-orange-50",
  },
  {
    id: "ecommerce",
    name: "ร้านค้าออนไลน์",
    description: "สร้างหน้าร้านค้าพร้อมระบบชำระเงิน",
    icon: ShoppingCart,
    color: "text-red-500",
    bg: "bg-red-50",
  },
  {
    id: "booking",
    name: "ระบบจอง",
    description: "ระบบจองคิว จองห้อง จองบริการ",
    icon: Calendar,
    color: "text-teal-500",
    bg: "bg-teal-50",
  },
  {
    id: "landing",
    name: "Landing Page",
    description: "สร้างหน้าเว็บไซต์สำหรับโปรโมทธุรกิจ",
    icon: Globe,
    color: "text-indigo-500",
    bg: "bg-indigo-50",
  },
  {
    id: "custom",
    name: "Custom App",
    description: "เริ่มต้นจากศูนย์ ปรับแต่งได้เต็มที่",
    icon: Plus,
    color: "text-gray-500",
    bg: "bg-gray-50",
  },
]

export default function BuilderPage() {
  const [step, setStep] = useState<"template" | "configure" | "preview">("template")
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [appName, setAppName] = useState("")
  const [appDescription, setAppDescription] = useState("")

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = appTemplates.find((t) => t.id === templateId)
    if (template) {
      setAppName(template.name)
      setAppDescription(template.description)
    }
    setStep("configure")
  }

  return (
    <>
      <DashboardHeader />
      <main className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">สร้าง App ใหม่</h1>
          <p className="text-muted-foreground">
            สร้าง AI App ของคุณเองโดยไม่ต้องเขียนโค้ด
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-8 text-sm">
          <div className={`flex items-center gap-2 ${step === "template" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "template" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              1
            </div>
            เลือกแม่แบบ
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className={`flex items-center gap-2 ${step === "configure" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "configure" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              2
            </div>
            ตั้งค่า
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className={`flex items-center gap-2 ${step === "preview" ? "text-primary font-semibold" : "text-muted-foreground"}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === "preview" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              3
            </div>
            ตัวอย่าง
          </div>
        </div>

        {step === "template" && (
          <>
            <h2 className="text-xl font-semibold mb-4">เลือกแม่แบบที่คุณต้องการ</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {appTemplates.map((template) => (
                <Card
                  key={template.id}
                  variant="interactive"
                  className="cursor-pointer"
                  onClick={() => handleSelectTemplate(template.id)}
                >
                  <CardHeader>
                    <div className={`w-12 h-12 rounded-lg ${template.bg} flex items-center justify-center mb-2`}>
                      <template.icon className={`h-6 w-6 ${template.color}`} />
                    </div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full gap-2">
                      ใช้แม่แบบนี้
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {step === "configure" && (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">ตั้งค่า App</h2>
              
              <div className="space-y-2">
                <Label htmlFor="appName">ชื่อ App</Label>
                <Input
                  id="appName"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="ชื่อ App ของคุณ"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appDesc">คำอธิบาย</Label>
                <Textarea
                  id="appDesc"
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  placeholder="อธิบายว่า App นี้ทำอะไรได้บ้าง"
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="appSlug">URL Slug</Label>
                <Input
                  id="appSlug"
                  value={appName.toLowerCase().replace(/\s+/g, "-")}
                  placeholder="my-awesome-app"
                />
                <p className="text-xs text-muted-foreground">
                  URL: https://petemarket.app/apps/{appName.toLowerCase().replace(/\s+/g, "-")}
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("template")}>
                  กลับ
                </Button>
                <Button onClick={() => setStep("preview")} className="gap-2">
                  <Eye className="h-4 w-4" />
                  ดูตัวอย่าง
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold">การตั้งค่าเพิ่มเติม</h2>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">AI Integration</CardTitle>
                  <CardDescription>เชื่อมต่อ AI สำหรับ App ของคุณ</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <Bot className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-medium">DeepSeek AI</p>
                        <p className="text-xs text-muted-foreground">โมเดลภาษาเริ่มต้น</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">เปลี่ยน</Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Design</CardTitle>
                  <CardDescription>ปรับแต่งหน้าตา App</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {["#000000", "#ffffff", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"].map((color) => (
                      <button
                        key={color}
                        className="w-8 h-8 rounded-full border-2 border-transparent hover:border-primary transition-colors"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">ตัวอย่าง App</h2>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep("configure")}>
                  แก้ไข
                </Button>
                <Button className="gap-2">
                  <Save className="h-4 w-4" />
                  เผยแพร่
                </Button>
              </div>
            </div>

            {/* Mobile Preview */}
            <div className="flex justify-center mb-8">
              <div className="w-[375px] border-2 rounded-[2rem] p-4 bg-background shadow-xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">{appName || "My App"}</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                  </div>
                </div>
                <div className="aspect-[9/16] bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center p-8">
                    <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-semibold mb-2">{appName || "My App"}</p>
                    <p className="text-sm text-muted-foreground">{appDescription || "คำอธิบาย App"}</p>
                  </div>
                </div>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>สรุปการตั้งค่า</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">ชื่อ App</dt>
                    <dd className="font-medium">{appName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">แม่แบบ</dt>
                    <dd className="font-medium">{selectedTemplate}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">คำอธิบาย</dt>
                    <dd className="font-medium">{appDescription}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </>
  )
}
