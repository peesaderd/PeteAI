const API_BASE = '/api';

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API Error');
  }
  return res.json();
}

// MCP calls go directly to /mcp (not /api/mcp) to match server route
function mcp(tool: string, args: any) {
  return fetch('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'MCP Error');
    }
    return res.json();
  });
}

function restGet(path: string) {
  return request(path, { headers: { 'x-tenant-id': 't_001' } });
}

function restPost(path: string, data: any) {
  return request(path, { method: 'POST', body: JSON.stringify(data), headers: { 'x-tenant-id': 't_001' } });
}

function restPut(path: string, data: any) {
  return request(path, { method: 'PUT', body: JSON.stringify(data), headers: { 'x-tenant-id': 't_001' } });
}

function restDelete(path: string) {
  return request(path, { method: 'DELETE', headers: { 'x-tenant-id': 't_001' } });
}

export const api = {
  health: () => request('/health'),
  mcp,

  // Dashboard
  dashboard: {
    summary: (tenantId = 't_001') => mcp('get_dashboard_summary', { tenantId, period: '30d' }),
    salesTrends: (tenantId = 't_001', days = 30) => mcp('get_sales_trends', { tenantId, days }),
    channelBreakdown: (tenantId = 't_001') => mcp('get_channel_breakdown', { tenantId, period: '30d' }),
    topProducts: (tenantId = 't_001') => mcp('get_top_products', { tenantId, period: '30d', limit: 10 }),
    inventoryReport: (tenantId = 't_001') => mcp('get_inventory_report', { tenantId }),
    productionOrders: (tenantId = 't_001') => mcp('list_production_orders', { tenantId, status: 'all' }),
  },

  // Products
  products: {
    list: () => mcp('list_products', { tenantId: 't_001', limit: 100 }),
    get: (id: string) => mcp('get_product', { tenantId: 't_001', productId: id }),
    create: (data: any) => mcp('create_product', { tenantId: 't_001', ...data }),
    update: (id: string, data: any) => mcp('update_product', { tenantId: 't_001', productId: id, ...data }),
    inventory: () => mcp('get_inventory', { tenantId: 't_001' }),
    adjustInventory: (productId: string, quantity: number, reason: string) =>
      mcp('adjust_inventory', { tenantId: 't_001', productId, quantity, reason }),
  },

  // BOM
  bom: {
    list: () => mcp('list_boms', { tenantId: 't_001' }),
    get: (id: string) => mcp('get_bom', { tenantId: 't_001', bomId: id }),
    create: (data: any) => mcp('create_bom', { tenantId: 't_001', ...data }),
    update: (id: string, data: any) => mcp('update_bom', { tenantId: 't_001', bomId: id, ...data }),
  },

  // Orders
  orders: {
    list: () => mcp('list_orders', { tenantId: 't_001', limit: 100 }),
    get: (id: string) => mcp('get_order', { tenantId: 't_001', orderId: id }),
    create: (data: any) => mcp('create_order', { tenantId: 't_001', ...data }),
  },

  // Customers
  customers: {
    list: () => mcp('list_customers', { tenantId: 't_001', limit: 100 }),
    get: (id: string) => mcp('get_customer', { tenantId: 't_001', customerId: id }),
    insights: (id: string) => mcp('get_customer_insights', { tenantId: 't_001', customerId: id }),
  },

  // Finance
  finance: {
    accounts: () => restGet('/finance/accounts'),
    createAccount: (data: any) => restPost('/finance/accounts', data),
    transactions: (params?: string) => restGet(`/finance/transactions?${params || 'limit=50'}`),
    createTransaction: (data: any) => restPost('/finance/transactions', data),
    balanceSheet: () => restGet('/finance/balance-sheet'),
    profitLoss: (startDate?: number, endDate?: number) =>
      restGet(`/finance/profit-loss?startDate=${startDate || 0}&endDate=${endDate || Date.now()}`),
    ar: (status?: string) => restGet(`/finance/ar${status ? '?status=' + status : ''}`),
    createAR: (data: any) => restPost('/finance/ar', data),
    ap: (status?: string) => restGet(`/finance/ap${status ? '?status=' + status : ''}`),
    createAP: (data: any) => restPost('/finance/ap', data),
    budgets: () => restGet('/finance/budgets'),
    createBudget: (data: any) => restPost('/finance/budgets', data),
    taxRates: () => restGet('/finance/tax-rates'),
    createTaxRate: (data: any) => restPost('/finance/tax-rates', data),
  },

  // HR
  hr: {
    employees: () => restGet('/hr/employees'),
    getEmployee: (id: string) => restGet(`/hr/employees/${id}`),
    createEmployee: (data: any) => restPost('/hr/employees', data),
    updateEmployee: (id: string, data: any) => restPut(`/hr/employees/${id}`, data),
    leaves: () => restGet('/hr/leaves'),
    createLeave: (data: any) => restPost('/hr/leaves', data),
    approveLeave: (id: string) => restPost(`/hr/leaves/${id}/approve`, {}),
    leaveBalance: (employeeId: string) => restGet(`/hr/leaves/balance/${employeeId}`),
    timeTracking: () => restGet('/hr/time-tracking'),
    clockIn: () => restPost('/hr/time-tracking/clock-in', {}),
    clockOut: () => restPost('/hr/time-tracking/clock-out', {}),
    payrollPeriods: () => restGet('/hr/payroll-periods'),
    createPayrollPeriod: (data: any) => restPost('/hr/payroll-periods', data),
    processPayroll: (id: string) => restPost(`/hr/payroll-periods/${id}/process`, {}),
    payPayroll: (id: string) => restPost(`/hr/payroll-periods/${id}/pay`, {}),
    performanceReviews: () => restGet('/hr/performance-reviews'),
    createPerformanceReview: (data: any) => restPost('/hr/performance-reviews', data),
  },

  // Procurement
  procurement: {
    suppliers: () => restGet('/procurement/suppliers'),
    getSupplier: (id: string) => restGet(`/procurement/suppliers/${id}`),
    createSupplier: (data: any) => restPost('/procurement/suppliers', data),
    updateSupplier: (id: string, data: any) => restPut(`/procurement/suppliers/${id}`, data),
    supplierProducts: (supplierId: string) => restGet(`/procurement/suppliers/${id}/products`),
    purchaseOrders: () => restGet('/procurement/purchase-orders'),
    getPurchaseOrder: (id: string) => restGet(`/procurement/purchase-orders/${id}`),
    createPurchaseOrder: (data: any) => restPost('/procurement/purchase-orders', data),
    receivePO: (id: string) => restPost(`/procurement/purchase-orders/${id}/receive`, {}),
    warehouses: () => restGet('/procurement/warehouses'),
    createWarehouse: (data: any) => restPost('/procurement/warehouses', data),
    inventoryMovements: () => restGet('/procurement/inventory-movements'),
    transferInventory: (data: any) => restPost('/procurement/inventory/transfer', data),
  },

  // Production
  production: {
    orders: (status?: string) => mcp('list_production_orders', { tenantId: 't_001', status: status || 'all' }),
    get: (id: string) => mcp('get_production_order', { tenantId: 't_001', orderId: id }),
    create: (data: any) => mcp('create_production_order', { tenantId: 't_001', ...data }),
    updateStatus: (id: string, status: string) => mcp('update_production_status', { tenantId: 't_001', orderId: id, status }),
    schedule: () => mcp('get_production_schedule', { tenantId: 't_001' }),
    autoSchedule: () => mcp('auto_schedule_production', { tenantId: 't_001' }),
  },

  // Marketing
  marketing: {
    campaigns: () => restGet('/marketing/campaigns'),
    createCampaign: (data: any) => restPost('/marketing/campaigns', data),
    updateCampaign: (id: string, data: any) => restPut(`/marketing/campaigns/${id}`, data),
    campaignMetrics: (id: string) => restGet(`/marketing/campaigns/${id}/metrics`),
    emailLists: () => restGet('/marketing/email-lists'),
    createEmailList: (data: any) => restPost('/marketing/email-lists', data),
    subscribers: () => restGet('/marketing/subscribers'),
    addSubscriber: (data: any) => restPost('/marketing/subscribers', data),
    emailTemplates: () => restGet('/marketing/email-templates'),
    createEmailTemplate: (data: any) => restPost('/marketing/email-templates', data),
    discounts: () => restGet('/marketing/discounts'),
    createDiscount: (data: any) => restPost('/marketing/discounts', data),
    validateDiscount: (code: string) => restPost('/marketing/discounts/validate', { code }),
    seoKeywords: () => restGet('/marketing/seo-keywords'),
    createSeoKeyword: (data: any) => restPost('/marketing/seo-keywords', data),
    socialAccounts: () => restGet('/marketing/social-accounts'),
    socialPosts: () => restGet('/marketing/social-posts'),
  },

  // Channels
  channels: {
    list: () => mcp('list_channel_connections', { tenantId: 't_001' }),
    create: (data: any) => mcp('create_channel_connection', { tenantId: 't_001', ...data }),
    update: (id: string, data: any) => mcp('update_channel_connection', { tenantId: 't_001', connectionId: id, ...data }),
    delete: (id: string) => mcp('delete_channel_connection', { tenantId: 't_001', connectionId: id }),
    listings: () => mcp('list_channel_listings', { tenantId: 't_001' }),
    inventorySync: () => mcp('get_inventory_sync_status', { tenantId: 't_001' }),
  },

  // Reports
  reports: {
    list: () => mcp('list_reports', { tenantId: 't_001' }),
    get: (id: string) => mcp('get_report', { tenantId: 't_001', reportId: id }),
    create: (data: any) => mcp('create_report', { tenantId: 't_001', ...data }),
    sales: () => mcp('get_sales_report', { tenantId: 't_001' }),
  },

  // Agent
  agent: {
    state: () => request('/agent/state'),
    tasks: (limit = 50) => request(`/agent/tasks?limit=${limit}`),
    failedTasks: (limit = 20) => request(`/agent/tasks/failed?limit=${limit}`),
    start: () => request('/agent/start', { method: 'POST' }),
    stop: () => request('/agent/stop', { method: 'POST' }),
    pause: () => request('/agent/pause', { method: 'POST' }),
    resume: () => request('/agent/resume', { method: 'POST' }),
  },

  // AI
  ai: {
    providers: () => restGet('/ai/providers'),
    createProvider: (data: any) => restPost('/ai/providers', data),
    updateProvider: (id: string, data: any) => restPut(`/ai/providers/${id}`, data),
    deleteProvider: (id: string) => restDelete(`/ai/providers/${id}`),
    testProvider: (id: string) => restPost(`/ai/providers/${id}/test`, {}),
    activateProvider: (id: string) => restPost(`/ai/providers/${id}/activate`, {}),
  },  // end ai
  // UI / Theme
  ui: {
    theme: () => restGet("/ui/theme"),
    settings: () => restGet("/ui/settings"),
    layouts: () => restGet("/ui/layouts"),
    components: () => restGet("/ui/components"),
    updateTheme: (data: any) => restPost("/ui/theme", data),
  },

  // Knowledge Base
  kb: {
    collections: () => request('/collections'),
    createCollection: (data: any) => request('/collections', { method: 'POST', body: JSON.stringify(data) }),
    documents: (params?: string) => request(`/documents${params || ''}`),
    getDocument: (id: string) => request(`/documents/${id}`),
    createDocument: (data: any) => request('/documents', { method: 'POST', body: JSON.stringify(data) }),
    updateDocument: (id: string, data: any) => request(`/documents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteDocument: (id: string) => request(`/documents/${id}`, { method: 'DELETE' }),
    search: (q: string) => request(`/search?q=${encodeURIComponent(q)}`),
    graph: () => request('/graph'),
    stats: () => request('/stats'),
  },
};
