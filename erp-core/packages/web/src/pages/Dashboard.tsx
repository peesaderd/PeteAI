import React from 'react';
import {
  DollarSign, ShoppingCart, TrendingUp, AlertTriangle, Package,
  BarChart3, PieChart, LineChart, RefreshCw, Download, Calendar,
  ArrowUpRight, ArrowDownRight, Layers, Truck, Factory, Globe
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { api } from '../lib/api';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function StatCard({ icon: Icon, label, value, sub, color, trend }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
        {trend !== undefined && (
          <span className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, icon: Icon, children, action }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={18} className="text-gray-500" />
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>
        {action && (
          <button onClick={action} className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <RefreshCw size={12} /> Refresh
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Skeleton() {
  return <div className="h-64 bg-gray-100 rounded-lg animate-pulse" />;
}

export default function Dashboard() {
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState<any>(null);
  const [salesTrends, setSalesTrends] = React.useState<any[]>([]);
  const [channelBreakdown, setChannelBreakdown] = React.useState<any[]>([]);
  const [topProducts, setTopProducts] = React.useState<any[]>([]);
  const [inventoryReport, setInventoryReport] = React.useState<any>(null);
  const [productionOrders, setProductionOrders] = React.useState<any[]>([]);
  const [tenantId, setTenantId] = React.useState('demo');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, trendRes, channelRes, topRes, invRes, prodRes] = await Promise.all([
        api.mcp('get_dashboard_summary', { tenantId, period: '30d' }),
        api.mcp('get_sales_trends', { tenantId, days: 30 }),
        api.mcp('get_channel_breakdown', { tenantId, period: '30d' }),
        api.mcp('get_top_products', { tenantId, period: '30d', limit: 10 }),
        api.mcp('get_inventory_report', { tenantId }),
        api.mcp('list_production_orders', { tenantId, status: 'all' }),
      ]);

      setSummary(JSON.parse(sumRes.content[0].text));
      setSalesTrends(JSON.parse(trendRes.content[0].text));
      setChannelBreakdown(JSON.parse(channelRes.content[0].text));
      setTopProducts(JSON.parse(topRes.content[0].text));
      setInventoryReport(JSON.parse(invRes.content[0].text));
      setProductionOrders(JSON.parse(prodRes.content[0].text));
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
    setLoading(false);
  }, [tenantId]);

  React.useEffect(() => { loadData(); }, [loadData]);

  const totalRevenue = summary?.totalRevenue ?? 0;
  const totalOrders = summary?.totalOrders ?? 0;
  const avgOrderValue = summary?.averageOrderValue ?? 0;
  const revenueGrowth = summary?.revenueGrowth ?? 0;
  const orderGrowth = summary?.orderGrowth ?? 0;

  const lowStockCount = inventoryReport?.lowStock ?? inventoryReport?.items?.filter((i: any) => (i.quantity ?? 0) <= (i.reorderPoint ?? 0)).length ?? 0;
  const totalInventoryValue = inventoryReport?.totalValue ?? 0;
  const totalProducts = inventoryReport?.totalProducts ?? 0;

  const pendingProduction = productionOrders?.filter((o: any) => o.status === 'pending' || o.status === 'in_progress').length ?? 0;
  const totalProduction = productionOrders?.length ?? 0;

  const channelData = Array.isArray(channelBreakdown) ? channelBreakdown :
    channelBreakdown?.channels?.map((c: any) => ({ name: c.channel || c.name, value: c.revenue || c.sales || 0 })) ?? [];

  const trendData = Array.isArray(salesTrends) ? salesTrends :
    salesTrends?.trends?.map((t: any) => ({ date: t.date, revenue: t.revenue, orders: t.orders })) ?? [];

  const productData = Array.isArray(topProducts) ? topProducts :
    topProducts?.products?.map((p: any) => ({ name: p.name, revenue: p.revenue, quantity: p.quantity })) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time business overview and analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="demo">Demo Tenant</option>
          </select>
          <button
            onClick={loadData}
            className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign} label="Total Revenue"
          value={loading ? '-' : `$${(totalRevenue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          trend={revenueGrowth} color="bg-green-500"
          sub="Last 30 days"
        />
        <StatCard
          icon={ShoppingCart} label="Total Orders"
          value={loading ? '-' : totalOrders.toLocaleString()}
          trend={orderGrowth} color="bg-blue-500"
          sub="Last 30 days"
        />
        <StatCard
          icon={TrendingUp} label="Avg Order Value"
          value={loading ? '-' : `$${avgOrderValue.toFixed(2)}`}
          color="bg-purple-500"
        />
        <StatCard
          icon={AlertTriangle} label="Low Stock Items"
          value={loading ? '-' : lowStockCount.toString()}
          color={lowStockCount > 0 ? 'bg-orange-500' : 'bg-green-500'}
          sub={lowStockCount > 0 ? 'Requires attention' : 'All stocked up'}
        />
      </div>

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Package} label="Inventory Value"
          value={loading ? '-' : `$${totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
          color="bg-cyan-500"
          sub={`${totalProducts} products`}
        />
        <StatCard
          icon={Factory} label="Production"
          value={loading ? '-' : `${pendingProduction} active`}
          color="bg-indigo-500"
          sub={`${totalProduction} total orders`}
        />
        <StatCard
          icon={Globe} label="Channels"
          value={loading ? '-' : channelData.length.toString()}
          color="bg-rose-500"
          sub="Connected sales channels"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Sales Trends" icon={LineChart} action={loadData}>
          {loading ? <Skeleton /> : trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="url(#revenueGrad)" strokeWidth={2} />
                <Line type="monotone" dataKey="orders" stroke="#10b981" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No sales data available</div>
          )}
        </ChartCard>

        <ChartCard title="Channel Breakdown" icon={PieChart}>
          {loading ? <Skeleton /> : channelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={channelData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {channelData.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No channel data available</div>
          )}
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top Products by Revenue" icon={BarChart3}>
          {loading ? <Skeleton /> : productData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={productData.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} tickLine={false} width={120} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                  {productData.slice(0, 8).map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No product data available</div>
          )}
        </ChartCard>

        <ChartCard title="Inventory Status" icon={Package}>
          {loading ? <Skeleton /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">{totalProducts}</div>
                  <div className="text-xs text-gray-500">Total Products</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-900">${totalInventoryValue.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">Inventory Value</div>
                </div>
              </div>
              {inventoryReport?.items?.length > 0 && (
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 text-xs">
                        <th className="pb-2">Product</th>
                        <th className="pb-2">Stock</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {inventoryReport.items.slice(0, 6).map((item: any, i: number) => (
                        <tr key={i}>
                          <td className="py-2 text-gray-900">{item.name || item.productName || item.sku}</td>
                          <td className="py-2">{item.quantity ?? item.stock ?? 0}</td>
                          <td className="py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              (item.quantity ?? item.stock ?? 0) <= (item.reorderPoint ?? 5)
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {(item.quantity ?? item.stock ?? 0) <= (item.reorderPoint ?? 5) ? 'Low Stock' : 'In Stock'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Truck size={18} className="text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Production Overview</h2>
          </div>
          {loading ? <Skeleton /> : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Pending Orders</span>
                <span className="font-semibold">{productionOrders?.filter((o: any) => o.status === 'pending').length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">In Progress</span>
                <span className="font-semibold">{productionOrders?.filter((o: any) => o.status === 'in_progress').length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Completed</span>
                <span className="font-semibold">{productionOrders?.filter((o: any) => o.status === 'completed').length ?? 0}</span>
              </div>
              {productionOrders?.length > 0 && (
                <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${(productionOrders.filter((o: any) => o.status === 'completed').length / productionOrders.length) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={18} className="text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button className="p-4 bg-blue-50 rounded-lg text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors text-left">
              <Package size={18} className="mb-1" />
              + New Product
            </button>
            <button className="p-4 bg-green-50 rounded-lg text-green-700 text-sm font-medium hover:bg-green-100 transition-colors text-left">
              <ShoppingCart size={18} className="mb-1" />
              + New Order
            </button>
            <button className="p-4 bg-purple-50 rounded-lg text-purple-700 text-sm font-medium hover:bg-purple-100 transition-colors text-left">
              <BarChart3 size={18} className="mb-1" />
              Generate Report
            </button>
            <button className="p-4 bg-orange-50 rounded-lg text-orange-700 text-sm font-medium hover:bg-orange-100 transition-colors text-left">
              <RefreshCw size={18} className="mb-1" />
              Sync Channels
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
