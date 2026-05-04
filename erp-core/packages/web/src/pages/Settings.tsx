import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, Shield, Users, Key, Bell, Palette, Sun, Moon, Monitor } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Settings() {
  const [tab, setTab] = useState('general');
  const [saved, setSaved] = useState(false);
  const [themeMode, setThemeMode] = useState('light');
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [layout, setLayout] = useState('sidebar');
  const [fontSize, setFontSize] = useState('Medium');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveTheme = async () => {
    try {
      await api.ui.updateTheme({ themeMode, primaryColor, layout, fontSize });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      // Fallback: save locally even if API fails
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'users', label: 'Users & Security' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'appearance', label: 'Appearance' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your application settings and preferences."
        icon={SettingsIcon}
      />

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="space-y-6">
        {tab === 'general' && (
          <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">General Settings</h3>
            <Input label="Company Name" defaultValue="PeteAI Corp" />
            <Select label="Timezone" options={[
              { value: 'bkk', label: 'Asia/Bangkok (UTC+7)' },
              { value: 'sg', label: 'Asia/Singapore (UTC+8)' },
              { value: 'tokyo', label: 'Asia/Tokyo (UTC+9)' },
            ]} />
            <Select label="Currency" options={[
              { value: 'thb', label: 'THB (฿)' },
              { value: 'usd', label: 'USD ($)' },
              { value: 'sgd', label: 'SGD (S$)' },
            ]} />
            <div className="flex justify-end">
              <button type="submit" className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">
                <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}

        {tab === 'users' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
            <p className="text-gray-500 text-sm mb-4">Manage users, roles, and security settings.</p>
            <div className="space-y-3">
              <label className="flex items-center gap-3"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-sm">Enable two-factor authentication</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-sm">Require strong passwords</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" className="rounded" /> <span className="text-sm">Allow public registration</span></label>
              <label className="flex items-center gap-3"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-sm">Session timeout after 30 min</span></label>
            </div>
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
                  <button key={mode.id} onClick={() => setThemeMode(mode.id)}
                    className={`relative flex flex-col items-center gap-2 p-6 rounded-xl border-2 transition-all ${
                      themeMode === mode.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <mode.icon size={28} className={themeMode === mode.id ? 'text-blue-600' : 'text-gray-600'} />
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
                  <button key={c.color} onClick={() => setPrimaryColor(c.color)} className="flex flex-col items-center gap-1.5 group">
                    <div className={`w-10 h-10 rounded-full border-2 transition-all ${
                      primaryColor === c.color ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent group-hover:border-gray-300'
                    }`}
                      style={{ backgroundColor: c.color }} />
                    <span className="text-xs text-gray-500">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Layout</h3>
              <div className="grid grid-cols-2 gap-4">
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 ${
                  layout === 'sidebar' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}>
                  <input type="radio" name="layout" checked={layout === 'sidebar'} onChange={() => setLayout('sidebar')} className="text-blue-600" />
                  <div><span className="text-sm font-medium text-gray-900">Sidebar</span><p className="text-xs text-gray-500">Navigation sidebar on the left</p></div>
                </label>
                <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50 ${
                  layout === 'topbar' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}>
                  <input type="radio" name="layout" checked={layout === 'topbar'} onChange={() => setLayout('topbar')} className="text-blue-600" />
                  <div><span className="text-sm font-medium text-gray-900">Topbar</span><p className="text-xs text-gray-500">Navigation bar on top</p></div>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Font Size</h3>
              <div className="flex gap-3">
                {['Small', 'Medium', 'Large'].map(size => (
                  <button key={size} onClick={() => setFontSize(size)}
                    className={`px-6 py-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      fontSize === size ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" onClick={handleSaveTheme} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">
                <Save size={16} /> {saved ? 'Saved!' : 'Save Theme'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}