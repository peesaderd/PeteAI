import React from 'react';
import {
  Globe, Plus, RefreshCw, Link, Unlink, ShoppingBag,
  ExternalLink, CheckCircle, XCircle, AlertTriangle, Settings
} from 'lucide-react';
import { api } from '../lib/api';

function Skeleton() {
  return <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />;
}

const CHANNEL_ICONS: Record<string, string> = {
  etsy: '🧶',
  amazon: '📦',
  shopify: '🛍️',
  ebay: '🔨',
  walmart: '🛒',
};

const CHANNEL_COLORS: Record<string, string> = {
  etsy: 'bg-orange-100 text-orange-700 border-orange-200',
  amazon: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  shopify: 'bg-green-100 text-green-700 border-green-200',
  ebay: 'bg-red-100 text-red-700 border-red-200',
  walmart: 'bg-blue-100 text-blue-700 border-blue-200',
};

export default function ChannelManagement() {
  const [loading, setLoading] = React.useState(true);
  const [connections, setConnections] = React.useState<any[]>([]);
  const [listings, setListings] = React.useState<any[]>([]);
  const [syncStatus, setSyncStatus] = React.useState<any>(null);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'connections' | 'listings'>('overview');
  const [tenantId] = React.useState('demo');

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [connRes, listRes, syncRes] = await Promise.all([
        api.mcp('list_channel_connections', { tenantId }).catch(() => ({ content: [{ text: '[]' }] })),
        api.mcp('list_channel_listings', { tenantId }).catch(() => ({ content: [{ text: '[]' }] })),
        api.mcp('get_inventory_sync_status', { tenantId }).catch(() => ({ content: [{ text: '{}' }] })),
      ]);
      setConnections(JSON.parse(connRes.content[0].text));
      setListings(JSON.parse(listRes.content[0].text));
      setSyncStatus(JSON.parse(syncRes.content[0].text));
    } catch (e) {
      console.error('Channel load error:', e);
    }
    setLoading(false);
  }, [tenantId]);

  React.useEffect(() => { loadData(); }, [loadData]);

  const activeConnections = connections.filter((c: any) => c.status === 'active' || c.connected).length;
  const totalListings = listings.length;
  const syncedListings = listings.filter((l: any) => l.syncStatus === 'synced' || l.status === 'active').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Channel Management</h1>
          <p className="text-sm text-gray-500 mt-1">Multi-channel sales integration (Etsy, Amazon, Shopify, etc.)</p>
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
            <div className="p-2 rounded-lg bg-blue-500"><Globe size={18} className="text-white" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '-' : connections.length}</div>
          <div className="text-sm text-gray-500">Total Connections</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-green-500"><CheckCircle size={18} className="text-white" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '-' : activeConnections}</div>
          <div className="text-sm text-gray-500">Active Channels</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500"><ShoppingBag size={18} className="text-white" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '-' : totalListings}</div>
          <div className="text-sm text-gray-500">Total Listings</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-indigo-500"><Link size={18} className="text-white" /></div>
          </div>
          <div className="text-2xl font-bold text-gray-900">{loading ? '-' : syncedListings}</div>
          <div className="text-sm text-gray-500">Synced Listings</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['overview', 'connections', 'listings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'overview' && '📊 '}
            {tab === 'connections' && '🔌 '}
            {tab === 'listings' && '📋 '}
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Connected Channels</h2>
            {loading ? <Skeleton /> : connections.length > 0 ? (
              <div className="space-y-3">
                {connections.map((conn: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{CHANNEL_ICONS[conn.channel?.toLowerCase()] ?? '🔗'}</span>
                      <div>
                        <div className="text-sm font-medium text-gray-900 capitalize">{conn.channel ?? conn.name}</div>
                        <div className="text-xs text-gray-500">{conn.storeName ?? conn.shopName ?? conn.channel}</div>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      (conn.status === 'active' || conn.connected) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {conn.status ?? (conn.connected ? 'active' : 'inactive')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No channels connected yet</div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Inventory Sync Status</h2>
            {loading ? <Skeleton /> : syncStatus ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Last Sync</span>
                  <span className="text-sm font-medium">
                    {syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString() : 'Never'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Products Synced</span>
                  <span className="text-sm font-medium">{syncStatus.syncedProducts ?? syncStatus.totalSynced ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Pending Sync</span>
                  <span className="text-sm font-medium">{syncStatus.pendingSync ?? syncStatus.pending ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Errors</span>
                  <span className={`text-sm font-medium ${(syncStatus.errors ?? 0) > 0 ? 'text-red-600' : ''}`}>
                    {syncStatus.errors ?? 0}
                  </span>
                </div>
                <button className="w-full mt-2 bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
                  <RefreshCw size={14} /> Sync All Channels
                </button>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No sync data available</div>
            )}
          </div>
        </div>
      )}

      {/* Connections Tab */}
      {activeTab === 'connections' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Channel Connections</h2>
            <button className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
              <Plus size={14} /> Add Channel
            </button>
          </div>
          {loading ? (
            <div className="p-6"><Skeleton /></div>
          ) : connections.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs border-b border-gray-100">
                    <th className="p-4">Channel</th>
                    <th className="p-4">Store Name</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Last Sync</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {connections.map((conn: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{CHANNEL_ICONS[conn.channel?.toLowerCase()] ?? '🔗'}</span>
                          <span className="font-medium text-gray-900 capitalize">{conn.channel ?? conn.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-gray-600">{conn.storeName ?? conn.shopName ?? '-'}</td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          (conn.status === 'active' || conn.connected) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {conn.status ?? (conn.connected ? 'active' : 'inactive')}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-gray-500">
                        {conn.lastSync ? new Date(conn.lastSync).toLocaleString() : '-'}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <button className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                          <button className="text-xs text-red-600 hover:text-red-800">Disconnect</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400 text-sm">
              <Globe size={48} className="mx-auto mb-3 text-gray-300" />
              No channels connected yet.<br />
              Connect your first sales channel (Etsy, Amazon, Shopify) to start selling.
            </div>
          )}
        </div>
      )}

      {/* Listings Tab */}
      {activeTab === 'listings' && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Channel Listings</h2>
            <button className="flex items-center gap-1 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700">
              <Plus size={14} /> New Listing
            </button>
          </div>
          {loading ? (
            <div className="p-6"><Skeleton /></div>
          ) : listings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs border-b border-gray-100">
                    <th className="p-4">Product</th>
                    <th className="p-4">Channel</th>
                    <th className="p-4">Channel SKU</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Price</th>
                    <th className="p-4">Sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {listings.map((listing: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="p-4 font-medium text-gray-900">{listing.productName ?? listing.product_id ?? '-'}</td>
                      <td className="p-4">
                        <span className="flex items-center gap-1 text-sm capitalize">
                          <span>{CHANNEL_ICONS[listing.channel?.toLowerCase()] ?? '🔗'}</span>
                          {listing.channel}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-gray-500">{listing.channelSku ?? listing.externalSku ?? '-'}</td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          (listing.status === 'active' || listing.listingStatus === 'active') ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {listing.status ?? listing.listingStatus ?? 'unknown'}
                        </span>
                      </td>
                      <td className="p-4">${(listing.price ?? 0).toFixed(2)}</td>
                      <td className="p-4">
                        {listing.syncStatus === 'synced' || listing.syncStatus === 'active' ? (
                          <CheckCircle size={16} className="text-green-500" />
                        ) : (
                          <XCircle size={16} className="text-red-400" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-gray-400 text-sm">No channel listings yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
