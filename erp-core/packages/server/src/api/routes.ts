// ============================================================
// ERP Core - REST API Routes
// ============================================================

import { Router, Request, Response } from 'express';
import { AuthManager } from '../auth/auth.js';
import { getDatabase } from '../db/database.js';

export function createRouter() {
  const router = Router();
  const auth = new AuthManager();
  const db = getDatabase();

  // ---- Health ----
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // ---- Auth: Register ----
  router.post('/auth/register', async (req: Request, res: Response) => {
    try {
      const { tenantId, email, name, password, role } = req.body;
      if (!tenantId || !email || !name || !password) {
        return res.status(400).json({ error: 'tenantId, email, name, and password are required' });
      }
      const user = await auth.register(tenantId, email, name, password, role || 'member');
      res.json({ success: true, user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ---- Auth: Login ----
  router.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }
      const result = await auth.login(email, password);
      if (!result) {
        return res.status(401).json({ success: false, error: 'Invalid email or password' });
      }
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ---- Auth: Verify Token ----
  router.post('/auth/verify', (req: Request, res: Response) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ error: 'token is required' });
      }
      const payload = auth.verifyToken(token);
      if (!payload) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
      const user = auth.getUser(payload.userId);
      res.json({ success: true, payload, user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ---- Auth: Get Current User (from Authorization header) ----
  router.get('/auth/me', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header required (Bearer <token>)' });
      }
      const token = authHeader.slice(7);
      const payload = auth.verifyToken(token);
      if (!payload) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
      const user = auth.getUser(payload.userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({ success: true, user });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // ---- Auth: List Users (requires auth) ----
  router.get('/auth/users', (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header required' });
      }
      const token = authHeader.slice(7);
      const payload = auth.verifyToken(token);
      if (!payload) {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
      }
      const users = auth.listUsers(payload.tenantId);
      res.json({ success: true, users });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  return router;
}
