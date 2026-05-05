import React, { useEffect, useState, useRef } from "react";
import { Bot, Send, User, MessageSquare, Plus, Trash2 } from "lucide-react";

const API_BASE = "/api";

interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: string;
  toolResults?: string;
  createdAt: number;
}

interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export default function AIChatbot() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load sessions on mount
  useEffect(() => {
    fetchSessions();
  }, []);

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const fetchSessions = async () => {
    try {
      const res = await fetch(API_BASE + "/chat/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {}
  };

  const fetchMessages = async (sessionId: string) => {
    try {
      const res = await fetch(API_BASE + "/chat/sessions/" + sessionId + "/messages");
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch {}
  };

  const createNewSession = async () => {
    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello", agent: "erp", language: "th" }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSessionId(data.sessionId);
        fetchSessions();
      }
    } catch {}
  };

  const deleteSession = async (id: string) => {
    try {
      await fetch(API_BASE + "/chat/sessions/" + id, { method: "DELETE" });
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      fetchSessions();
    } catch {}
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const text = input;
    setInput("");
    setLoading(true);

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: "temp_" + Date.now(),
      role: "user",
      content: text,
      createdAt: Date.now(),
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await fetch(API_BASE + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          message: text,
          agent: "erp",
          language: "th",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Set active session if new
        if (!activeSessionId && data.sessionId) {
          setActiveSessionId(data.sessionId);
          fetchSessions();
        }
        // Reload messages from server
        const sid = data.sessionId || activeSessionId;
        if (sid) {
          fetchMessages(sid);
        }
      } else {
        throw new Error("API error");
      }
    } catch {
      // Remove temp message on failure
      setMessages(prev => prev.filter(m => m.id !== tempUserMsg.id));
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId) || null;

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
              <span className="truncate flex-1">{s.title || "New Chat"}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col">
        {activeSession ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.filter(m => m.role !== "system").map((msg) => (
                <div key={msg.id} className={"flex gap-3 " + (msg.role === "user" ? "justify-end" : "")}>
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
