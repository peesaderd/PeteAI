import { createClient as createSupabaseServer } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Bot, Download, CreditCard, TrendingUp, ArrowRight, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DashboardHeader } from "@/components/layout/header"

export default async function DashboardPage() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()

  const { data: userApps } = await supabase
    .from("user_apps")
    .select("*, app:apps(*)")
    .eq("user_id", user.id)

  return (
    <>
      <DashboardHeader />
      <main className="container py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">ยินดีต้อนรับ, {profile?.full_name || user.email}!</h1>
          <p className="text-muted-foreground">นี่คือภาพรวมของบัญชีของคุณ</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Apps ที่ติดตั้ง</CardTitle>
              <Download className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{userApps?.length || 0}</div>
              <p className="text-xs text-muted-foreground">จาก 7+ apps ที่มี</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">สถานะสมาชิก</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold capitalize">{profile?.subscription_tier || "Free"}</div>
              <p className="text-xs text-muted-foreground">
                {profile?.subscription_status === "active" ? "ใช้งานอยู่" : "อัพเกรดเพื่อใช้งานเต็มรูปแบบ"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">การใช้งานเดือนนี้</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">ครั้ง</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">วันที่สมัคร</CardTitle>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("th-TH") : "-"}
              </div>
              <p className="text-xs text-muted-foreground">เริ่มใช้งาน</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
          <Link href="/store">
            <Card variant="interactive" className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  App Store
                </CardTitle>
                <CardDescription>ดาวน์โหลด AI apps ใหม่ๆ</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full gap-2">
                  ไป App Store
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/apps">
            <Card variant="interactive" className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Apps ของฉัน
                </CardTitle>
                <CardDescription>จัดการ apps ที่ติดตั้งแล้ว</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full gap-2">
                  ดูทั้งหมด
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/billing">
            <Card variant="interactive" className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  สมัครสมาชิก
                </CardTitle>
                <CardDescription>อัพเกรดเป็น Pro เพื่อใช้งานเต็มรูปแบบ</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full gap-2">
                  ดูแพลน
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* My Apps */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Apps ของฉัน</h2>
            <Link href="/dashboard/apps">
              <Button variant="ghost" size="sm" className="gap-1">
                ดูทั้งหมด
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
          {userApps && userApps.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(userApps as any[]).slice(0, 3).map((userApp) => (
                <Card key={userApp.id} variant="interactive">
                  <CardHeader className="flex flex-row items-center gap-4">
                    <div className="text-4xl">{(userApp as any).app?.icon || "📦"}</div>
                    <div>
                      <CardTitle className="text-lg">{(userApp as any).app?.name}</CardTitle>
                      <CardDescription>{(userApp as any).app?.category}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full">เปิดใช้งาน</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">ยังไม่มี App ที่ติดตั้ง</h3>
              <p className="text-muted-foreground mb-4">ไปที่ App Store เพื่อดาวน์โหลด AI apps ที่คุณต้องการ</p>
              <Link href="/store">
                <Button>ไป App Store</Button>
              </Link>
            </Card>
          )}
        </div>
      </main>
    </>
  )
}