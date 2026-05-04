import React, { useEffect, useState, useRef } from "react";
import { Bot, Send, User, Cpu, Package, ShoppingCart, AlertTriangle, TrendingUp, RefreshCw, MessageSquare, Plus, Trash2 } from "lucide-react";

const API_BASE = "/api";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  toolResults?: any[];
  timestamp: number;
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const SYSTEM_PROMPT = "You are an AI ERP assistant...";

function generateId() {
  return "chat_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

export default function AIChatbot() {
  const [sessions, setSessions] = useState<Session[]>(() => {
    try {
      const saved = localStorage.getItem("erp_chat_sessions");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("erp_chat_sessions", JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSessionId, sessions]);

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

  const createNewSession = () => {
    const id = generateId();
    const newSession = { id, title: "New Chat", messages: [{ role: "system", content: SYSTEM_PROMPT, timestamp: Date.now() }], createdAt: Date.now() };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(id);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    let session = activeSession;
    if (!session) {
      const id = generateId();
      session = { id, title: input.slice(0, 50), messages: [{ role: "system", content: SYSTEM_PROMPT, timestamp: Date.now() }], createdAt: Date.now() };
      setSessions(prev => [session, ...prev]);
      setActiveSessionId(id);
    }
    const userMsg = { role: "user", content: input, timestamp: Date.now() };
    const updatedMessages = [...session.messages, userMsg];
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, messages: updatedMessages, title: s.messages.length <= 1 ? input.slice(0, 50) : s.title } : s));
    setInput("");
    setLoading(true);
    try {
      const response = await fetch(API_BASE + "/orchestrator/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, message: input, agent: "rd", language: "th" }),
      });
      if (response.ok) {
        const data = await response.json();
        const assistantMsg = { role: "assistant", content: data.response || "...", toolResults: data.toolResults || [], timestamp: Date.now() };
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, messages: [...updatedMessages, assistantMsg] } : s));
      } else throw new Error("Orchestrator unavailable");
    } catch {
      try {
        const mcpResponse = await fetch(API_BASE + "/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool: "ai_chat", args: { message: input, sessionId: session.id, language: "th" } }),
        });
        if (mcpResponse.ok) {
          const data = await mcpResponse.json();
          const text = data.content?.[0]?.text || "...";
          const parsed = JSON.parse(text);
          const assistantMsg = { role: "assistant", content: parsed.response || parsed.message || text, toolResults: parsed.toolResults || [], timestamp: Date.now() };
          setSessions(prev => prev.map(s => s.id === session.id ? { ...s, messages: [...updatedMessages, assistantMsg] } : s));
        } else throw new Error("MCP unavailable");
      } catch {
        const msg = input.toLowerCase();
        let response = "";
        if (msg.includes("สวัสดี") || msg.includes("hello")) {
          response = "สวัสดีครับ! ผมคือ AI Assistant ของระบบ ERP ยินดีให้บริการครับ 🙏\n\nสอบถามเกี่ยวกับ: สินค้า, ออเดอร์, สต็อก, ยอดขาย, พยากรณ์, ตรวจจับความผิดปกติ";
        } else if (msg.includes("สินค้า") || msg.includes("product")) {
          try {
            const res = await fetch(API_BASE + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "list_products", args: { tenantId: "t_001", limit: 10 } }) });
            const data = await res.json();
            const products = JSON.parse(data.content?.[0]?.text || "[]");
            if (products.length > 0) response = "สินค้าที่มีอยู่ในระบบ:\n" + products.slice(0, 10).map((p, i) => (i+1) + ". " + p.name + " - $" + p.price + " (คงเหลือ " + (p.quantity || 0) + ")").join("\n");
            else response = "ไม่พบข้อมูลสินค้า";
          } catch { response = "ไม่สามารถดึงข้อมูลสินค้าได้"; }
        } else if (msg.includes("ออเดอร์") || msg.includes("order")) {
          try {
            const res = await fetch(API_BASE + "/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: "list_orders", args: { tenantId: "t_001", limit: 10 } }) });
            const data = await res.json();
            const orders = JSON.parse(data.content?.[0]?.text || "[]");
            if (orders.length > 0) response = "ออเดอร์ล่าสุด:\n" + orders.slice(0, 10).map((o, i) => (i+1) + ". " + (o.order_number || o.id) + " - $" + o.total + " (" + o.status + ")").join("\n");
            else response = "ไม่พบข้อมูลออเดอร์";
          } catch { response = "ไม่สามารถดึงข้อมูลออเดอร์ได้"; }
        } else {
          response = "ขออภัยครับ ผมไม่เข้าใจคำถาม กรุณาลองถามใหม่ครับ";
        }
        const assistantMsg = { role: "assistant", content: response, timestamp: Date.now() };
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, messages: [...updatedMessages, assistantMsg] } : s));
      }
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <div className="w-64 bg-white rounded-xl border border-gray-200 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200">
          <button onClick={createNewSession} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium">
            <Plus size={16} /> New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map(s => (
            <div key={s.id} className={"group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm " + (activeSessionId === s.id ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50")}
              onClick={() => setActiveSessionId(s.id)}>
              <MessageSquare size={14} />
              <span className="truncate flex-1">{s.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col">
        {activeSession ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeSession.messages.filter(m => m.role !== "system").map((msg, i) => (
                <div key={i} className={"flex gap-3 " + (msg.role === "user" ? "justify-end" : "")}>
                  {msg.role === "assistant" && <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><Bot size={16} className="text-blue-600" /></div>}
                  <div className={"max-w-[75%] " + (msg.role === "user" ? "order-1" : "")}>
                    <div className={"rounded-xl px-4 py-2.5 text-sm " + (msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-800 border border-gray-100")}>
                      {msg.content}
                    </div>
                  </div>
                  {msg.role === "user" && <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center"><User size={16} className="text-gray-600" /></div>}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><Bot size={16} className="text-blue-600" /></div>
                  <div className="bg-gray-50 rounded-xl px-4 py-2.5 border border-gray-100">
                    <div className="flex gap-1"><div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" /><div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay:"150ms"}} /><div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay:"300ms"}} /></div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="พิมพ์ข้อความที่นี่..." disabled={loading}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50" />
                <button onClick={sendMessage} disabled={loading || !input.trim()}
                  className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4"><Bot size={32} className="text-blue-600" /></div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">AI ERP Assistant</h2>
              <p className="text-sm text-gray-500 mb-6">สอบถามข้อมูลสินค้า ออเดอร์ สต็อก หรือสั่งงานระบบ ERP ด้วยภาษาไทย</p>
              <button onClick={createNewSession} className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">
                <MessageSquare size={16} /> เริ่มแชทใหม่
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
