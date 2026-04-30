import { useState, useEffect, useCallback } from 'react';
import {
  getDashboardSummary, getTopProducts, getOrders, getInventory,
  getChannelBreakdown, getSalesReport, formatCurrency,
  getErpConfig, loadErpConfig,
} from '../utils/erpApi';

type Tab = 'overview' | 'products' | 'orders' | 'inventory' | 'analytics';

interface DashboardData {
  summary: any;
  topProducts: any[];
  orders: any[];
  inventory: any[];
  channels: any[];
  salesReport: any;
}

export function ErpDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const config = getErpConfig();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summary, topProducts, orders, inventory, channels, salesReport] = await Promise.all([
        getDashboardSummary().catch(() => null),
        getTopProducts().catch(() => null),
        getOrders({ limit: 10 }).catch(() => null),
        getInventory().catch(() => null),
        getChannelBreakdown().catch(() => null),
        getSalesReport('30d').catch(() => null),
      ]);
      setData({
        summary: summary?.content?.[0]?.text ? JSON.parse(summary.content[0].text) : summary,
        topProducts: topProducts?.content?.[0]?.text ? JSON.parse(topProducts.content[0].text) : topProducts,
        orders: orders?.content?.[0]?.text ? JSON.parse(orders.content[0].text) : orders,
        inventory: inventory?.content?.[0]?.text ? JSON.parse(inventory.content[0].text) : inventory,
        channels: channels?.content?.[0]?.text ? JSON.parse(channels.content[0].text) : channels,
        salesReport: salesReport?.content?.[0]?.text ? JSON.parse(salesReport.content[0].text) : salesReport,
      });
      setConnected(true);
    } catch (err: any) {
      setError(err.message);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadErpConfig();
    if (getErpConfig().tenantId) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [fetchData]);

  function renderValue(obj: any, path: string): string {
    const keys = path.split('.');
    let val = obj;
    for (const k of keys) {
      if (val && typeof val === 'object') val = val[k];
      else return '—';
    }
    return val !== undefined && val !== null ? String(val) : '—';
  }

  function renderSummary() {
    if (!data?.summary) return null;
    const s = data.summary;
    const cards = [
      { label: 'Total Revenue', value: formatCurrency(Number(renderValue(s, 'totalRevenue')) || 0) },
      { label: 'Total Orders', value: renderValue(s, 'totalOrders') || '—' },
      { label: 'Total Products', value: renderValue(s, 'totalProducts') || '—' },
      { label: 'Total Customers', value: renderValue(s, 'totalCustomers') || '—' },
    ];
    return (
      <div className="erp-cards">
        {cards.map(c => (
          <div key={c.label} className="erp-card">
            <div className="erp-card-label">{c.label}</div>
            <div className="erp-card-value">{c.value}</div>
          </div>
        ))}
      </div>
    );
  }

  function renderTopProducts() {
    const products = data?.topProducts?.products || data?.topProducts || [];
    if (!Array.isArray(products) || products.length === 0) return <p className="erp-empty">No product data</p>;
    return (
      <table className="erp-table">
        <thead>
          <tr><th>#</th><th>Name</th><th>Revenue</th><th>Quantity</th></tr>
        </thead>
        <tbody>
          {products.slice(0, 10).map((p: any, i: number) => (
            <tr key={p.id || i}>
              <td>{i + 1}</td>
              <td>{p.name || '—'}</td>
              <td>{formatCurrency(Number(p.revenue) || 0)}</td>
              <td>{p.quantity || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderOrders() {
    const orders = data?.orders?.orders || data?.orders || [];
    if (!Array.isArray(orders) || orders.length === 0) return <p className="erp-empty">No orders</p>;
    return (
      <table className="erp-table">
        <thead>
          <tr><th>ID</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr>
        </thead>
        <tbody>
          {orders.slice(0, 20).map((o: any) => (
            <tr key={o.id}>
              <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{(o.id || '').slice(0, 8)}</td>
              <td>{o.customer_name || o.customerName || '—'}</td>
              <td>{formatCurrency(Number(o.total) || 0)}</td>
              <td><span className={`erp-status erp-status-${(o.status || 'unknown').toLowerCase()}`}>{o.status || '—'}</span></td>
              <td>{o.created_at || o.createdAt ? new Date(o.created_at || o.createdAt).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderInventory() {
    const inv = data?.inventory?.products || data?.inventory || [];
    if (!Array.isArray(inv) || inv.length === 0) return <p className="erp-empty">No inventory data</p>;
    return (
      <table className="erp-table">
        <thead>
          <tr><th>Product</th><th>SKU</th><th>Quantity</th><th>Status</th></tr>
        </thead>
        <tbody>
          {inv.slice(0, 20).map((p: any) => (
            <tr key={p.id}>
              <td>{p.name || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{p.sku || '—'}</td>
              <td>{p.quantity ?? p.stock ?? '—'}</td>
              <td>
                {(p.quantity ?? p.stock ?? 0) <= (p.lowStockThreshold || 5) ? (
                  <span className="erp-status erp-status-low">Low Stock</span>
                ) : (
                  <span className="erp-status erp-status-ok">In Stock</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  function renderChannels() {
    const channels = data?.channels?.channels || data?.channels || [];
    if (!Array.isArray(channels) || channels.length === 0) return <p className="erp-empty">No channel data</p>;
    return (
      <table className="erp-table">
        <thead>
          <tr><th>Channel</th><th>Revenue</th><th>Orders</th></tr>
        </thead>
        <tbody>
          {channels.map((c: any) => (
            <tr key={c.channel || c.name}>
              <td>{c.channel || c.name || '—'}</td>
              <td>{formatCurrency(Number(c.revenue) || 0)}</td>
              <td>{c.orders || c.count || 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (!config.tenantId) {
    return (
      <div className="erp-container">
        <div className="erp-header">
          <h2>📊 ERP Dashboard</h2>
        </div>
        <div className="erp-not-connected">
          <p>🔌 Not connected to ERP</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Go to Settings to configure your ERP connection
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-container">
      <div className="erp-header">
        <h2>📊 ERP Dashboard</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {connected && <span className="erp-status erp-status-ok">● Connected</span>}
          <button className="erp-btn" onClick={fetchData} disabled={loading}>
            {loading ? '⟳ Loading...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      <div className="erp-tabs">
        {(['overview', 'products', 'orders', 'inventory', 'analytics'] as Tab[]).map(t => (
          <button
            key={t}
            className={`erp-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' && '📈'} {t === 'products' && '📦'} {t === 'orders' && '📋'}
            {t === 'inventory' && '🏭'} {t === 'analytics' && '📊'}
            {' '}{t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {error && <div className="erp-error">⚠️ {error}</div>}

      <div className="erp-content">
        {loading ? (
          <div className="erp-loading">Loading ERP data...</div>
        ) : (
          <>
            {tab === 'overview' && (
              <>
                {renderSummary()}
                <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>Top Products</h3>
                {renderTopProducts()}
                <h3 style={{ marginTop: '24px', marginBottom: '12px' }}>Channel Breakdown</h3>
                {renderChannels()}
              </>
            )}
            {tab === 'products' && renderTopProducts()}
            {tab === 'orders' && renderOrders()}
            {tab === 'inventory' && renderInventory()}
            {tab === 'analytics' && (
              <>
                {renderSummary()}
                {renderChannels()}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
