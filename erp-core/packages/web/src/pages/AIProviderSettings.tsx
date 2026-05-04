import React, { useEffect, useState } from "react";
import { Bot, Plus, RefreshCw, Check, Zap, Play, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, StatCard } from "../components/ui";

export default function AIProviderSettings() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.ai.providers();
      setProviders(res);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const testProvider = async (id: string) => {
    try {
      const res = await api.ai.testProvider(id);
      setTestResult(JSON.stringify(res, null, 2));
    } catch (err: any) { setTestResult("Error: " + err.message); }
  };

  const activateProvider = async (id: string) => {
    try {
      await api.ai.activateProvider(id);
      load();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div>
      <PageHeader title="AI Providers" description="Configure AI model providers and API keys">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> Add Provider
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard icon={Bot} label="Providers" value={providers.length.toString()} color="bg-blue-500" />
        <StatCard icon={Zap} label="Active" value={providers.filter((p: any) => p.isActive).length.toString()} color="bg-green-500" />
        <StatCard icon={Check} label="Tested" value={providers.filter((p: any) => p.lastTested).length.toString()} color="bg-purple-500" />
      </div>

      <DataTable columns={[
        { header: "Name", accessor: "name" },
        { header: "Provider", accessor: "providerType" },
        { header: "Model", accessor: "model" },
        { header: "Status", render: (r: any) => <StatusBadge status={r.isActive ? "active" : "inactive"} /> },
        { header: "Last Tested", render: (r: any) => r.lastTested ? new Date(r.lastTested).toLocaleString() : "Never" },
        { header: "Actions", render: (r: any) => (
          <div className="flex gap-1">
            <button onClick={() => testProvider(r.id)} className="p-1 hover:bg-blue-50 rounded text-blue-600" title="Test"><Play size={14} /></button>
            {!r.isActive && <button onClick={() => activateProvider(r.id)} className="p-1 hover:bg-green-50 rounded text-green-600" title="Activate"><Zap size={14} /></button>}
            <button onClick={() => api.ai.deleteProvider(r.id).then(load)} className="p-1 hover:bg-red-50 rounded text-red-600" title="Delete"><Trash2 size={14} /></button>
          </div>
        )},
      ]} data={providers} loading={loading} />

      {testResult && (
        <div className="mt-4 bg-gray-900 text-green-400 p-4 rounded-xl text-xs font-mono max-h-48 overflow-auto">
          <div className="flex justify-between mb-2">
            <span className="text-gray-400">Test Result</span>
            <button onClick={() => setTestResult(null)} className="text-gray-400 hover:text-white">Close</button>
          </div>
          <pre>{testResult}</pre>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add AI Provider">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.ai.createProvider(data);
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Input label="Provider Name" name="name" required />
          <Select label="Provider Type" name="providerType" options={[
            { value: "openai", label: "OpenAI" },
            { value: "anthropic", label: "Anthropic" },
            { value: "google", label: "Google AI" },
            { value: "azure", label: "Azure OpenAI" },
            { value: "ollama", label: "Ollama (Local)" },
            { value: "custom", label: "Custom API" },
          ]} />
          <Input label="Model" name="model" placeholder="gpt-4, claude-3, etc" />
          <Input label="API Key" name="apiKey" type="password" />
          <Input label="API Endpoint" name="apiEndpoint" placeholder="https://api.openai.com/v1" />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
