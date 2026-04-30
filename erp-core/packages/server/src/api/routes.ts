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
  router.use('/proxy', proxyRouter);

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
