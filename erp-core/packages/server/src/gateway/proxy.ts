// ============================================================
// Gateway Proxy
// Routes REST API requests to registered services
// ============================================================

import { Router, Request, Response } from 'express';
import { ServiceRegistry } from './registry.js';

// Known service auth tokens (from environment)
const SERVICE_TOKENS: Record<string, string | undefined> = {
  siyuan: process.env.SIYUAN_API_TOKEN,
};

export function createProxyRouter() {
  const router = Router();
  const registry = new ServiceRegistry();

  // Proxy all requests to a registered service
  // GET/POST/PUT/PATCH/DELETE /proxy/:serviceName/*
  router.all('/:serviceName/*', async (req: Request, res: Response) => {
    const { serviceName } = req.params;
    const svc = registry.getService(serviceName);

    if (!svc) {
      return res.status(404).json({ error: `Service '${serviceName}' not found in registry` });
    }

    if (svc.status !== 'live') {
      return res.status(503).json({ error: `Service '${serviceName}' is not live (status: ${svc.status})` });
    }

    if (!svc.url) {
      return res.status(500).json({ error: `Service '${serviceName}' has no URL configured` });
    }

    // Build target URL: use the wildcard param (everything after :serviceName/)
    const suffix = req.params[0] ? `/${req.params[0]}` : '/';
    const targetUrl = `${svc.url}${suffix}`;

    try {
      const fetchOpts: any = {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
          ...(req.headers['x-tenant-id'] ? { 'x-tenant-id': req.headers['x-tenant-id'] } : {}),
        },
      };

      // Add service-specific auth token if configured
      const svcToken = SERVICE_TOKENS[serviceName];
      if (svcToken) {
        fetchOpts.headers['Authorization'] = `Token ${svcToken}`;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        fetchOpts.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOpts);

      // Forward response status and body
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        res.status(response.status).json(data);
      } else {
        const text = await response.text();
        res.status(response.status).type(contentType).send(text);
      }
    } catch (err: any) {
      res.status(502).json({
        error: `Failed to proxy request to '${serviceName}' at ${targetUrl}`,
        message: err.message,
      });
    }
  });

  return router;
}
