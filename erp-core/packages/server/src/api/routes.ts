import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/database.js';
import { AuthManager } from '../auth/auth.js';
import { TenantManager } from '../tenants/manager.js';
import { RBACManager } from '../rbac/index.js';
import { handleToolCall } from '../mcp/server.js';
import { createRegistryRouter } from './registry.js';
import { createProxyRouter } from '../gateway/proxy.js';

export function createRouter() {
  const router = Router();
  const auth = new AuthManager();
  const tenants = new TenantManager();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  router.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { tenantName, tenantSlug, email, name, password } = req.body;
      if (!tenantName || !tenantSlug || !email || !name || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const tenant = tenants.create(tenantName, tenantSlug);
      const user = await auth.register(tenant.id, email, name, password, 'admin');
      // Initialize default roles for the new tenant
      const rbac = new RBACManager();
      rbac.initializeTenantRoles(tenant.id);
      res.json({ tenant, user });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      const result = await auth.login(email, password);
      if (!result) return res.status(401).json({ error: 'Invalid credentials' });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  router.post('/mcp', async (req: Request, res: Response) => {
    try {
      const { tool, args } = req.body;
      if (!tool || !args) return res.status(400).json({ error: 'tool and args required' });
      const db = getDatabase();
      const result = await handleToolCall(tool, args, db, auth);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Mount registry API
  const registryRouter = createRegistryRouter();
  router.use('/registry', registryRouter);

  const proxyRouter = createProxyRouter();
// Mount Agency Team API proxy
  router.use('/agency', proxyRouter);
  router.use('/proxy', proxyRouter);

    // ---- Finance & Accounting REST API ----

    // Chart of Accounts
    router.get('/finance/accounts', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { type, activeOnly } = req.query;
        let sql = 'SELECT * FROM chart_of_accounts WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (type) { sql += ' AND type = ?'; params.push(type); }
        if (activeOnly === 'true') { sql += ' AND is_active = 1'; }
        sql += ' ORDER BY code ASC';
        const results = db.prepare(sql).all(...params);
        res.json(results);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/accounts', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { code, name, type, subtype, parentId, description } = req.body;
        if (!code || !name || !type) return res.status(400).json({ error: 'code, name, type required' });
        const db = getDatabase();
        const id = 'acct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO chart_of_accounts (id, tenant_id, code, name, type, subtype, parent_id, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, code, name, type, subtype || null, parentId || null, description || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Transactions
    router.get('/finance/transactions', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { type, category, limit = '50', offset = '0' } = req.query;
        let sql = 'SELECT * FROM finance_transactions WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (type) { sql += ' AND type = ?'; params.push(type); }
        if (category) { sql += ' AND category = ?'; params.push(category); }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit as string), parseInt(offset as string));
        const results = db.prepare(sql).all(...params);
        res.json(results);
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/transactions', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { type, category, amount, currency = 'USD', description, accountId, referenceType, referenceId, transactionDate } = req.body;
        if (!type || !category || amount === undefined) return res.status(400).json({ error: 'type, category, amount required' });
        const db = getDatabase();
        const id = 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO finance_transactions (id, tenant_id, type, category, amount, currency, description, account_id, reference_type, reference_id, transaction_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, type, category, amount, currency, description || null, accountId || null, referenceType || null, referenceId || null, transactionDate || now, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Balance Sheet
    router.get('/finance/balance-sheet', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const assets = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type IN ('income','ar')").get(tenantId) as any;
        const liabilities = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type IN ('expense','ap')").get(tenantId) as any;
        const equity = (assets?.total || 0) - (liabilities?.total || 0);
        res.json({ totalAssets: assets?.total || 0, totalLiabilities: liabilities?.total || 0, equity });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Profit & Loss
    router.get('/finance/profit-loss', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { startDate, endDate } = req.query;
        const now = Date.now();
        const sd = startDate ? parseInt(startDate as string) : (now - 30 * 86400 * 1000);
        const ed = endDate ? parseInt(endDate as string) : now;
        const income = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type = 'income' AND transaction_date >= ? AND transaction_date <= ?").get(tenantId, sd, ed) as any;
        const expenses = db.prepare("SELECT SUM(amount) as total FROM finance_transactions WHERE tenant_id = ? AND type = 'expense' AND transaction_date >= ? AND transaction_date <= ?").get(tenantId, sd, ed) as any;
        res.json({ startDate: sd, endDate: ed, totalIncome: income?.total || 0, totalExpenses: expenses?.total || 0, netIncome: (income?.total || 0) - (expenses?.total || 0) });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Accounts Receivable
    router.get('/finance/ar', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status } = req.query;
        let sql = 'SELECT * FROM accounts_receivable WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (status) { sql += ' AND status = ?'; params.push(status); }
        sql += ' ORDER BY due_date ASC';
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/ar', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { customerId, invoiceNumber, amount, dueDate, notes } = req.body;
        if (!customerId || !invoiceNumber || !amount || !dueDate) return res.status(400).json({ error: 'customerId, invoiceNumber, amount, dueDate required' });
        const db = getDatabase();
        const id = 'ar_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO accounts_receivable (id, tenant_id, customer_id, invoice_number, amount, amount_paid, due_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)`).run(id, tenantId, customerId, invoiceNumber, amount, dueDate, notes || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Accounts Payable
    router.get('/finance/ap', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        const { status } = req.query;
        let sql = 'SELECT * FROM accounts_payable WHERE tenant_id = ?';
        const params: any[] = [tenantId];
        if (status) { sql += ' AND status = ?'; params.push(status); }
        sql += ' ORDER BY due_date ASC';
        res.json(db.prepare(sql).all(...params));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/ap', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { vendorName, invoiceNumber, amount, dueDate, notes } = req.body;
        if (!vendorName || !invoiceNumber || !amount || !dueDate) return res.status(400).json({ error: 'vendorName, invoiceNumber, amount, dueDate required' });
        const db = getDatabase();
        const id = 'ap_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO accounts_payable (id, tenant_id, vendor_name, invoice_number, amount, amount_paid, due_date, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, 'pending', ?, ?, ?)`).run(id, tenantId, vendorName, invoiceNumber, amount, dueDate, notes || null, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Tax Rates
    router.get('/finance/tax-rates', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        res.json(db.prepare('SELECT * FROM tax_rates WHERE tenant_id = ? AND is_active = 1').all(tenantId));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/tax-rates', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { name, rate, type } = req.body;
        if (!name || rate === undefined || !type) return res.status(400).json({ error: 'name, rate, type required' });
        const db = getDatabase();
        const id = 'tax_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO tax_rates (id, tenant_id, name, rate, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, name, rate, type, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Budgets
    router.get('/finance/budgets', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        res.json(db.prepare('SELECT * FROM budgets WHERE tenant_id = ? ORDER BY start_date DESC').all(tenantId));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/budgets', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { name, category, amount, period, startDate, endDate } = req.body;
        if (!name || !category || amount === undefined || !period || !startDate || !endDate) return res.status(400).json({ error: 'name, category, amount, period, startDate, endDate required' });
        const db = getDatabase();
        const id = 'budget_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        db.prepare(`INSERT INTO budgets (id, tenant_id, name, category, amount, period, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, tenantId, name, category, amount, period, startDate, endDate, now, now);
        res.json({ id, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // Bank Reconciliation
    router.get('/finance/reconciliations', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const db = getDatabase();
        res.json(db.prepare('SELECT * FROM bank_reconciliation WHERE tenant_id = ? ORDER BY created_at DESC').all(tenantId));
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    router.post('/finance/reconciliations', (req: Request, res: Response) => {
      try {
        const tenantId = req.headers['x-tenant-id'] as string;
        if (!tenantId) return res.status(400).json({ error: 'x-tenant-id header required' });
        const { accountName, statementBalance, systemBalance, notes } = req.body;
        if (!accountName || statementBalance === undefined || systemBalance === undefined) return res.status(400).json({ error: 'accountName, statementBalance, systemBalance required' });
        const db = getDatabase();
        const id = 'recon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const now = Date.now();
        const difference = statementBalance - systemBalance;
        db.prepare(`INSERT INTO bank_reconciliation (id, tenant_id, account_name, statement_balance, system_balance, difference, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`).run(id, tenantId, accountName, statementBalance, systemBalance, difference, notes || null, now, now);
        res.json({ id, difference, success: true });
      } catch (err: any) { res.status(400).json({ error: err.message }); }
    });

    // ---- Webhook: SiYuan sync trigger ----
    router.post('/webhooks/siyuan', async (req: Request, res: Response) => {
      try {
        const { docId } = req.body;
        if (!docId) return res.status(400).json({ error: 'docId required' });
        const syncUrl = process.env.SYNC_SIYUAN_URL || 'http://sync-siyuan:54513';
        const response = await fetch(`${syncUrl}/webhook/siyuan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docId }),
        });
        const data = await response.json();
        res.json(data);
      } catch (err: any) {
        res.status(502).json({ error: `Failed to forward webhook: ${err.message}` });
      }
    });

    // ---- Webhook: Generic receiver ----
    router.post('/webhooks/:source', async (req: Request, res: Response) => {
      const { source } = req.params;
      console.log(`[Webhook] Received from ${source}:`, JSON.stringify(req.body).slice(0, 200));
      res.json({ received: true, source });
    });

  return router;
}
