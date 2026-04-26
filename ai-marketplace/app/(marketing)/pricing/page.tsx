import Link from "next/link"
import { Check, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Header } from "@/components/layout/header"
import { formatCurrency } from "@/lib/utils"

const plans = [
  {
    name: "ฟรี",
    description: "สำหรับผู้เริ่มต้น",
    price: 0,
    features: [
      "ใช้งานได้ 1 AI App",
      "100 ครั้งต่อเดือน",
      "Chat support",
      "Basic templates",
    ],
    notIncluded: [
      "Advanced AI features",
      "Priority support",
      "Custom branding",
    ],
    tier: "free",
    stripePriceId: "",
  },
  {
    name: "Starter",
    description: "สำหรับธุรกิจขนาดเล็ก",
    price: 299,
    features: [
      "ใช้งานได้ 3 AI Apps",
      "1,000 ครั้งต่อเดือน",
      "Priority support",
      "Standard templates",
      "Basic analytics",
    ],
    notIncluded: [
      "Advanced AI features",
      "Custom branding",
    ],
    tier: "starter",
    stripePriceId: process.env.STRIPE_PRICE_ID_STARTER || "",
  },
  {
    name: "Pro",
    description: "สำหรับธุรกิจที่เติบโต",
    price: 799,
    features: [
      "ใช้งานได้ทุก AI App",
      "10,000 ครั้งต่อเดือน",
      "24/7 support",
      "Premium templates",
      "Advanced analytics",
      "API access",
      "Custom branding",
    ],
    notIncluded: [],
    tier: "pro",
    stripePriceId: process.env.STRIPE_PRICE_ID_MONTHLY || "",
    popular: true,
  },
  {
    name: "Enterprise",
    description: "สำหรับองค์กรใหญ่",
    price: 1999,
    features: [
      "ทุกอย่างใน Pro",
      "Unlimited usage",
      "Dedicated support",
      "Custom AI models",
      "White-label",
      "SLA guarantee",
      "On-premise option",
    ],
    notIncluded: [],
    tier: "enterprise",
    stripePriceId: process.env.STRIPE_PRICE_ID_YEARLY || "",
  },
]

export default function PricingPage() {
  return (
    <>
      <Header />
      <main className="container py-16 px-4">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold mb-4">เลือกแพลนที่เหมาะกับคุณ</h1>
          <p className="text-xl text-muted-foreground">
            เริ่มต้นฟรี อัพเกรดเมื่อพร้อม
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={plan.popular ? "border-primary border-2 relative" : ""}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-sm font-medium px-3 py-1 rounded-full flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    แนะนำ
                  </span>
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <span className="text-4xl font-bold">
                    {formatCurrency(plan.price)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-muted-foreground">/เดือน</span>
                  )}
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {plan.notIncluded.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 flex-shrink-0 opacity-50" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Link href="/register" className="w-full">
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                  >
                    {plan.price === 0 ? "เริ่มต้นฟรี" : "สมัครสมาชิก"}
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center">
          <h2 className="text-2xl font-semibold mb-4">คำถามที่พบบ่อย</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto text-left">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">สามารถยกเลิกได้ไหม?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  ใช่! คุณสามารถยกเลิกได้ทุกเมื่อ ไม่มีค่าธรรมเนียมการยกเลิก
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ถ้าใช้งานเกินลิมิต?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  คุณสามารถซื้อ add-on หรืออัพเกรดแพลนเพื่อเพิ่มลิมิตได้
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">มีระยะทดลองใช้งานไหม?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  แพลน Free ให้คุณทดลองใช้งานได้ตลอดไป ไม่ต้องใช้บัตรเครดิต
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  )
}