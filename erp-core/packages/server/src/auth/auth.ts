// ============================================================
// Authentication Module (JWT + bcrypt)
// ============================================================

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../db/database.js';
import { v4 as uuid } from 'uuid';

const JWT_SECRET = process.env.JWT_SECRET || 'erp-core-dev-secret-change-in-production';
const SALT_ROUNDS = 10;

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: string;
  created_at: number;
  updated_at: number;
}

export interface AuthResult {
  user: User;
  token: string;
  tenantId: string;
}

export class AuthManager {
  private db = getDatabase();

  async register(tenantId: string, email: string, name: string, password: string, role = 'member'): Promise<User> {
    const existing = this.db.prepare('SELECT id FROM users WHERE tenant_id = ? AND email = ?').get(tenantId, email);
    if (existing) throw new Error('User already exists');

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const id = uuid();
    const now = Math.floor(Date.now() / 1000);

    this.db.prepare(
      'INSERT INTO users (id, tenant_id, email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, tenantId, email, name, passwordHash, role, now, now);

    return this.getUser(id)!;
  }

  async login(email: string, password: string): Promise<AuthResult | null> {
    const user = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) return null;

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return null;

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const { password_hash, ...safeUser } = user;
    return { user: safeUser as User, token, tenantId: user.tenant_id };
  }

  verifyToken(token: string): { userId: string; tenantId: string; role: string } | null {
    try {
      return jwt.verify(token, JWT_SECRET) as any;
    } catch {
      return null;
    }
  }

  getUser(userId: string): User | null {
    const user = this.db.prepare('SELECT id, tenant_id, email, name, role, created_at, updated_at FROM users WHERE id = ?').get(userId);
    return user as User | null;
  }

  listUsers(tenantId: string): User[] {
    return this.db.prepare('SELECT id, tenant_id, email, name, role, created_at, updated_at FROM users WHERE tenant_id = ?').all(tenantId) as User[];
  }
}
