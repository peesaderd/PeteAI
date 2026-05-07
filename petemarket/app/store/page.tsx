import { createClient as createSupabaseServer } from "@/lib/supabase/server"
import Link from "next/link"
import { Bot, Search, Filter, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout/header"
import { getAppIcon, getCategoryLabel } from "@/lib/utils"

const categories = [
  { id: "all", label: "ทั้งหมด" },
  { id: "video", label: "วิดีโอ" },
  { id: "social", label: "โซเชียล" },
  { id: "chat", label: "แชท" },
  { id: "affiliate", label: "Affiliate" },
  { id: "productivity", label: "เพิ่มประสิทธิภาพ" },
  { id: "automation", label: "อัตโนมัติ" },
]

export default async function StorePage() {
  const supabase = await createSupabaseServer()
  
  const { data: apps } = await supabase
    .from("apps")
    .select("*")
    .eq("is_active", true)
    .order("is_featured", { ascending: false })

  return (
    <>
      <Header />
      <main className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">App Store</h1>
          <p className="text-muted-foreground">เลือกดาวน์โหลด AI apps ที่คุณต้องการ</p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหา apps..."
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={cat.id === "all" ? "default" : "outline"}
                size="sm"
                className="whitespace-nowrap"
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Featured Apps */}
        {apps?.some((a) => a.is_featured) && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">⭐ แนะนำ</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {apps?.filter((a) => a.is_featured).map((app) => (
                <Link key={app.id} href={`/store/${app.slug}`}>
                  <Card variant="interactive" className="h-full">
                    <CardHeader className="flex flex-row items-center gap-4">
                      <div className="text-4xl">{getAppIcon(app.category)}</div>
                      <div>
                        <CardTitle className="text-lg">{app.name}</CardTitle>
                        <CardDescription>{getCategoryLabel(app.category)}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground mb-4">{app.description}</p>
                      <Button className="w-full gap-2">
                        ดูรายละเอียด
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* All Apps */}
        <div>
          <h2 className="text-xl font-semibold mb-4">ทั้งหมด</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {apps?.filter((a) => !a.is_featured).map((app) => (
              <Link key={app.id} href={`/store/${app.slug}`}>
                <Card variant="interactive" className="h-full">
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="text-4xl">{getAppIcon(app.category)}</div>
                    <div>
                      <CardTitle className="text-lg">{app.name}</CardTitle>
                      <CardDescription>{getCategoryLabel(app.category)}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">{app.description}</p>
                    <Button variant="outline" className="w-full gap-2">
                      ดูรายละเอียด
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Empty State */}
        {(!apps || apps.length === 0) && (
          <Card className="p-12 text-center">
            <Bot className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-xl font-semibold mb-2">ยังไม่มี Apps</h3>
            <p className="text-muted-foreground">
              Apps กำลังจะมาเร็วๆ นี้ คอยติดตามได้เลย!
            </p>
          </Card>
        )}
      </main>
    </>
  )
}