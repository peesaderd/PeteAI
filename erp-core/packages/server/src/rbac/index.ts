// ============================================================
// RBAC & Team Management
// ============================================================

import { getDatabase } from '../db/database.js';

const SYSTEM_PERMISSIONS = [
  'products.read', 'products.create', 'products.update', 'products.delete',
  'orders.read', 'orders.create', 'orders.update', 'orders.delete',
  'customers.read', 'customers.create', 'customers.update', 'customers.delete',
  'inventory.read', 'inventory.update',
  'analytics.read',
  'reports.read', 'reports.create', 'reports.export',
  'production.read', 'production.create', 'production.update',
  'channels.read', 'channels.create', 'channels.update', 'channels.delete',
  'settings.read', 'settings.update',
  'billing.read', 'billing.update',
  'kb.read', 'kb.create', 'kb.update', 'kb.delete',
  'users.read', 'users.create', 'users.update', 'users.delete',
  'roles.read', 'roles.create', 'roles.update', 'roles.delete',
  'teams.read', 'teams.create', 'teams.update', 'teams.delete',
  'notifications.read', 'notifications.create', 'notifications.update',
  'audit.read',
];

const DEFAULT_ROLES: Record<string, string[]> = {
  admin: SYSTEM_PERMISSIONS,
  manager: [
    'products.read', 'products.create', 'products.update',
    'orders.read', 'orders.create', 'orders.update',
    'customers.read', 'customers.create', 'customers.update',
    'inventory.read', 'inventory.update',
    'analytics.read',
    'reports.read', 'reports.create', 'reports.export',
    'production.read', 'production.create', 'production.update',
    'channels.read', 'channels.create', 'channels.update',
    'kb.read', 'kb.create', 'kb.update',
    'notifications.read', 'notifications.create',
  ],
  member: [
    'products.read',
    'orders.read', 'orders.create',
    'customers.read',
    'inventory.read',
    'analytics.read',
    'reports.read',
    'production.read',
    'channels.read',
    'kb.read', 'kb.create',
  ],
};

export class RBACManager {
  private db = getDatabase();

  // ---- Role Management ----

  getDefaultPermissions(roleName: string): string[] {
    return DEFAULT_ROLES[roleName] || DEFAULT_ROLES.member;
  }

  createRole(args: {
    tenantId: string;
    name: string;
    description?: string;
    permissions?: string[];
  }) {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const permissions = args.permissions || this.getDefaultPermissions(args.name);
    this.db.prepare(`
      INSERT INTO roles (id, tenant_id, name, description, permissions, is_system, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, args.tenantId, args.name, args.description || null,
      JSON.stringify(permissions), now, now);
    return this.getRole(id);
  }

  getRole(id: string) {
    const row = this.db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { ...row, permissions: JSON.parse(row.permissions || '[]') };
  }

  listRoles(tenantId: string) {
    const rows = this.db.prepare('SELECT * FROM roles WHERE tenant_id = ? ORDER BY is_system DESC, name ASC').all(tenantId) as any[];
    return rows.map((r: any) => ({ ...r, permissions: JSON.parse(r.permissions || '[]') }));
  }

  updateRole(id: string, args: { name?: string; description?: string; permissions?: string[] }) {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    if (args.name !== undefined) { updates.push('name = ?'); params.push(args.name); }
    if (args.description !== undefined) { updates.push('description = ?'); params.push(args.description); }
    if (args.permissions !== undefined) { updates.push('permissions = ?'); params.push(JSON.stringify(args.permissions)); }
    params.push(id);
    this.db.prepare(`UPDATE roles SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getRole(id);
  }

  deleteRole(id: string) {
    this.db.prepare('DELETE FROM roles WHERE id = ? AND is_system = 0').run(id);
  }

  // ---- Permission Checking ----

  private getRoleByUser(user: any): any {
    // Try direct role_id (UUID) first, then role name lookup
    if (user.role_id) {
      const role = this.db.prepare('SELECT * FROM roles WHERE id = ?').get(user.role_id) as any;
      if (role) return role;
    }
    // Fallback: look up by role name for the same tenant
    if (user.role) {
      return this.db.prepare('SELECT * FROM roles WHERE tenant_id = ? AND name = ?').get(user.tenant_id, user.role) as any;
    }
    return null;
  }

  hasPermission(userId: string, permission: string): boolean {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) return false;

    // Check user's direct role
    const role = this.getRoleByUser(user);
    if (role) {
      const perms: string[] = JSON.parse(role.permissions || '[]');
      if (perms.includes(permission) || perms.includes('*')) return true;
    }

    // Check team roles
    const teamRoles = this.db.prepare(`
      SELECT r.permissions FROM team_members tm
      JOIN roles r ON tm.role_id = r.id
      WHERE tm.user_id = ?
    `).all(userId) as any[];

    for (const tr of teamRoles) {
      const perms: string[] = JSON.parse(tr.permissions || '[]');
      if (perms.includes(permission) || perms.includes('*')) return true;
    }

    return false;
  }

  getUserPermissions(userId: string): string[] {
    const perms = new Set<string>();
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!user) return [];

    const role = this.getRoleByUser(user);
    if (role) {
      JSON.parse(role.permissions || '[]').forEach((p: string) => perms.add(p));
    }

    const teamRoles = this.db.prepare(`
      SELECT r.permissions FROM team_members tm
      JOIN roles r ON tm.role_id = r.id
      WHERE tm.user_id = ?
    `).all(userId) as any[];

    for (const tr of teamRoles) {
      JSON.parse(tr.permissions || '[]').forEach((p: string) => perms.add(p));
    }

    return Array.from(perms);
  }

  // ---- Team Management ----

  createTeam(args: { tenantId: string; name: string; description?: string }) {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO teams (id, tenant_id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, args.tenantId, args.name, args.description || null, now, now);
    return this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  }

  listTeams(tenantId: string) {
    return this.db.prepare('SELECT * FROM teams WHERE tenant_id = ? ORDER BY name').all(tenantId);
  }

  updateTeam(id: string, args: { name?: string; description?: string }) {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    if (args.name !== undefined) { updates.push('name = ?'); params.push(args.name); }
    if (args.description !== undefined) { updates.push('description = ?'); params.push(args.description); }
    params.push(id);
    this.db.prepare(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  }

  deleteTeam(id: string) {
    this.db.prepare('DELETE FROM team_members WHERE team_id = ?').run(id);
    this.db.prepare('DELETE FROM teams WHERE id = ?').run(id);
  }

  // ---- Team Members ----

  addTeamMember(args: { teamId: string; userId: string; roleId?: string }) {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO team_members (id, team_id, user_id, role_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, args.teamId, args.userId, args.roleId || null, now);
    return this.db.prepare(`
      SELECT tm.*, u.name as user_name, u.email as user_email
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.id = ?
    `).get(id);
  }

  removeTeamMember(teamId: string, userId: string) {
    this.db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
  }

  listTeamMembers(teamId: string) {
    return this.db.prepare(`
      SELECT tm.*, u.name as user_name, u.email as user_email, r.name as role_name
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      LEFT JOIN roles r ON tm.role_id = r.id
      WHERE tm.team_id = ?
    `).all(teamId);
  }

  // ---- Audit Logging ----

  logAudit(args: {
    tenantId: string;
    userId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }) {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, args.tenantId, args.userId || null, args.action,
      args.resourceType || null, args.resourceId || null,
      args.details ? JSON.stringify(args.details) : null,
      args.ipAddress || null, now);
    return id;
  }

  getAuditLogs(tenantId: string, limit = 100, offset = 0) {
    return this.db.prepare(`
      SELECT al.*, u.name as user_name, u.email as user_email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.tenant_id = ?
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `).all(tenantId, limit, offset);
  }

  // ---- Initialize Default Roles ----

  initializeTenantRoles(tenantId: string) {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.db.prepare('SELECT COUNT(*) as count FROM roles WHERE tenant_id = ?').get(tenantId) as any;
    if (existing.count > 0) return;

    for (const [roleName, permissions] of Object.entries(DEFAULT_ROLES)) {
      const id = crypto.randomUUID();
      this.db.prepare(`
        INSERT INTO roles (id, tenant_id, name, description, permissions, is_system, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, tenantId, roleName, `Default ${roleName} role`, JSON.stringify(permissions), now, now);
    }
  }
}
