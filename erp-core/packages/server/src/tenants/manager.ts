// ============================================================
// Tenant Manager
// ============================================================

import { getDatabase } from '../db/database.js';
import { v4 as uuid } from 'uuid';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: number;
  updated_at: number;
}

export class TenantManager {
  private db = getDatabase();

  create(name: string, slug: string): Tenant {
    const existing = this.db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug);
    if (existing) throw new Error(`Tenant "${slug}" already exists`);

    const id = uuid();
    const now = Math.floor(Date.now() / 1000);

    this.db.prepare(
      'INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name, slug, now, now);

    return this.get(id)!;
  }

  get(id: string): Tenant | null {
    return this.db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as Tenant | null;
  }

  getBySlug(slug: string): Tenant | null {
    return this.db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug) as Tenant | null;
  }

  list(): Tenant[] {
    return this.db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all() as Tenant[];
  }

  update(id: string, data: Partial<Pick<Tenant, 'name'>>): Tenant | null {
    const now = Math.floor(Date.now() / 1000);
    if (data.name) {
      this.db.prepare('UPDATE tenants SET name = ?, updated_at = ? WHERE id = ?').run(data.name, now, id);
    }
    return this.get(id);
  }
}
