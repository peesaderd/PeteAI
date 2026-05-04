import React, { useEffect, useState } from 'react';
import { TrendingUp, Package, RefreshCw, BarChart3, AlertTriangle, Download, Calendar, Layers } from 'lucide-react';
import { PageHeader, StatCard, Skeleton, DataTable } from '../components/ui';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function Forecasting() {
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30d');
  const [method, setMethod] = useState('moving_average');
  const [summary, setSummary] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'ai_forecast_demand', args: { tenantId: 't_001', period, method } }),
      });
      const data = await res.json();
      const parsed = JSON.parse(data.content?.[0]?.text || '{}');
      setForecasts(parsed.products || []);
      setSummary(parsed.summary || null);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [period, method]);

  const chartData = {
    labels: forecasts.map((f: any) => {
      const name = f.productName || '';
      return name.length > 10 ? name.slice(0, 10) + '...' : name;
    }),
    datasets: [
      {
        label: 'Current Stock',
        data: forecasts.map((f: any) => f.currentStock || 0),
        backgroundColor: '#3b82f6',
        borderRadius: 4,
      },
      {
        label: 'Forecast Demand',
        data: forecasts.map((f: any) => f.forecastDemand || 0),
        backgroundColor: '#f59e0b',
        borderRadius: 4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 9 } } },
      y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
    },
  };

  const needsReorder = forecasts.filter(f => f.reorderRecommended);
  const highConfidence = forecasts.filter(f => f.confidence === 'high');

  return (
    <div>
      <PageHeader title="Demand Forecasting" description="พยากรณ์ความต้องการสินค้าจากข้อมูลย้อนหลัง">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"><RefreshCw size={18} /></button>
      </PageHeader>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
          <Calendar size={16} className="text-gray-400" />
          <select value={period} onChange={e => setPeriod(e.target.value)} className="text-sm border-none bg-transparent focus:outline-none">
            <option value="7d">7 Days</option>
            <option value="30d">30 Days</option>
            <option value="90d">90 Days</option>
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-3 py-2">
          <Layers size={16} className="text-gray-400" />
          <select value={method} onChange={e => setMethod(e.target.value)} className="text-sm border-none bg-transparent focus:outline-none">
            <option value="moving_average">Moving Average</option>
            <option value="trend">Trend</option>
            <option value="simple">Simple</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Package} label="Products Analyzed" value={forecasts.length.toString()} color="bg-blue-500" />
        <StatCard icon={AlertTriangle} label="Needs Reorder" value={needsReorder.length.toString()} color="bg-orange-500" />
        <StatCard icon={BarChart3} label="High Confidence" value={highConfidence.length.toString()} color="bg-green-500" />
        <StatCard icon={TrendingUp} label="Method" value={method === 'moving_average' ? 'Moving Avg' : method === 'trend' ? 'Trend' : 'Simple'} color="bg-purple-500" />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock vs Forecast Demand</h3>
        {forecasts.length > 0 ? (
          <div className="h-80">
            <Bar data={chartData} options={chartOptions} />
          </div>
        ) : (
          <div className="h-80 flex items-center justify-center text-gray-400">
            {loading ? 'Loading...' : 'No data available'}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Forecast Details</h3>
        <DataTable columns={[
          { header: 'Product', accessor: 'productName' },
          { header: 'Current Stock', render: (r: any) => <span className="font-medium">{r.currentStock || 0}</span> },
          { header: 'Avg Daily Sales', render: (r: any) => r.avgDailySales?.toFixed(1) },
          { header: 'Forecast Demand', render: (r: any) => <span className="font-bold text-amber-600">{r.forecastDemand || 0}</span> },
          { header: 'Confidence', render: (r: any) => {
            const colors: Record<string, string> = { high: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-red-100 text-red-700' };
            return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[r.confidence] || 'bg-gray-100'}`}>{r.confidence}</span>;
          }},
          { header: 'Reorder', render: (r: any) => r.reorderRecommended ? <span className="text-red-600 font-bold">⚠ Yes</span> : <span className="text-green-600">✓ No</span> },
        ]} data={forecasts} loading={loading} />
      </div>
    </div>
  );
}
