import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Package, ShoppingCart, Users, DollarSign, TrendingUp, TrendingDown, RefreshCw, AlertTriangle, Factory, Truck, BarChart3, Activity } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, StatCard, Skeleton } from '../components/ui';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [salesTrends, setSalesTrends] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [inventoryReport, setInventoryReport] = useState<any>(null);
  const [productionOrders, setProductionOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [todaySales, setTodaySales] = useState<number>(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(0);
  const [lowStockCount, setLowStockCount] = useState<number>(0);

  const load = async () => {
    setLoading(true);
    try {
      const [s, st, tp, inv, prod] = await Promise.all([
        api.dashboard.summary(),
        api.dashboard.salesTrends(),
        api.dashboard.topProducts(),
        api.dashboard.inventoryReport(),
        api.dashboard.productionOrders(),
      ]);
      const summaryData = JSON.parse(s.content[0].text);
      const trendsData = JSON.parse(st.content[0].text);
      const productsData = JSON.parse(tp.content[0].text);
      const inventoryData = JSON.parse(inv.content[0].text);
      const prodData = JSON.parse(prod.content[0].text);

      setSummary(summaryData);
      setSalesTrends(trendsData);
      setTopProducts(productsData);
      setInventoryReport(inventoryData);
      setProductionOrders(prodData);

      // Calculate real-time KPIs
      const today = new Date().toISOString().slice(0, 10);
      const todaySalesVal = (Array.isArray(trendsData) ? trendsData : [])
        .filter((d: any) => (d.date || d.day || '').startsWith(today.slice(0, 7)))
        .reduce((sum: number, d: any) => sum + (d.amount || d.revenue || 0), 0);
      setTodaySales(todaySalesVal);

      const pending = (Array.isArray(prodData) ? prodData : [])
        .filter((o: any) => o.status === 'pending' || o.status === 'in_progress').length;
      setPendingOrdersCount(pending);

      const lowStock = (inventoryData?.lowStockItems || []).length;
      setLowStockCount(lowStock);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  const totalRevenue = summary?.totalRevenue || 0;
  const totalOrders = summary?.totalOrders || 0;
  const totalCustomers = summary?.totalCustomers || 0;
  const totalProducts = summary?.totalProducts || 0;
  const revenueTrend = summary?.revenueTrend || 0;
  const orderTrend = summary?.orderTrend || 0;

  const lowStockItems = inventoryReport?.lowStockItems || [];
  const pendingOrders = productionOrders.filter((o: any) => o.status === 'pending' || o.status === 'in_progress');

  // Chart data for Sales Trends
  const salesChartData = {
    labels: Array.isArray(salesTrends) ? salesTrends.map((d: any) => {
      const date = new Date(d.date || d.day || Date.now());
      return `${date.getDate()}/${date.getMonth() + 1}`;
    }) : [],
    datasets: [
      {
        label: 'Revenue',
        data: Array.isArray(salesTrends) ? salesTrends.map((d: any) => d.amount || d.revenue || 0) : [],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
      },
    ],
  };

  const salesChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `$${ctx.parsed.y.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, maxTicksLimit: 10 },
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: {
          font: { size: 10 },
          callback: (v: any) => `$${(v / 1000).toFixed(0)}k`,
        },
      },
    },
  };

  // Chart data for Top Products
  const topProductsData = {
    labels: (Array.isArray(topProducts) ? topProducts.slice(0, 8) : []).map((p: any) => {
      const name = p.name || p.productName || '';
      return name.length > 12 ? name.slice(0, 12) + '...' : name;
    }),
    datasets: [
      {
        label: 'Revenue',
        data: (Array.isArray(topProducts) ? topProducts.slice(0, 8) : []).map((p: any) => p.revenue || p.totalRevenue || 0),
        backgroundColor: [
          '#3b82f6', '#7c3aed', '#059669', '#d97706',
          '#dc2626', '#0891b2', '#db2777', '#1e293b',
        ],
        borderRadius: 4,
      },
    ],
  };

  const topProductsOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `$${ctx.parsed.x.toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: {
          font: { size: 10 },
          callback: (v: any) => `$${(v / 1000).toFixed(0)}k`,
        },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 10 } },
      },
    },
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Real-time business overview" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" description="Real-time business overview">
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <Activity size={14} className="text-[hsl(var(--chart-2))]" />
          <span>Auto-refresh every 60s</span>
        </div>
        <button onClick={load} className="p-2 border border-[hsl(var(--border))] rounded-lg hover:bg-[hsl(var(--muted))] transition-colors">
          <RefreshCw size={18} />
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={DollarSign} label="Total Revenue" value={`$${totalRevenue.toLocaleString()}`} trend={revenueTrend} color="bg-green-500" sub="Last 30 days" />
        <StatCard icon={ShoppingCart} label="Orders" value={totalOrders.toString()} trend={orderTrend} color="bg-[hsl(var(--primary))]/100" sub="All time" />
        <StatCard icon={Users} label="Customers" value={totalCustomers.toString()} color="bg-purple-500" sub="Registered" />
        <StatCard icon={Package} label="Products" value={totalProducts.toString()} color="bg-orange-500" sub="Active SKUs" />
      </div>

      {/* Real-time KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-[hsl(var(--chart-2))]/15">
            <DollarSign size={24} className="text-[hsl(var(--chart-2))]" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[hsl(var(--foreground))]">${todaySales.toLocaleString()}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Today's Sales</div>
          </div>
        </div>
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-[hsl(var(--primary))]/15">
            <ShoppingCart size={24} className="text-[hsl(var(--primary))]" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[hsl(var(--foreground))]">{pendingOrdersCount}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Pending Orders</div>
          </div>
        </div>
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-4 flex items-center gap-4">
          <div className="p-3 rounded-lg bg-[hsl(var(--destructive))]/15">
            <AlertTriangle size={24} className="text-[hsl(var(--destructive))]" />
          </div>
          <div>
            <div className="text-2xl font-bold text-[hsl(var(--foreground))]">{lowStockCount}</div>
            <div className="text-sm text-[hsl(var(--muted-foreground))]">Low Stock Items</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Sales Trends Chart */}
        <div className="lg:col-span-2 bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Sales Trends (30 days)</h3>
            <TrendingUp size={20} className="text-[hsl(var(--primary))]" />
          </div>
          {Array.isArray(salesTrends) && salesTrends.length > 0 ? (
            <div className="h-72">
              <Line data={salesChartData} options={salesChartOptions} />
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-[hsl(var(--muted-foreground))]">No sales data available</div>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Top Products</h3>
            <BarChart3 size={20} className="text-[hsl(var(--chart-1))]" />
          </div>
          {Array.isArray(topProducts) && topProducts.length > 0 ? (
            <div className="h-72">
              <Bar data={topProductsData} options={topProductsOptions} />
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-[hsl(var(--muted-foreground))]">No product data</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Low Stock Alerts</h3>
            <AlertTriangle size={20} className="text-[hsl(var(--chart-5))]" />
          </div>
          {lowStockItems.length > 0 ? (
            <div className="space-y-2">
              {lowStockItems.slice(0, 6).map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-[hsl(var(--destructive))]/10 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Package size={16} className="text-red-500" />
                    <span className="text-sm font-medium text-[hsl(var(--foreground))]">{item.productName || item.name}</span>
                  </div>
                  <span className="text-sm font-bold text-[hsl(var(--destructive))]">{item.quantity || item.stock || 0} left</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-[hsl(var(--muted-foreground))]">All stock levels are healthy</div>
          )}
        </div>

        {/* Production Status */}
        <div className="bg-[hsl(var(--card))] rounded-xl border border-[hsl(var(--border))] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[hsl(var(--foreground))]">Production Orders</h3>
            <Factory size={20} className="text-[hsl(var(--primary))]" />
          </div>
          {pendingOrders.length > 0 ? (
            <div className="space-y-2">
              {pendingOrders.slice(0, 6).map((o: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-[hsl(var(--muted))] rounded-lg">
                  <div className="flex items-center gap-3">
                    <Truck size={16} className="text-[hsl(var(--muted-foreground))]" />
                    <div>
                      <span className="text-sm font-medium text-[hsl(var(--foreground))]">{o.productName || 'Order ' + (o.id?.slice(0, 8) || i)}</span>
                      <span className="text-xs text-[hsl(var(--muted-foreground))] ml-2">x{o.quantity || 1}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    o.status === 'in_progress' ? 'bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]' : 'bg-[hsl(var(--chart-4))]/15 text-[hsl(var(--chart-4))]'}`}>{o.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-[hsl(var(--muted-foreground))]">No active production orders</div>
          )}
        </div>
      </div>
    </div>
  );
}
