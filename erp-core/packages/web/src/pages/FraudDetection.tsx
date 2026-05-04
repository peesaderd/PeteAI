import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle, RefreshCw, Search, DollarSign, Users, ShoppingCart, Flag, Eye, Bell, Sliders } from 'lucide-react';
import { PageHeader, StatCard, Skeleton, DataTable, StatusBadge } from '../components/ui';

export default function FraudDetection() {
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(0.7);
  const [days, setDays] = useState(30);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'ai_detect_fraud', args: { tenantId: 't_001', days, threshold } }),
      });
      const data = await res.json();
      const parsed = JSON.parse(data.content?.[0]?.text || '{}');
      setFlags(parsed.flags || []);
      setSummary(parsed);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [days, threshold]);

  const criticalCount = flags.filter(f => f.riskLevel === 'critical').length;
  const highCount = flags.filter(f => f.riskLevel === 'high').length;
  const mediumCount = flags.filter(f => f.riskLevel === 'medium').length;

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-100 text-red-700';
      case 'high': return 'bg-orange-100 text-orange-700';
      case 'medium': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div>
      <PageHeader title="Fraud Detection" description="ตรวจจับออเดอร์ต้องสงสัยและวิเคราะห์ความเสี่ยง">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"><RefreshCw size={18} /></button>
      </PageHeader>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
          <Search size={16} className="text-gray-400" />
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="text-sm border-none bg-transparent focus:outline-none">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
          <Sliders size={16} className="text-gray-400" />
          <select value={threshold} onChange={e => setThreshold(Number(e.target.value))} className="text-sm border-none bg-transparent focus:outline-none">
            <option value={0.5}>Low sensitivity (0.5)</option>
            <option value={0.7}>Medium sensitivity (0.7)</option>
            <option value={0.85}>High sensitivity (0.85)</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={ShoppingCart} label="Orders Analyzed" value={summary?.totalOrders?.toString() || '0'} color="bg-blue-500" />
        <StatCard icon={Flag} label="Flags Found" value={flags.length.toString()} color="bg-red-500" />
        <StatCard icon={AlertTriangle} label="Critical" value={criticalCount.toString()} color="bg-red-600" />
        <StatCard icon={Shield} label="Threshold" value={`${(threshold * 100).toFixed(0)}%`} color="bg-purple-500" />
      </div>

      {/* Summary Alert */}
      {summary?.summary && (
        <div className={`mb-6 px-4 py-3 rounded-xl text-sm flex items-center gap-3 ${
          flags.length > 0 ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'
        }`}>
          {flags.length > 0 ? <AlertTriangle size={18} /> : <Shield size={18} />}
          <span className="font-medium">{summary.summary}</span>
        </div>
      )}

      {/* Flags Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Suspicious Orders</h3>
        <DataTable columns={[
          { header: 'Order #', render: (r: any) => <span className="font-mono text-sm">{r.orderNumber || r.orderId?.slice(0, 12)}</span> },
          { header: 'Total', render: (r: any) => <span className="font-medium">${(r.total || 0).toLocaleString()}</span> },
          { header: 'Risk Score', render: (r: any) => (
            <div className="flex items-center gap-2">
              <div className="w-16 bg-gray-200 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${r.riskScore >= 0.9 ? 'bg-red-500' : r.riskScore >= 0.8 ? 'bg-orange-500' : 'bg-yellow-500'}`}
                  style={{ width: `${Math.min(r.riskScore * 100, 100)}%` }} />
              </div>
              <span className="text-xs font-medium">{(r.riskScore * 100).toFixed(0)}%</span>
            </div>
          )},
          { header: 'Risk Level', render: (r: any) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRiskColor(r.riskLevel)}`}>{r.riskLevel}</span> },
          { header: 'Reasons', render: (r: any) => (
            <div className="flex flex-wrap gap-1">
              {(r.reasons || []).slice(0, 2).map((reason: string, i: number) => (
                <span key={i} className="text-xs px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{reason}</span>
              ))}
              {(r.reasons || []).length > 2 && <span className="text-xs text-gray-400">+{r.reasons.length - 2}</span>}
            </div>
          )},
          { header: 'Actions', render: (r: any) => (
            <button onClick={() => setSelectedOrder(r)} className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 flex items-center gap-1">
              <Eye size={12} /> View
            </button>
          )},
        ]} data={flags} loading={loading} />
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setSelectedOrder(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-lg mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Order Details</h3>
              <button onClick={() => setSelectedOrder(null)} className="p-1 hover:bg-gray-100 rounded">&times;</button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Order ID</span><span className="font-mono font-medium">{selectedOrder.orderId}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Order #</span><span className="font-medium">{selectedOrder.orderNumber || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-bold">${(selectedOrder.total || 0).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Risk Score</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRiskColor(selectedOrder.riskLevel)}`}>{(selectedOrder.riskScore * 100).toFixed(0)}% - {selectedOrder.riskLevel}</span>
              </div>
              <div className="flex justify-between"><span className="text-gray-500">Customer</span><span>{selectedOrder.customerId || '-'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Date</span><span>{selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString() : '-'}</span></div>
              <div>
                <span className="text-gray-500 block mb-1">Reasons</span>
                <ul className="list-disc list-inside space-y-1">
                  {(selectedOrder.reasons || []).map((r: string, i: number) => (
                    <li key={i} className="text-gray-700">{r}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end mt-6">
              <button onClick={() => setSelectedOrder(null)} className="px-4 py-2 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
