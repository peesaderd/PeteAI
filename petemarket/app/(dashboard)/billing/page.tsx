"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, CreditCard, Loader2, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

const plans = [
  {
    name: "Starter",
    description: "สำหรับธุรกิจขนาดเล็ก",
    price: 299,
    tier: "starter",
    features: [
      "ใช้งานได้ 3 AI Apps",
      "1,000 ครั้งต่อเดือน",
      "Priority support",
    ],
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER || "",
  },
  {
    name: "Pro",
    description: "สำหรับธุรกิจที่เติบโต",
    price: 799,
    tier: "pro",
    features: [
      "ใช้งานได้ทุก AI App",
      "10,000 ครั้งต่อเดือน",
      "24/7 support",
      "API access",
    ],
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO || "",
    popular: true,
  },
]

function BillingContent() {
  const [loading, setLoading] = useState<string | null>(null)
  const [userTier, setUserTier] = useState<string>("free")
  const searchParams = useSearchParams()
  const supabase = createClient()

  const success = searchParams.get("success")
  const canceled = searchParams.get("canceled")

  if (success) {
    toast.success("สมัครสมาชิกเรียบร้อยแล้ว! 🎉")
  }
  if (canceled) {
    toast.info("ยกเลิกการสมัครสมาชิก")
  }

  const handleSubscribe = async (priceId: string, tier: string) => {
    setLoading(tier)
    
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, tier }),
      })

      const data = await response.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || "Failed to create checkout session")
      }
    } catch (error) {
      toast.error("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง")
      setLoading(null)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">สมัครสมาชิก</h2>
        <p className="text-muted-foreground">เลือกแพลนที่เหมาะกับคุณ</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={plan.popular ? "border-primary border-2 relative" : ""}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-sm font-medium px-3 py-1 rounded-full">
                  แนะนำ
                </span>
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <span className="text-4xl font-bold">{plan.price}฿</span>
                <span className="text-muted-foreground">/เดือน</span>
              </div>
              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                onClick={() => handleSubscribe(plan.stripePriceId, plan.tier)}
                disabled={loading !== null || userTier === plan.tier || !plan.stripePriceId}
              >
                {loading === plan.tier ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    กำลังเปลี่ยนเส้นทาง...
                  </>
                ) : userTier === plan.tier ? (
                  "แพลนปัจจุบัน"
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    สมัคร {plan.name}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">ต้องการความช่วยเหลือ?</CardTitle>
          <CardDescription>
            ติดต่อทีมงานของเราได้ตลอด 24 ชั่วโมง
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              กลับไปแดชบอร์ด
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

export default function BillingPage() {
  return (
    <main className="container py-8 px-4">
      <Suspense fallback={<div>Loading...</div>}>
        <BillingContent />
      </Suspense>
    </main>
  )
}