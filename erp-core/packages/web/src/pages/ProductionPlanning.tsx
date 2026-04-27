import React from 'react';
import {
  Factory, Package, AlertTriangle, Plus, RefreshCw, Calendar,
  ClipboardList, Settings, ChevronDown, Search, Truck
} from 'lucide-react';
import { api } from '../lib/api';

function Skeleton() {
  return <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />;
}

export default function ProductionPlanning() {
  const [loading, setLoading] = React.useState(true);
  const [boms, setBoms] = React.useState<any[]>([]);
  const [prodOrders, setProdOrders] = React.useState<any[]>([]);
  const [reorderRules, setReorderRules] = React.useState<any[]>([]);
  const [reorderNeeds, setReorderNeeds] = React.useState<any[]>([]);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'boms' | 'orders' | 'reorder'>('overview');
  const [tenantId] = React.useState('demo');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [bomRes, prodRes, ruleRes, needRes] = await Promise.all([
        api.mcp('list_boms', { tenantId }).catch(() => ({ content: [{ text: '[]' }] })),
        api.mcp('list_production_orders', { tenantId, status: 'all' }).catch(() => ({ content: [{ text: '[]' }] })),
        api.mcp('list_reorder_rules', { tenantId }).catch(() => ({ content: [{ text: '[]' }] })),
        api.mcp('check_reorder_needs', { tenantId }).catch(() => ({ content: [{ text: '[]' }] })),
      ]);
      setBoms(JSON.parse(bomRes.content[0].text));
      setProdOrders(JSON.parse(prodRes.content[0].text));
      setReorderRules(JSON.parse(ruleRes.content[0].text));
      setReorderNeeds(JSON.parse(needRes.content[0].text));
    } catch (e) {
      console.error('Production load error:', e);
    }
    setLoading(false);
  }, [tenantId]);

  React.useEffect(() => { loadData(); }, [loadData]);

  const pendingOrders = prodOrders.filter((o: any) => o.status === 'pending').length;
  const inProgressOrders = prodOrders.filter((o: any) => o.status === 'in_progress').length;
  const completedOrders = prodOrders.filter((o: any) => o.status === 'completed').length;
  const needsReorder = reorderNeeds.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Production Planning</h1>
          <p className="text-sm text-gray-500 mt-1">BOM management, reorder rules, and production scheduling</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-blue-500"><ClipboardList size={18} className="text-white" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '-' : boms.length}</div>
          <div className="text-sm text-gray-500">Bill of Materials</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-indigo-500"><Factory size={18} className="text-white" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '-' : `${inProgressOrders} / ${prodOrders.length}`}</div>
          <div className="text-sm text-gray-500">Active / Total Orders</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-500"><Truck size={18} className="text-white" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '-' : completedOrders}</div>
          <div className="text-sm text-gray-500">Completed Orders</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${needsReorder > 0 ? 'bg-orange-500' : 'bg-green-500'}`}><AlertTriangle size={18} className="text-white" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '-' : needsReorder}</div>
          <div className="text-sm text-gray-500">Items Need Reorder</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['overview', 'boms', 'orders', 'reorder'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'overview' && '📊 '}
            {tab === 'boms' && '📦 '}
            {tab === 'orders' && '🏭 '}
            {tab === 'reorder' && '📋 '}
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Production Order Status</h2>
            {loading ? <Skeleton /> : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Pending</span>
                  <span className="text-sm font-semibold">{pendingOrders}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="bg-yellow-400 h-2.5 rounded-full" style={{ width: `${prodOrders.length ? (pendingOrders / prodOrders.length) * 100 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">In Progress</span>
                  <span className="text-sm font-semibold">{inProgressOrders}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${prodOrders.length ? (inProgressOrders / prodOrders.length) * 100 : 0}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Completed</span>
                  <span className="text-sm font-semibold">{completedOrders}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${prodOrders.length ? (completedOrders / prodOrders.length) * 100 : 0}%` }} />
                </div>
              </div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Reorder Alerts</h2>
            {loading ? <Skeleton /> : reorderNeeds.length > 0 ? (
              <div className="space-y-3">
                {reorderNeeds.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{item.productName || item.name || item.sku}</div>
                      <div className="text-xs text-gray-500">Current: {item.currentStock ?? item.quantity ?? 0} | Min: {item.minStock ?? item.reorderPoint ?? 0}</div>
                    </div>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">
                      {item.suggestedOrder ?? item.suggestedQuantity ?? 0} needed
                    </span>
                  </div>
                ))}
                {reorderNeeds.length > 5 && (
                  <div className="text-center text-sm text-gray-400">+{reorderNeeds.length - 5} more items</div>
                )}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">All items are well-stocked</div>
            )}
          </div>
        </div>
      )}

      {/* BOMs Tab */}
      {activeTab === 'boms' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Bill of Materials</h2>
            <button className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
              <Plus size={14} /> New BOM
            </button>
          </div>
          {loading ? (
            <div className="p-6"><Skeleton /></div>
          ) : boms.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs border-b border-gray-100">
                    <th className="p-4">Name</th>
                    <th className="p-4">Product</th>
                    <th className="p-4">Components</th>
                    <th className="p-4">Total Cost</th>
                    <th className="p-4">Version</th>
                    <th className="p-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {boms.map((bom: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-4 font-medium text-gray-900">{bom.name}</td>
                      <td className="p-4 text-gray-600">{bom.productName || bom.product_id || '-'}</td>
                      <td className="p-4">{bom.components?.length ?? 0}</td>
                      <td className="p-4">${(bom.totalCost ?? bom.total_cost ?? 0).toFixed(2)}</td>
                      <td className="p-4">v{bom.version ?? 1}</td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          (bom.status ?? 'active') === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {bom.status ?? 'active'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400 text-sm">No BOMs created yet. Create your first Bill of Materials to get started.</div>
          )}
        </div>
      )}

      {/* Production Orders Tab */}
      {activeTab === 'orders' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Production Orders</h2>
            <button className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
              <Plus size={14} /> New Order
            </button>
          </div>
          {loading ? (
            <div className="p-6"><Skeleton /></div>
          ) : prodOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs border-b border-gray-100">
                    <th className="p-4">ID</th>
                    <th className="p-4">Product</th>
                    <th className="p-4">Quantity</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Progress</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {prodOrders.map((order: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-4 text-xs font-mono text-gray-500">{(order.id ?? '').slice(0, 8)}</td>
                      <td className="p-4 font-medium text-gray-900">{order.productName || order.product_id || '-'}</td>
                      <td className="p-4">{order.quantity ?? 0}</td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          order.status === 'completed' ? 'bg-green-100 text-green-700' :
                          order.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {order.status ?? 'pending'}
                        </span>
                      </td>
                      <td className="p-4 text-gray-600">{order.dueDate ? new Date(order.dueDate).toLocaleDateString() : '-'}</td>
                      <td className="p-4">
                        <div className="w-24 bg-gray-100 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${order.progress ?? 0}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400 text-sm">No production orders yet.</div>
          )}
        </div>
      )}

      {/* Reorder Tab */}
      {activeTab === 'reorder' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Reorder Rules</h2>
            {loading ? <Skeleton /> : reorderRules.length > 0 ? (
              <div className="space-y-3">
                {reorderRules.map((rule: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{rule.productName || rule.name || rule.sku}</div>
                      <div className="text-xs text-gray-500">
                        Min: {rule.minStock ?? rule.reorderPoint ?? 0} | 
                        Max: {rule.maxStock ?? rule.maxQuantity ?? 0} | 
                        Qty: {rule.reorderQty ?? rule.quantity ?? 0}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${rule.active ?? rule.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {rule.active ?? rule.enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No reorder rules configured</div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Auto-Schedule</h2>
            <p className="text-sm text-gray-500 mb-4">Automatically generate production orders based on current stock levels and reorder rules.</p>
            <button
              onClick={async () => {
                try {
                  const res = await api.mcp('auto_schedule_production', { tenantId });
                  alert(JSON.parse(res.content[0].text)?.message || 'Production scheduled!');
                  loadData();
                } catch (e: any) {
                  alert('Error: ' + e.message);
                }
              }}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
            >
              <Calendar size={16} /> Run Auto-Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
