// ============================================================
// Telegram Bot — Bridges Telegram messages to AI Orchestrator
// Uses Telegraf (polling mode), forwards all messages to /api/chat
// ============================================================

import "dotenv/config";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ORCHESTRATOR_URL = (process.env.ORCHESTRATOR_URL || "http://127.0.0.1:54516").replace(/\/+$/, "");
const BOT_LANGUAGE = process.env.BOT_LANGUAGE || "th";

if (!BOT_TOKEN) {
  console.error("[TelegramBot] TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

// Map telegram chat_id → orchestrator session_id
const sessionMap = new Map<number, string>();

function getSessionId(chatId: number): string {
  let sid = sessionMap.get(chatId);
  if (!sid) {
    sid = `telegram_${chatId}_${Date.now()}`;
    sessionMap.set(chatId, sid);
  }
  return sid;
}

async function callOrchestrator(
  sessionId: string,
  messageText: string,
  language: string
): Promise<string> {
  const url = `${ORCHESTRATOR_URL}/api/chat`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      message: messageText,
      agent: "erp",
      language,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Orchestrator ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.response || "";
}

// ============================================================
// Bot Setup
// ============================================================

const bot = new Telegraf(BOT_TOKEN);

// Handle /start
bot.command("start", async (ctx) => {
  const chatId = ctx.chat.id;
  sessionMap.delete(chatId); // reset session

  const welcome =
    BOT_LANGUAGE === "th"
      ? `สวัสดี! 🙏\n\nฉันคือ ERP Assistant สามารถช่วยคุณ:\n• ตรวจสอบข้อมูลสินค้าและออเดอร์\n• วิเคราะห์ข้อมูลธุรกิจ\n• ตอบคำถามเกี่ยวกับระบบ ERP\n\nพิมพ์ข้อความเพื่อเริ่มต้น หรือพิมพ์ /reset เพื่อเริ่มบทสนทนาใหม่`
      : `Hello! 🙏\n\nI'm ERP Assistant. I can help you:\n• Check products and orders\n• Analyze business data\n• Answer questions about the ERP system\n\nSend a message to start, or type /reset to begin a new conversation.`;

  await ctx.reply(welcome);
});

// Handle /reset
bot.command("reset", async (ctx) => {
  const chatId = ctx.chat.id;
  sessionMap.delete(chatId);
  const msg =
    BOT_LANGUAGE === "th"
      ? "✅ เริ่มบทสนทนาใหม่แล้ว พิมพ์ข้อความเพื่อเริ่มต้น"
      : "✅ Conversation reset. Send a message to start.";
  await ctx.reply(msg);
});

// Handle /help
bot.command("help", async (ctx) => {
  const help =
    BOT_LANGUAGE === "th"
      ? `📋 คำสั่งที่มี:\n/start — เริ่มต้นใหม่\n/reset — รีเซ็ตบทสนทนา\n/help — คำสั่งทั้งหมด\n\n💡 พิมพ์ข้อความเพื่อถามคำถามเกี่ยวกับ ERP`
      : `📋 Commands:\n/start — Start over\n/reset — Reset conversation\n/help — All commands\n\n💡 Send a message to ask about ERP`;
  await ctx.reply(help);
});

// Handle text messages
bot.on(message("text"), async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  if (!text) return;

  // Show typing indicator
  await ctx.sendChatAction("typing");

  const sessionId = getSessionId(chatId);

  try {
    const response = await callOrchestrator(sessionId, text, BOT_LANGUAGE);

    // Split long messages (Telegram limit: 4096 chars)
    const maxLen = 4000;
    if (response.length <= maxLen) {
      await ctx.reply(response);
    } else {
      for (let i = 0; i < response.length; i += maxLen) {
        await ctx.reply(response.slice(i, i + maxLen));
      }
    }
  } catch (err: any) {
    console.error(`[TelegramBot] Error for chat ${chatId}:`, err.message);
    const fallback =
      BOT_LANGUAGE === "th"
        ? "❌ ขออภัย เกิดข้อผิดพลาดในการติดต่อระบบ กรุณาลองใหม่อีกครั้ง"
        : "❌ Sorry, an error occurred while contacting the system. Please try again.";
    await ctx.reply(fallback);
  }
});

// ============================================================
// Start (long-polling mode with 409 recovery)
// ============================================================

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function startBot(): Promise<void> {
  // Delete any lingering webhook first
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });

  const info = await bot.telegram.getMe();
  console.log(`[TelegramBot] @${info.username} (id: ${info.id}) starting — orchestrator: ${ORCHESTRATOR_URL}`);

  let offset = 0;
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("[TelegramBot] Shutting down...");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Long-polling with timeout=30s — one connection at a time, no 409 risk
  // If 409 somehow occurs (e.g. stale instance), wait for it to die and retry
  while (!shuttingDown) {
    try {
      const updates: any = await bot.telegram.callApi("getUpdates", {
        offset,
        timeout: 30,
      });

      if (!updates || updates.length === 0) continue;

      for (const update of updates) {
        offset = update.update_id + 1;
        bot.handleUpdate(update);
      }
    } catch (err: any) {
      if (err?.description?.includes("409") || err?.message?.includes("409")) {
        console.log(`[TelegramBot] 409 Conflict — waiting 30s for stale instance to die...`);
        await wait(30_000);
        continue;
      }
      console.error(`[TelegramBot] Poll error: ${err.message}, retrying in 5s...`);
      await wait(5_000);
    }
  }
}

startBot().catch((err) => {
  console.error("[TelegramBot] Failed to start:", err.message);
  process.exit(1);
});
