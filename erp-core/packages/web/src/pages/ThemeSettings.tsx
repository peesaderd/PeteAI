import React from 'react';
import { useTheme, type ThemeName } from '../context/ThemeContext';
import { Palette, Sun, Moon, Monitor, Check, Eye, Layout } from 'lucide-react';

const THEME_CONFIGS: Record<ThemeName, { label: string; desc: string; icon: React.ElementType; colors: { primary: string; bg: string; card: string; text: string; font: string } }> = {
  tailadmin: {
    label: 'TailAdmin',
    desc: 'Modern dashboard theme with brand blue accents',
    icon: Palette,
    colors: { primary: '#465fff', bg: '#f9fafb', card: '#ffffff', text: '#1d2939', font: 'Outfit' },
  },
  default: {
    label: 'Default',
    desc: 'Original ERP Core light theme',
    icon: Sun,
    colors: { primary: '#2563eb', bg: '#f5f5f5', card: '#ffffff', text: '#1d2939', font: 'Inter' },
  },
  dark: {
    label: 'Dark',
    desc: 'Dark mode for low-light environments',
    icon: Moon,
    colors: { primary: '#465fff', bg: '#0f1117', card: '#1a1d2b', text: '#e5e7eb', font: 'Outfit' },
  },
  "admin-one": {
    label: "Admin One",
    desc: "Clean & minimal style by justboil",
    icon: Layout,
    colors: { primary: "#2563eb", bg: "#f9fafb", card: "#ffffff", text: "#111827", font: "Inter" },
  },
};

export default function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-title-sm font-bold text-gray-800 dark:text-white/90">Theme Settings</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose your preferred dashboard theme</p>
      </div>

      {/* Theme Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(Object.entries(THEME_CONFIGS) as [ThemeName, typeof THEME_CONFIGS.tailadmin][]).map(([key, config]) => {
          const active = theme === key;
          return (
            <button
              key={key}
              onClick={() => setTheme(key)}
              className={`relative rounded-2xl border-2 p-5 text-left transition-all ${
                active
                  ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-500/10'
                  : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-gray-600'
              }`}
            >
              {active && (
                <span className="absolute top-3 right-3 w-6 h-6 bg-brand-500 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" />
                </span>
              )}
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                active ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
              }`}>
                <config.icon size={20} />
              </div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mb-1">{config.label}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{config.desc}</p>

              {/* Color Preview */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-12">Primary</span>
                  <div className="flex-1 h-4 rounded border border-gray-200 dark:border-gray-600" style={{ backgroundColor: config.colors.primary }} />
                  <span className="font-mono text-[10px]">{config.colors.primary}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-12">BG</span>
                  <div className="flex-1 h-4 rounded border border-gray-200 dark:border-gray-600" style={{ backgroundColor: config.colors.bg }} />
                  <span className="font-mono text-[10px]">{config.colors.bg}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-12">Card</span>
                  <div className="flex-1 h-4 rounded border border-gray-200 dark:border-gray-600" style={{ backgroundColor: config.colors.card }} />
                  <span className="font-mono text-[10px]">{config.colors.card}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="w-12">Font</span>
                  <span className="text-sm" style={{ fontFamily: config.colors.font }}>{config.colors.font}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Preview Note */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center gap-2 mb-3">
          <Eye size={18} className="text-gray-500" />
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Preview</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Changes apply immediately. Your theme preference is saved automatically and will persist across sessions.
        </p>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400 text-xs font-medium">
            <Palette size={12} />
            Active: {THEME_CONFIGS[theme].label}
          </span>
          <span className="text-gray-400 text-xs">Saved to localStorage</span>
        </div>
      </div>
    </div>
  );
}
