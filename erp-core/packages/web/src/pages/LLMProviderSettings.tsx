import React, { useEffect, useState } from "react";
import { Bot, Plus, RefreshCw, Trash2, Check, Globe, Key, Cpu } from "lucide-react";
import { PageHeader, DataTable, Modal, Input, Select, StatCard } from "../components/ui";

const LLM_TYPES = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama (Local)" },
  { value: "openrouter", label: "OpenRouter" },
];

const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "o1", "o1-mini", "o3-mini"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  ollama: ["llama3", "llama3.1", "llama3.2", "mistral", "codellama", "mixtral", "qwen2", "qwen2.5", "phi3", "gemma2"],
  openrouter: ["openai/gpt-4o", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "anthropic/claude-3.5-haiku", "google/gemini-pro", "google/gemini-flash", "meta-llama/llama-3.1-70b", "deepseek/deepseek-chat"],
};

const API_BASE = "/api/settings/llm-providers";

async function apiGet() {
  const res = await fetch(API_BASE, { headers: { "x-tenant-id": "t_001" } });
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message);
  return json.data;
}

async function apiPost(body: any) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-tenant-id": "t_001" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message);
  return json.data;
}

async function apiDelete(id: string) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
    headers: { "x-tenant-id": "t_001" },
  });
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message);
  return json.data;
}

export default function LLMProviderSettings() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("openai");
  const [availableModels, setAvailableModels] = useState<string[]>(DEFAULT_MODELS.openai);
  const [selectedModel, setSelectedModel] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiGet();
      setProviders(data);
    } catch (e: any) { showToast("Error loading: " + e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    const models = DEFAULT_MODELS[type] || [];
    setAvailableModels(models);
    if (models.length > 0 && !models.includes(selectedModel)) {
      setSelectedModel(models[0]);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setSelectedType("openai");
    setAvailableModels(DEFAULT_MODELS.openai);
    setSelectedModel("gpt-4o");
    setShowModal(true);
  };

  const openEdit = (provider: any) => {
    setEditing(provider);
    setSelectedType(provider.type);
    const models = (provider.models && provider.models.length > 0) ? provider.models : (DEFAULT_MODELS[provider.type] || []);
    setAvailableModels(models);
    setSelectedModel(provider.selected_model || models[0] || "");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const data: any = {};
    for (const [key, val] of fd.entries()) {
      data[key] = val;
    }
    data.models = availableModels;
    data.selected_model = selectedModel;
    if (editing) data.id = editing.id;
    try {
      await apiPost(data);
      setShowModal(false);
      setEditing(null);
      showToast(editing ? "Provider updated" : "Provider created");
      load();
    } catch (err: any) { showToast("Error: " + err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this provider?")) return;
    try {
      await apiDelete(id);
      showToast("Provider deleted");
      load();
    } catch (err: any) { showToast("Error: " + err.message); }
  };

  return (
    <div>
      <PageHeader title="LLM Providers" description="Configure Large Language Model providers and API keys — select model like OpenHands settings">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> Add Provider
        </button>
      </PageHeader>

      {toast && (
        <div className="mb-4 px-4 py-3 bg-gray-900 text-white rounded-xl text-sm shadow-lg flex items-center gap-2">
          <Check size={16} className="text-green-400" /> {toast}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Bot} label="Total Providers" value={providers.length.toString()} color="bg-blue-500" />
        <StatCard icon={Check} label="Default" value={providers.filter((p: any) => p.is_default).length.toString()} color="bg-green-500" />
        <StatCard icon={Globe} label="Types" value={new Set(providers.map((p: any) => p.type)).size.toString()} color="bg-purple-500" />
        <StatCard icon={Cpu} label="With Model" value={providers.filter((p: any) => p.selected_model).length.toString()} color="bg-amber-500" />
      </div>

      <DataTable columns={[
        { header: "Name", accessor: "name" },
        { header: "Type", render: (r: any) => <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">{r.type}</span> },
        { header: "Model", render: (r: any) => r.selected_model ? <span className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{r.selected_model}</span> : <span className="text-xs text-gray-400">—</span> },
        { header: "Endpoint", render: (r: any) => r.endpoint ? <span className="text-xs text-gray-500 truncate max-w-[180px] inline-block">{r.endpoint}</span> : <span className="text-xs text-gray-400">—</span> },
        { header: "API Key", render: (r: any) => r.api_key ? <span className="font-mono text-xs text-gray-600">{r.api_key}</span> : <span className="text-xs text-gray-400">—</span> },
        { header: "Default", render: (r: any) => r.is_default ? <span className="text-green-600 font-bold">✓</span> : "" },
        { header: "Actions", render: (r: any) => (
          <div className="flex gap-1">
            <button onClick={() => openEdit(r)} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">Edit</button>
            <button onClick={() => handleDelete(r.id)} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50"><Trash2 size={12} className="inline" /></button>
          </div>
        )},
      ]} data={providers} loading={loading} />

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? "Edit LLM Provider" : "Add LLM Provider"}>
        <form onSubmit={handleSubmit}>
          <Input label="Provider Name" name="name" defaultValue={editing?.name || ""} required />
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select name="type" value={selectedType} onChange={(e) => handleTypeChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              {LLM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
            <select name="selected_model" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">Models available for {selectedType}</p>
          </div>

          <Input label="API Endpoint" name="endpoint" defaultValue={editing?.endpoint || ""} placeholder="https://api.openai.com/v1" />
          <Input label="API Key" name="api_key" type="password" placeholder={editing ? "(leave blank to keep existing)" : ""} />
          
          <div className="flex items-center gap-2 mt-4 mb-2">
            <input type="checkbox" name="is_default" value="1" id="is_default" defaultChecked={!!editing?.is_default} className="rounded border-gray-300" />
            <label htmlFor="is_default" className="text-sm text-gray-700">Set as default provider</label>
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editing ? "Update" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
