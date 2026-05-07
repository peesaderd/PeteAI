import Link from "next/link"
import { Bot, Zap, Shield, Globe, ArrowRight, Star, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const features = [
  {
    icon: Bot,
    title: "AI อัจฉริยะ",
    description: "รวม AI models ชั้นนำจาก OpenAI, Anthropic และอื่นๆ",
  },
  {
    icon: Zap,
    title: "ใช้งานง่าย",
    description: "Interface ที่เข้าใจง่าย ไม่ต้องมีความรู้ด้านเทคนิค",
  },
  {
    icon: Shield,
    title: "ปลอดภัย",
    description: "ข้อมูลของคุณถูกเข้ารหัสและป้องกันอย่างดี",
  },
  {
    icon: Globe,
    title: "เข้าถึงได้ทุกที่",
    description: "ใช้งานได้ทุกอุปกรณ์ ไม่ว่าจะเป็นมือถือหรือคอมพิวเตอร์",
  },
]

const apps = [
  { name: "AI Video TikTok", emoji: "🎬", category: "วิดีโอ" },
  { name: "Chat + RAG", emoji: "💬", category: "แชท" },
  { name: "Appsheet Alternative", emoji: "📱", category: "ธุรกิจ" },
  { name: "Shopback Alternative", emoji: "💰", category: "Affiliate" },
  { name: "Trip Planner", emoji: "✈️", category: "ท่องเที่ยว" },
  { name: "Social Auto Post", emoji: "📤", category: "โซเชียล" },
  { name: "Ghost Chat AI", emoji: "👻", category: "แชท" },
]

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center bg-gradient-to-b from-background to-muted/20">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
          <Zap className="h-4 w-4" />
          <span>เปิดตัวอย่างเป็นทางการ</span>
        </div>
        
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          PeteMarket<br />
          <span className="text-primary">ศูนย์รวม AI Apps</span>
        </h1>
        
        <p className="text-xl text-muted-foreground max-w-2xl mb-8">
          แพลตฟอร์มที่รวม AI-powered mini-apps หลากหลาย 
          ช่วยให้ธุรกิจของคุณเติบโตได้เร็วขึ้น พร้อมสร้าง App ของคุณเองได้
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/register">
            <Button size="lg" className="gap-2">
              เริ่มต้นใช้งานฟรี
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/store">
            <Button size="lg" variant="outline">
              ดู App Store
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-4 mt-12 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Star className="h-4 w-4 fill-primary text-primary" />
            <span>4.9/5 จากผู้ใช้งาน</span>
          </div>
          <span>•</span>
          <span>100+ ผู้ใช้งาน</span>
          <span>•</span>
          <span>7+ AI Apps</span>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-4 bg-muted/30">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">ทำไมต้อง AI Marketplace?</h2>
            <p className="text-muted-foreground text-lg">ทุกอย่างที่คุณต้องการสำหรับธุรกิจ AI</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="border-2">
                <CardHeader>
                  <feature.icon className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Apps Preview Section */}
      <section className="py-24 px-4">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Mini-apps พร้อมใช้งาน</h2>
            <p className="text-muted-foreground text-lg">เลือกจาก AI apps หลากหลายประเภท</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {apps.map((app) => (
              <Card key={app.name} variant="interactive" className="p-6">
                <div className="text-4xl mb-3">{app.emoji}</div>
                <h3 className="font-semibold mb-1">{app.name}</h3>
                <p className="text-sm text-muted-foreground">{app.category}</p>
              </Card>
            ))}
          </div>
          
          <div className="text-center mt-12">
            <Link href="/store">
              <Button size="lg" variant="outline" className="gap-2">
                ดูทั้งหมดใน App Store
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 bg-primary text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-3xl font-bold mb-4">พร้อมเริ่มต้นหรือยัง?</h2>
          <p className="text-lg mb-8 opacity-90">เริ่มต้นใช้งานฟรีวันนี้ ไม่ต้องใช้บัตรเครดิต</p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="gap-2">
              สมัครสมาชิกฟรี
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 px-4">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2 font-bold">
              <Bot className="h-6 w-6" />
              <span>PeteMarket</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/pricing">ราคา</Link>
              <Link href="/docs">เอกสาร</Link>
              <Link href="#">ติดต่อเรา</Link>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2024 PeteMarket. สงวนลิขสิทธิ์
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}