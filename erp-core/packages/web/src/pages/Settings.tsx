import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, Shield, Users, Key, Bell, Palette, Sun, Moon, Monitor, Send, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, Input, Select, Tabs, StatCard } from '../components/ui';

const STORAGE_KEY = 'erp_theme_settings';

function loadSavedTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return {};
}

export default function Settings() {
  const [tab, setTab] = useState('general');
  const [saved, setSaved] = useState(false);
  const savedTheme = loadSavedTheme();
  const [themeMode, setThemeMode] = useState(savedTheme.mode || 'light');
  const [themeColor, setThemeColor] = useState(savedTheme.color || 'blue');
  const [fontSize, setFontSize] = useState(savedTheme.fontSize || 'medium');
  const [telegramToken, setTelegramToken] = useState(localStorage.getItem('erp_telegram_token') || '');
  const [telegramEnabled, setTelegramEnabled] = useState(localStorage.getItem('erp_telegram_enabled') === 'true');
  const [slackWebhook, setSlackWebhook] = useState(localStorage.getItem('erp_slack_webhook') || '');
  const [lineToken, setLineToken] = useState(localStorage.getItem('erp_line_token') || '');

  // Persist theme to CSS variables + localStorage
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--mode', themeMode);
    root.style.setProperty('--color', themeColor);
    root.style.setProperty('--font-size', fontSize);
    if (themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: themeMode, color: themeColor, fontSize }));
  }, [themeMode, themeColor, fontSize]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveTheme = async () => {
    try {
      await api.ui.updateTheme({ mode: themeMode, color: themeColor, fontSize });
    } catch (err) {
      console.warn('Theme API unavailable, saved locally');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveIntegrations = async () => {
    localStorage.setItem('erp_telegram_token', telegramToken);
    localStorage.setItem('erp_telegram_enabled', telegramEnabled ? 'true' : 'false');
    localStorage.setItem('erp_slack_webhook', slackWebhook);
    localStorage.setItem('erp_line_token', lineToken);

    // Save Telegram token to server
    if (telegramToken) {
      try {
        await fetch('/api/settings/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botToken: telegramToken }),
        });
      } catch (err: any) {
        console.warn('Failed to save Telegram token to server:', err.message);
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testTelegram = async () => {
    if (!telegramToken) return alert('Please enter a Telegram Bot Token first');
    try {
      const res = await fetch('https://api.telegram.org/bot' + telegramToken + '/getMe');
      const data = await res.json();
      if (data.ok) {
        alert('Connection successful! Bot: @' + data.result.username);
      } else {
        alert('Connection failed: ' + data.description);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'users', label: 'Users & Security' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'telegram', label: 'Telegram' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your application settings and preferences." />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="space-y-6">
        {tab === 'general' && (
          <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">General Settings</h3>
            <Input label="Company Name" defaultValue="PeteAI Corp" />
            <Select label="Timezone" options={[{ value: 'bkk', label: 'Asia/Bangkok (UTC+7)' }, { value: 'sg', label: 'Asia/Singapore (UTC+8)' }, { value: 'tokyo', label: 'Asia/Tokyo (UTC+9)' }]} />
            <Select label="Currency" options={[{ value: 'thb', label: 'THB' }, { value: 'usd', label: 'USD ($)' }, { value: 'sgd', label: 'SGD (S$)' }]} />
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
                    className={`relative flex flex-col items-center gap-2 p-6 rounded-xl border-2 transition-all ${themeMode === mode.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <mode.icon size={28} className={themeMode === mode.id ? 'text-blue-600' : 'text-gray-600'} />
                    <span className="font-medium text-sm text-gray-900">{mode.label}</span>
                    <span className="text-xs text-gray-500">{mode.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Palette size={20} className="text-purple-500" /> Theme Colors
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[{ id: 'blue', label: 'Blue', class: 'bg-blue-500' }, { id: 'indigo', label: 'Indigo', class: 'bg-indigo-500' }, { id: 'purple', label: 'Purple', class: 'bg-purple-500' }, { id: 'emerald', label: 'Emerald', class: 'bg-emerald-500' }].map(color => (
                  <button key={color.id} onClick={() => setThemeColor(color.id)}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${themeColor === color.id ? 'border-blue-500' : 'border-gray-200'}`}>
                    <div className={`w-6 h-6 rounded-full ${color.class}`} />
                    <span className="text-sm font-medium text-gray-900">{color.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Palette size={20} className="text-purple-500" /> Font Size
              </h3>
              <div className="flex gap-4">
                {[{ id: 'small', label: 'Small', desc: '14px' }, { id: 'medium', label: 'Medium', desc: '16px' }, { id: 'large', label: 'Large', desc: '18px' }].map(size => (
                  <button key={size.id} onClick={() => setFontSize(size.id)}
                    className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${fontSize === size.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <span className="font-medium text-sm text-gray-900">{size.label}</span>
                    <span className="text-xs text-gray-500">{size.desc}</span>
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
        {tab === 'telegram' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Send size={20} className="text-blue-500" /> Telegram Bot Settings
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                เชื่อมต่อ Telegram Bot เพื่อให้ AI Chatbot สามารถตอบกลับผ่าน Telegram ได้
              </p>
              <div className="space-y-4">
                <Input
                  label="Bot Token"
                  name="telegram_bot_token"
                  type="password"
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  defaultValue={telegramToken}
                  onChange={(e: any) => setTelegramToken(e.target.value)}
                />
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600 space-y-2">
                  <p className="font-medium text-gray-800">วิธีการตั้งค่า:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>เปิด Telegram ค้นหา <code className="bg-gray-200 px-1 rounded">@BotFather</code></li>
                    <li>ส่งคำสั่ง <code className="bg-gray-200 px-1 rounded">/newbot</code> และทำตามขั้นตอน</li>
                    <li>คัดลอก Token ที่ได้มาใส่ด้านบน</li>
                    <li>ตั้งค่า Webhook URL: <code className="bg-gray-200 px-1 rounded">https://your-domain.com/api/webhooks/telegram</code> <button onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(window.location.origin + "/api/webhooks/telegram"); alert("Copied!"); }} className="text-blue-600 hover:text-blue-800 text-xs ml-1 underline">Copy</button></li>
                  </ol>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="telegram_enabled" defaultChecked={telegramEnabled} onChange={(e) => setTelegramEnabled(e.target.checked)} className="rounded border-gray-300" />
                  <label htmlFor="telegram_enabled" className="text-sm text-gray-700">เปิดใช้งาน Telegram Bot</label>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageCircle size={20} className="text-green-500" /> LINE / Slack Alerts
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                รับการแจ้งเตือนเมื่อ Fraud Detection พบออเดอร์ต้องสงสัย
              </p>
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-800 mb-2">LINE Webhook URL</p>
                  <p className="text-xs text-blue-600 mb-2">นํา URL นี้ไปใส่ใน LINE Developer Console {"003E"} Messaging API {"003E"} Webhook URL</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-white px-3 py-2 rounded border border-blue-200 text-sm text-blue-900 break-all">{window.location.origin}/api/webhooks/line</code>
                    <button onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(window.location.origin + "/api/webhooks/line"); alert("Copied!"); }} className="shrink-0 px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">Copy</button>
                  </div>
                </div>
                <Input
                  label="Slack Webhook URL"
                  name="slack_webhook"
                  type="url"
                  placeholder="https://hooks.slack.com/services/..."
                  defaultValue={slackWebhook}
                  onChange={(e: any) => setSlackWebhook(e.target.value)}
                />
                <Input
                  label="LINE Channel Access Token"
                  name="line_token"
                  type="password"
                  placeholder="LINE Channel Access Token"
                  defaultValue={lineToken}
                  onChange={(e: any) => setLineToken(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={testTelegram} className="flex items-center gap-2 px-6 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm font-medium">
                <Send size={16} /> Test Connection
              </button>
              <button onClick={saveIntegrations} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg hover:bg-blue-700 text-sm font-medium">
                <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
