import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Package, ShoppingCart, Users, DollarSign, TrendingUp, TrendingDown, RefreshCw, AlertTriangle, Factory, Truck, BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, StatCard, Skeleton } from '../components/ui';

export default function Dashboard() {
  const [summary, setSummary] = useState<any>(null);
  const [salesTrends, setSalesTrends] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [inventoryReport, setInventoryReport] = useState<any>(null);
  const [productionOrders, setProductionOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      setSummary(JSON.parse(s.content[0].text));
      setSalesTrends(JSON.parse(st.content[0].text));
      setTopProducts(JSON.parse(tp.content[0].text));
      setInventoryReport(JSON.parse(inv.content[0].text));
      setProductionOrders(JSON.parse(prod.content[0].text));
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

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

  const totalRevenue = summary?.totalRevenue || 0;
  const totalOrders = summary?.totalOrders || 0;
  const totalCustomers = summary?.totalCustomers || 0;
  const totalProducts = summary?.totalProducts || 0;
  const revenueTrend = summary?.revenueTrend || 0;
  const orderTrend = summary?.orderTrend || 0;

  const lowStockItems = inventoryReport?.lowStockItems || [];
  const pendingOrders = productionOrders.filter((o: any) => o.status === 'pending' || o.status === 'in_progress');

  return (
    <div>
      <PageHeader title="Dashboard" description="Real-time business overview">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={DollarSign} label="Total Revenue" value={`$${totalRevenue.toLocaleString()}`} trend={revenueTrend} color="bg-green-500" sub="Last 30 days" />
        <StatCard icon={ShoppingCart} label="Orders" value={totalOrders.toString()} trend={orderTrend} color="bg-blue-500" sub="All time" />
        <StatCard icon={Users} label="Customers" value={totalCustomers.toString()} color="bg-purple-500" sub="Registered" />
        <StatCard icon={Package} label="Products" value={totalProducts.toString()} color="bg-orange-500" sub="Active SKUs" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Sales Trends Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold mb-4">Sales Trends (30 days)</h3>
          {salesTrends?.length > 0 ? (
            <div className="h-64 flex items-end gap-2">
              {salesTrends.map((d: any, i: number) => {
                const max = Math.max(...salesTrends.map((x: any) => x.amount || x.revenue || 0));
                const h = max > 0 ? ((d.amount || d.revenue || 0) / max) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-400">${(d.amount || d.revenue || 0).toFixed(0)}</span>
                    <div className="w-full bg-blue-100 rounded-t" style={{ height: `${h}%` }}>
                      <div className="bg-blue-500 rounded-t w-full h-full opacity-80 hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-xs text-gray-400">{new Date(d.date || d.day || Date.now()).getDate()}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No sales data available</div>
          )}
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold mb-4">Top Products</h3>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.slice(0, 8).map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-400 w-5">#{i + 1}</span>
                    <span className="text-sm text-gray-700 truncate max-w-[140px]">{p.name || p.productName}</span>
                  </div>
                  <span className="text-sm font-medium">${(p.revenue || p.totalRevenue || 0).toFixed(0)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">No product data</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Low Stock Alerts</h3>
            <AlertTriangle size={20} className="text-orange-500" />
          </div>
          {lowStockItems.length > 0 ? (
            <div className="space-y-2">
              {lowStockItems.slice(0, 6).map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium">{item.productName || item.name}</span>
                  <span className="text-sm font-bold text-red-600">{item.quantity || item.stock || 0} left</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400">All stock levels are healthy</div>
          )}
        </div>

        {/* Production Status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Production Orders</h3>
            <Factory size={20} className="text-blue-500" />
          </div>
          {pendingOrders.length > 0 ? (
            <div className="space-y-2">
              {pendingOrders.slice(0, 6).map((o: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium">{o.productName || 'Order ' + o.id?.slice(0, 8)}</span>
                    <span className="text-xs text-gray-400 ml-2">x{o.quantity || 1}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    o.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>{o.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-gray-400">No active production orders</div>
          )}
        </div>
      </div>
    </div>
  );
}
