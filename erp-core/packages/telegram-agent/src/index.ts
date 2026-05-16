import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const PORT = parseInt(process.env.PORT || "54517", 10);
const ERP_MCP_URL = process.env.ERP_MCP_URL || "http://127.0.0.1:54515";
const LLM_API_KEY = process.env.LLM_API_KEY || "sk-762b2269fca7488dace6b8c1fb4afa42";
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.deepseek.com/v1";
const LLM_MODEL = process.env.LLM_MODEL || "deepseek-chat";

const app = express();
app.use(cors());
app.use(express.json());

// ========== SQLite Database ==========
import fs from "fs";
const __dirname = new URL(".", import.meta.url).pathname;
const dbPath = path.join(__dirname, "..", "data", "telegram-agent.db");
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT "",
  status TEXT DEFAULT "queued",
  priority INTEGER DEFAULT 3,
  source TEXT DEFAULT "telegram",
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  completed_at TEXT
)`);

db.exec(`CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  level TEXT DEFAULT "info",
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS conversations (
  chat_id INTEGER PRIMARY KEY,
  session_id TEXT NOT NULL,
  context TEXT DEFAULT "{}",
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP)
)`);

// ========== Helper Functions ==========
function createTask(title: string, description: string, source: string = "telegram") {
  const id = uuidv4();
  db.prepare("INSERT INTO tasks (id, title, description, status, source) VALUES (?, ?, ?, 'queued', ?)").run(id, title, description, source);
  return { id, title, description, status: "queued", source };
}

function updateTaskStatus(taskId: string, status: string) {
  db.prepare(`UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, taskId);
  if (status === "done" || status === "failed") {
    db.prepare(`UPDATE tasks SET completed_at = CURRENT_TIMESTAMP WHERE id = ?`).run(taskId);
  }
}

function getTask(taskId: string): any {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId);
}

function writeLog(taskId: string, level: string, message: string) {
  db.prepare("INSERT INTO logs (task_id, level, message) VALUES (?, ?, ?)").run(taskId, level, message);
}

function getLogs(taskId: string): any[] {
  return db.prepare("SELECT * FROM logs WHERE task_id = ? ORDER BY created_at ASC").all(taskId);
}

function getOrCreateSession(chatId: number): string {
  const existing = db.prepare("SELECT session_id FROM conversations WHERE chat_id = ?").get(chatId) as any;
  if (existing) return existing.session_id;
  const sessionId = uuidv4();
  db.prepare("INSERT INTO conversations (chat_id, session_id) VALUES (?, ?)").run(chatId, sessionId);
  return sessionId;
}

// ========== LLM Call ==========
async function callLLM(messages: any[], tools?: any[]) {
  const body: any = { model: LLM_MODEL, messages };
  if (tools) body.tools = tools;
  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LLM_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LLM API error: ${res.status} ${await res.text()}`);
  return res.json();
}

// ========== ERP MCP Call ==========
async function callERP(tool: string, args: any) {
  const res = await fetch(`${ERP_MCP_URL}/api/mcp/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args }),
  });
  if (!res.ok) throw new Error(`ERP error: ${res.status} ${await res.text()}`);
  return res.json();
}

// ========== Task Board UI ==========
app.get("/task-board", (_req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50").all() as any[];
  const statuses = ["queued", "running", "done", "failed"];
  const cards = statuses.map(s => tasks.filter(t => t.status === s).map(t => `<div class="card ${s}">
    <div class="card-title">${t.title}</div>
    <div class="card-id">${t.id.slice(0, 8)}</div>
    <div class="card-time">${t.created_at}</div>
  </div>`).join(""));
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Task Board</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#1a1a2e;color:#eee;padding:20px}
h1{text-align:center;margin-bottom:20px;color:#e94560}.board{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.column{background:#16213e;border-radius:8px;padding:12px;min-height:200px}
.column h2{text-align:center;margin-bottom:12px;font-size:16px;padding:4px 8px;border-radius:4px}
.column h2.queued{background:#f39c12;color:#000}
.column h2.running{background:#3498db;color:#fff}
.column h2.done{background:#2ecc71;color:#000}
.column h2.failed{background:#e74c3c;color:#fff}
.card{background:#0f3460;border-radius:6px;padding:8px;margin-bottom:8px;font-size:13px}
.card.done{opacity:.6}.card-title{font-weight:bold;margin-bottom:4px}
.card-id{color:#888;font-size:11px}.card-time{color:#666;font-size:10px;margin-top:4px}
</style></head><body><h1>Task Board</h1><div class="board">
${statuses.map((s, i) => `<div class="column"><h2 class="${s}">${s.toUpperCase()} (${tasks.filter(t => t.status === s).length})</h2>${cards[i]}</div>`).join("")}
</div></body></html>`);
});

// ========== API Routes ==========
app.get("/api/health", (_req, res) => {
  const counts = db.prepare("SELECT status, COUNT(*) as count FROM tasks GROUP BY status").all() as any[];
  const countMap: any = { queued: 0, running: 0, done: 0, failed: 0 };
  counts.forEach((c: any) => countMap[c.status] = c.count);
  res.json({ status: "ok", tasks: countMap, uptime: process.uptime() });
});

app.get("/api/tasks", (req, res) => {
  const { status, limit } = req.query;
  let sql = "SELECT * FROM tasks";
  const params: any[] = [];
  if (status) { sql += " WHERE status = ?"; params.push(status); }
  sql += " ORDER BY created_at DESC";
  if (limit) { sql += " LIMIT ?"; params.push(parseInt(limit as string)); }
  res.json(db.prepare(sql).all(...params));
});

app.get("/api/tasks/:id", (req, res) => {
  const task = getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  task.logs = getLogs(req.params.id);
  res.json(task);
});

app.post("/api/tasks", (req, res) => {
  const { title, description, source } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const task = createTask(title, description || "", source || "telegram");
  res.json(task);
});

app.get("/api/tasks/:id/logs", (req, res) => {
  res.json(getLogs(req.params.id));
});

app.post("/api/chat", async (req, res) => {
  const { chatId, message, language } = req.body;
  if (!chatId || !message) return res.status(400).json({ error: "chatId and message are required" });

  const sessionId = getOrCreateSession(chatId);
  const task = createTask("Chat: " + message.slice(0, 50), message, "telegram");
  updateTaskStatus(task.id, "running");
  writeLog(task.id, "info", "รับข้อความจาก chat " + chatId + ': "' + message.slice(0, 100) + '"');

  try {
    const systemPrompt = "คุณคือ Jarvis Agent — ผู้ช่วย AI สำหรับระบบ ERP Core\n\n"
      + "กฎเหล็ก — ห้ามละเมิด:\n"
      + "1. ก่อนเริ่มงานทุกครั้ง → write_log(\"เริ่ม: {task_name}\")\n"
      + "2. ทุก Step ที่เสร็จ → write_log(\"กำลังทำ: {step_name}\")\n"
      + "3. งานเสร็จ → write_log(\"เสร็จ: {task_name}\") + update_task_status(\"done\")\n"
      + "4. ถ้า Tool ใช้ไม่ได้ → write_log(\"ติด: {ปัญหา}\") + retry 3 ครั้ง\n"
      + "5. ห้ามทำงานโดยไม่ write_log\n"
      + "6. ห้ามตอบผู้ใช้โดยไม่ write_log\n\n"
      + "คุณสามารถเรียกใช้ ERP tools ผ่าน MCP API เพื่อ:\n"
      + "- ดูข้อมูลสินค้า (get_products)\n"
      + "- ดูออเดอร์ (get_orders)\n"
      + "- ตรวจสอบสต็อก (query_inventory)\n"
      + "- และอื่นๆ\n\n"
      + "ตอบกลับเป็นภาษา " + (language === "th" ? "ไทย" : "อังกฤษ") + " เป็นกันเอง เหมือนคุยกับเพื่อน";

    const llmMessages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ];

    const tools = [
      {
        type: "function",
        function: {
          name: "write_log",
          description: "บันทึกการทำงานลง Task Log",
          parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
        },
      },
      {
        type: "function",
        function: {
          name: "update_task_status",
          description: "อัปเดตสถานะงาน",
          parameters: { type: "object", properties: { status: { type: "string", enum: ["queued", "running", "done", "failed"] } }, required: ["status"] },
        },
      },
      {
        type: "function",
        function: {
          name: "call_erp",
          description: "เรียกใช้ ERP tool",
          parameters: { type: "object", properties: { tool: { type: "string" }, args: { type: "object" } }, required: ["tool", "args"] },
        },
      },
    ];

    const llmResponse = await callLLM(llmMessages, tools);
    const choice = llmResponse.choices?.[0];
    const finishReason = choice?.finish_reason;

    if (finishReason === "tool_calls" && choice.message?.tool_calls) {
      let finalResponse = "";
      for (const tc of choice.message.tool_calls) {
        const fn = tc.function;
        const fnArgs = JSON.parse(fn.arguments);
        if (fn.name === "write_log") {
          writeLog(task.id, "info", fnArgs.message);
        } else if (fn.name === "update_task_status") {
          updateTaskStatus(task.id, fnArgs.status);
        } else if (fn.name === "call_erp") {
          try {
            writeLog(task.id, "info", "เรียก ERP: " + fnArgs.tool);
            const erpResult = await callERP(fnArgs.tool, fnArgs.args);
            finalResponse += JSON.stringify(erpResult, null, 2);
          } catch (err: any) {
            writeLog(task.id, "error", "ERP error: " + err.message);
            finalResponse += "Error: " + err.message;
          }
        }
      }
      llmMessages.push(choice.message);
      for (const tc of choice.message.tool_calls) {
        llmMessages.push({ role: "tool", tool_call_id: tc.id, content: finalResponse || "done" });
      }
      const finalResponse2 = await callLLM(llmMessages);
      const finalText = finalResponse2.choices?.[0]?.message?.content || "";
      updateTaskStatus(task.id, "done");
      writeLog(task.id, "info", "เสร็จ: ตอบกลับผู้ใช้แล้ว");
      return res.json({ response: finalText, sessionId, taskId: task.id });
    }

    const text = choice?.message?.content || "";
    updateTaskStatus(task.id, "done");
    writeLog(task.id, "info", "เสร็จ: ตอบกลับผู้ใช้แล้ว");
    res.json({ response: text, sessionId, taskId: task.id });

  } catch (err: any) {
    updateTaskStatus(task.id, "failed");
    writeLog(task.id, "error", "Error: " + err.message);
    console.error("[TelegramAgent] Error:", err.message);
    res.json({
      response: language === "th" ? "❌ ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง" : "❌ Sorry, an error occurred. Please try again.",
      sessionId,
      taskId: task.id,
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("[TelegramAgent] Running on http://0.0.0.0:" + PORT);
  console.log("[TelegramAgent] Task Board: http://0.0.0.0:" + PORT + "/task-board");
  console.log("[TelegramAgent] ERP MCP: " + ERP_MCP_URL);
  console.log("[TelegramAgent] LLM: " + LLM_MODEL);
});
