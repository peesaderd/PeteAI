import React from 'react';
import { Key, Link, Database, Bell, Shield } from 'lucide-react';

function SettingSection({ icon: Icon, title, children }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gray-100 rounded-lg"><Icon size={20} className="text-gray-600" /></div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingSection icon={Link} title="Etsy Integration">
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">API Key</label>
              <input type="text" placeholder="Enter Etsy API Key" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Shop ID</label>
              <input type="text" placeholder="Enter Shop ID" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Connect Etsy</button>
          </div>
        </SettingSection>

        <SettingSection icon={Database} title="Data Management">
          <div className="space-y-3">
            <button className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg text-sm hover:bg-gray-100">
              Export All Data (JSON)
            </button>
            <button className="w-full text-left px-4 py-3 bg-gray-50 rounded-lg text-sm hover:bg-gray-100">
              Export Knowledge Base (Markdown)
            </button>
            <button className="w-full text-left px-4 py-3 bg-red-50 rounded-lg text-sm text-red-600 hover:bg-red-100">
              Clear All Data
            </button>
          </div>
        </SettingSection>

        <SettingSection icon={Shield} title="Multi-tenant">
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Tenant ID</label>
              <input type="text" value="demo" disabled className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Plan</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                <option>Free</option>
                <option>Starter</option>
                <option>Professional</option>
                <option>Enterprise</option>
              </select>
            </div>
          </div>
        </SettingSection>

        <SettingSection icon={Bell} title="Notifications">
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" className="rounded border-gray-300" />
              <span className="text-sm text-gray-600">Low stock alerts</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="rounded border-gray-300" />
              <span className="text-sm text-gray-600">New order notifications</span>
            </label>
            <label className="flex items-center gap-3">
              <input type="checkbox" className="rounded border-gray-300" />
              <span className="text-sm text-gray-600">Etsy sync completed</span>
            </label>
          </div>
        </SettingSection>
      </div>
    </div>
  );
}
