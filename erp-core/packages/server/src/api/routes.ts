// ============================================================
// API Routes
// ============================================================

import { Router } from 'express';
import { createRegistryRouter } from './registry.js';
import { createDocsRouter } from './docs.js';

export function createRouter() {
  const router = Router();

  router.use('/registry', createRegistryRouter());
  router.use('/docs', createDocsRouter());

  return router;
}
