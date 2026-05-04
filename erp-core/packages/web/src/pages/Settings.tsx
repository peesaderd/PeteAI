import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, Shield, Users, Key, Bell, Palette, Sun, Moon, Monitor } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Settings() {
  const [tab, setTab] = useState('general');
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <PageHeader title="Settings" description="System configuration and preferences" />

      <Tabs tabs={[
        { id: 'general', label: 'General' },
        { id: 'users', label: 'Users & Roles' },
        { id: 'security', label: 'Security' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'appearance', label: 'Appearance' },
      ]} active={tab} onChange={setTab} />

      {tab === 'general' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <form onSubmit={handleSave}>
            <Input label="Tenant Name" name="tenantName" defaultValue="Demo Tenant" />
            <Input label="Company Name" name="companyName" defaultValue="ERP Core Ltd" />
            <Input label="Timezone" name="timezone" defaultValue="Asia/Bangkok" />
            <Input label="Currency" name="currency" defaultValue="USD" />
            <div className="flex justify-end mt-6">
              <button type="submit" className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <p className="text-gray-500 text-sm mb-4">User and role management will be available in the next update.</p>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div><span className="font-medium">admin@erp.local</span><p className="text-xs text-gray-500">Administrator</p></div>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Active</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <form onSubmit={handleSave}>
            <Input label="Session Timeout (minutes)" name="sessionTimeout" type="number" defaultValue="60" />
            <Select label="Password Policy" name="passwordPolicy" options={[
              { value: 'standard', label: 'Standard' },
              { value: 'strong', label: 'Strong' },
              { value: 'enterprise', label: 'Enterprise' },
            ]} />
            <div className="flex justify-end mt-6">
              <button type="submit" className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                <Save size={16} /> {saved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <p className="text-gray-500 text-sm mb-4">Configure notification channels and preferences.</p>
          <div className="space-y-3">
            <label className="flex items-center gap-3"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-sm">Email notifications for low stock</span></label>
            <label className="flex items-center gap-3"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-sm">Order confirmation alerts</span></label>
            <label className="flex items-center gap-3"><input type="checkbox" className="rounded" /> <span className="text-sm">Slack integration</span></label>
            <label className="flex items-center gap-3"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-sm">Daily summary reports</span></label>
          </div>
        </div>
      )}

      {tab === 'appearance' && (
        <div className="max-w-4xl space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Palette size={20} className="text-purple-500" /> Theme Mode
            </h3>
            <div className="grid grid-cols-3 gap-4">
              {[
                { id: 'light', icon: Sun, label: 'Light', desc: 'Bright and clean' },
                { id: 'dark', icon: Moon, label: 'Dark', desc: 'Easy on the eyes' },
                { id: 'system', icon: Monitor, label: 'System', desc: 'Follows device' },
              ].map(mode => (
                <button key={mode.id}
                  className={`relative flex flex-col items-center gap-2 p-6 rounded-xl border-2 transition-all ${
mode.id === 'light' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
}`}>
                  <mode.icon size={28} className="text-gray-600" />
                  <span className="font-medium text-sm text-gray-900">{mode.label}</span>
                  <span className="text-xs text-gray-500">{mode.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Primary Color</h3>
            <div className="flex gap-3 flex-wrap">
              {[
                { color: '#2563eb', label: 'Blue' },
                { color: '#7c3aed', label: 'Purple' },
                { color: '#059669', label: 'Emerald' },
                { color: '#dc2626', label: 'Red' },
                { color: '#d97706', label: 'Amber' },
                { color: '#0891b2', label: 'Cyan' },
                { color: '#db2777', label: 'Pink' },
                { color: '#1e293b', label: 'Slate' },
              ].map(c => (
                <button key={c.color} className="flex flex-col items-center gap-1.5 group">
                  <div className={`w-10 h-10 rounded-full border-2 ${
c.color === '#2563eb' ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent group-hover:border-gray-300'
} transition-all`}
                    style={{ backgroundColor: c.color }} />
                  <span className="text-xs text-gray-500">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Layout</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input type="radio" name="layout" defaultChecked className="text-blue-600" />
                <div><span className="text-sm font-medium text-gray-900">Sidebar</span><p className="text-xs text-gray-500">Navigation sidebar on the left</p></div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input type="radio" name="layout" className="text-blue-600" />
                <div><span className="text-sm font-medium text-gray-900">Topbar</span><p className="text-xs text-gray-500">Navigation bar on top</p></div>
              </label>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Font Size</h3>
            <div className="flex gap-3">
              {['Small', 'Medium', 'Large'].map(size => (
                <button key={size}
                  className={`px-6 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
size === 'Medium' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
}`}>
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">
              <Save size={16} /> Save Theme
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
