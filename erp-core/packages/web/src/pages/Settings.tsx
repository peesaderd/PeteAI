import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, Shield, Users, Key, Bell } from 'lucide-react';
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
    </div>
  );
}
