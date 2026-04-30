import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseServer } from "@/lib/supabase/server"

const DIFY_API_KEY = process.env.DIFY_API_KEY
const DIFY_BASE_URL = process.env.NEXT_PUBLIC_DIFY_URL || "https://api.dify.ai/v1"

export async function POST(req: NextRequest) {
  try {
    const { appId, query, userId, conversationId } = await req.json()

    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 })
    }

    // If Dify is not configured, return a demo response
    if (!DIFY_API_KEY) {
      return NextResponse.json({
        message: `นี่คือข้อความตอบกลับตัวอย่างสำหรับ: "${query}"\n\nในเวอร์ชันจริง คำตอบนี้จะมาจาก AI ที่เชื่อมต่อกับ Dify หรือ OpenHands`,
        conversationId: null,
      })
    }

    // Call Dify API
    const response = await fetch(`${DIFY_BASE_URL}/chat-messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DIFY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "blocking",
        user: userId || "anonymous",
        conversation_id: conversationId,
      }),
    })

    if (!response.ok) {
      throw new Error("Dify API request failed")
    }

    const data = await response.json()

    // Log usage
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      await supabase.from("usage_logs").insert({
        user_id: user.id,
        app_id: appId || "support",
        action: "chat_message",
        metadata: { query, response_length: data.answer?.length || 0 },
      })
    }

    return NextResponse.json({
      message: data.answer,
      conversationId: data.conversation_id,
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json(
      { error: "Failed to process message" },
      { status: 500 }
    )
  }
}