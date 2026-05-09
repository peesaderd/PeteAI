import React from 'react';
import { RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Search } from 'lucide-react';

// Loading Skeleton
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`bg-[hsl(var(--muted))] rounded-lg animate-pulse ${className}`} />;
}

// Stat Card
export function StatCard({ icon: Icon, label, value, sub, color, trend }: any) {
  return (
    <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        {trend !== undefined && (
          <span className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-[hsl(var(--foreground))]">{value}</div>
      <div className="text-sm text-[hsl(var(--muted-foreground))]">{label}</div>
      {sub && <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{sub}</div>}
    </div>
  );
}

// Page Header
export function PageHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">{title}</h1>
        {description && <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-3">{children}</div>}
    </div>
  );
}

// Data Table
export function DataTable({ columns, data, loading, onRowClick }: any) {
  if (loading) return <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-8"><Skeleton className="h-64" /></div>;
  return (
    <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-[hsl(var(--border))]">
              {columns.map((col: any, i: number) => (
                <th key={i} className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))] text-xs uppercase tracking-wider">{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {data.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-[hsl(var(--muted-foreground))]">No data available</td></tr>
            ) : data.map((row: any, i: number) => (
              <tr key={row.id || i} className={`hover:bg-[hsl(var(--muted))] transition-colors ${onRowClick ? 'cursor-pointer' : ''}`} onClick={() => onRowClick?.(row)}>
                {columns.map((col: any, j: number) => (
                  <td key={j} className="px-4 py-3 text-[hsl(var(--foreground))]">{col.render ? col.render(row) : row[col.accessor]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Status Badge
export function StatusBadge({ status, mapping }: { status: string; mapping?: Record<string, string> }) {
  const defaultMap: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    inactive: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
    pending: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    in_progress: 'bg-blue-100 text-blue-700',
    draft: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };
  const cls = mapping?.[status] || defaultMap[status] || 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>;
}

// Modal
export function Modal({ open, onClose, title, children }: any) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-[hsl(var(--card))] rounded-xl shadow-xl border border-[hsl(var(--border))] w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-[hsl(var(--muted))] rounded">&times;</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// Form Input
export function Input({ label, error, ...props }: any) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">{label}</label>}
      <input className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${error ? 'border-red-300' : 'border-[hsl(var(--input))]'}`} {...props} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// Select
export function Select({ label, options, error, ...props }: any) {
  return (
    <div className="mb-4">
      {label && <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">{label}</label>}
      <select className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-[hsl(var(--card))] ${error ? 'border-red-300' : 'border-[hsl(var(--input))]'}`} {...props}>
        {options.map((o: any, i: number) => (
          <option key={i} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// Tabs
export function Tabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="flex gap-1 bg-[hsl(var(--muted))] p-1 rounded-lg mb-6">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${active === t.id ? 'bg-[hsl(var(--card))] text-[hsl(var(--foreground))] shadow-sm' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>{t.label}</button>
      ))}
    </div>
  );
}

// Pagination
export function Pagination({ page, total, limit, onChange }: any) {
  const totalPages = Math.ceil(total / limit);
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[hsl(var(--card))] border-t border-[hsl(var(--border))]">
      <span className="text-sm text-[hsl(var(--muted-foreground))]">Showing {Math.min((page - 1) * limit + 1, total)}-{Math.min(page * limit, total)} of {total}</span>
      <div className="flex gap-1">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="p-1 rounded hover:bg-[hsl(var(--muted))] disabled:opacity-30"><ChevronLeft size={18} /></button>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="p-1 rounded hover:bg-[hsl(var(--muted))] disabled:opacity-30"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}
