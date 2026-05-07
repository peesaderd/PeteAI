// ============================================================
// Registry API Routes
// ============================================================

import { Router, Request, Response } from 'express';
import { ServiceRegistry } from '../gateway/registry.js';

export function createRegistryRouter() {
  const router = Router();
  const registry = new ServiceRegistry();

  // GET /api/registry — list all services
  router.get('/', (_req: Request, res: Response) => {
    const filter: any = {};
    if (_req.query.status) filter.status = _req.query.status;
    if (_req.query.type) filter.type = _req.query.type;
    res.json(registry.listServices(Object.keys(filter).length ? filter : undefined));
  });

  // GET /api/registry/:name — get specific service
  router.get('/:name', (req: Request, res: Response) => {
    const name = req.params.name as string;
    const svc = registry.getService(name);
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    res.json(svc);
  });

  // POST /api/registry/:name — register or update a service
  router.post('/:name', (req: Request, res: Response) => {
    const name = req.params.name as string;
    const existing = registry.getService(name);
    if (existing) {
      registry.updateService(name, req.body);
    } else {
      registry.registerService(name, { ...req.body, name });
    }
    res.json(registry.getService(name));
  });

  // PATCH /api/registry/:name — partial update
  router.patch('/:name', (req: Request, res: Response) => {
    const name = req.params.name as string;
    registry.updateService(name, req.body);
    res.json(registry.getService(name));
  });

  return router;
}
