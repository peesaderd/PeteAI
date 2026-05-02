import React, { useState, useEffect } from 'react';
import { Brain, Plus, Check, X, RefreshCw, AlertCircle, Power, Zap } from 'lucide-react';

const API_BASE = '/api';

const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI', defaultUrl: 'https://api.openai.com/v1' },
  { value: 'deepseek', label: 'DeepSeek', defaultUrl: 'https://api.deepseek.com' },
  { value: 'anthropic', label: 'Anthropic', defaultUrl: 'https://api.anthropic.com/v1' },
  { value: 'ollama', label: 'Ollama (Local)', defaultUrl: 'http://localhost:11434' },
  { value: 'openhands', label: 'OpenHands', defaultUrl: '' },
  { value: 'custom', label: 'Custom API', defaultUrl: '' },
];

function ProviderCard({ provider, onActivate, onTest, onDelete, onEdit, isTesting }: any) {
  const providerMeta = PROVIDER_OPTIONS.find(p => p.value === provider.provider);
  return (
    <div className={`bg-white rounded-xl border p-5 ${provider.is_active ? 'border-blue-300 ring-1 ring-blue-200' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{provider.name}</h3>
            {provider.is_active ? (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Active</span>
            ) : null}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{providerMeta?.label || provider.provider}</p>
        </div>
        <div className="flex items-center gap-1">
          {!provider.is_active ? (
            <button onClick={() => onActivate(provider.id)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Activate">
              <Power size={16} />
            </button>
          ) : null}
          <button onClick={() => onTest(provider.id)} disabled={isTesting} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg" title="Test Connection">
            <RefreshCw size={16} className={isTesting ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => onEdit(provider)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Edit">
            <Zap size={16} />
          </button>
          <button onClick={() => onDelete(provider.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="space-y-1 text-sm text-gray-600">
        <div className="flex justify-between"><span>Model:</span><span className="font-mono text-gray-800">{provider.model}</span></div>
        <div className="flex justify-between"><span>Max Tokens:</span><span>{provider.max_tokens}</span></div>
        <div className="flex justify-between"><span>Temperature:</span><span>{provider.temperature}</span></div>
        {provider.api_url ? <div className="flex justify-between"><span>API URL:</span><span className="font-mono text-xs text-gray-500 truncate max-w-[200px]">{provider.api_url}</span></div> : null}
      </div>
    </div>
  );
}

export default function AIProviderSettings() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [form, setForm] = useState({
    name: '', provider: 'openai', apiKey: '', apiUrl: '', model: 'gpt-4o', maxTokens: 4096, temperature: 0.3,
  });

  const tenantId = 'demo';

  async function loadProviders() {
    try {
      setLoading(true);
      const res = await fetch(API_BASE + '/ai/providers', { headers: { 'x-tenant-id': tenantId } });
      const data = await res.json();
      setProviders(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProviders(); }, []);

  function handleProviderChange(val: string) {
    const meta = PROVIDER_OPTIONS.find(p => p.value === val);
    setForm({ ...form, provider: val, apiUrl: meta?.defaultUrl || '', model: val === 'deepseek' ? 'deepseek-chat' : val === 'anthropic' ? 'claude-3-opus-20240229' : val === 'ollama' ? 'llama3' : 'gpt-4o' });
  }

  async function handleSave() {
    try {
      setError('');
      const body: any = { ...form };
      if (editing) body.providerId = editing.id;
      const res = await fetch(API_BASE + '/ai/providers' + (editing ? '/' + editing.id : ''), {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setShowForm(false);
      setEditing(null);
      setForm({ name: '', provider: 'openai', apiKey: '', apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o', maxTokens: 4096, temperature: 0.3 });
      await loadProviders();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleActivate(id: string) {
    try {
      setError('');
      await fetch(API_BASE + '/ai/providers/' + id + '/activate', { method: 'POST', headers: { 'x-tenant-id': tenantId } });
      await loadProviders();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleTest(id: string) {
    try {
      setTesting(id);
      setTestResult(null);
      const res = await fetch(API_BASE + '/ai/providers/' + id + '/test', { method: 'POST', headers: { 'x-tenant-id': tenantId } });
      const data = await res.json();
      setTestResult({ id, success: data.success, message: data.message || (data.success ? 'Connection successful' : 'Connection failed') });
    } catch (err: any) {
      setTestResult({ id, success: false, message: err.message });
    } finally {
      setTesting(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this provider?')) return;
    try {
      setError('');
      await fetch(API_BASE + '/ai/providers/' + id, { method: 'DELETE', headers: { 'x-tenant-id': tenantId } });
      await loadProviders();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function handleEdit(provider: any) {
    setEditing(provider);
    setForm({
      name: provider.name,
      provider: provider.provider,
      apiKey: '',
      apiUrl: provider.api_url || '',
      model: provider.model,
      maxTokens: provider.max_tokens,
      temperature: provider.temperature,
    });
    setShowForm(true);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Provider Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Configure and manage AI providers for your ERP system</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ name: '', provider: 'openai', apiKey: '', apiUrl: 'https://api.openai.com/v1', model: 'gpt-4o', maxTokens: 4096, temperature: 0.3 }); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> Add Provider
        </button>
      </div>

      {error ? (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      ) : null}

      {testResult ? (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${testResult.success ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {testResult.success ? <Check size={16} /> : <AlertCircle size={16} />}
          {testResult.message}
          <button onClick={() => setTestResult(null)} className="ml-auto"><X size={14} /></button>
        </div>
      ) : null}

      {showForm ? (
        <div className="mb-6 bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{editing ? 'Edit Provider' : 'Add New Provider'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="My OpenAI" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Provider</label>
              <select value={form.provider} onChange={e => handleProviderChange(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                {PROVIDER_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">API Key</label>
              <input type="password" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} placeholder={editing ? '(unchanged)' : 'sk-...'} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">API URL (optional)</label>
              <input type="text" value={form.apiUrl} onChange={e => setForm({ ...form, apiUrl: e.target.value })} placeholder="https://api.openai.com/v1" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Model</label>
              <input type="text" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Max Tokens</label>
              <input type="number" value={form.maxTokens} onChange={e => setForm({ ...form, maxTokens: parseInt(e.target.value) || 4096 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Temperature (0-2)</label>
              <input type="number" step="0.1" min="0" max="2" value={form.temperature} onChange={e => setForm({ ...form, temperature: parseFloat(e.target.value) || 0.3 })} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              {editing ? 'Update' : 'Save'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading providers...</div>
      ) : providers.length === 0 ? (
        <div className="text-center py-12">
          <Brain size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No AI providers configured yet.</p>
          <p className="text-sm text-gray-400 mt-1">Add a provider to start using AI features.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map(p => (
            <ProviderCard
              key={p.id}
              provider={p}
              onActivate={handleActivate}
              onTest={handleTest}
              onDelete={handleDelete}
              onEdit={handleEdit}
              isTesting={testing === p.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
