// ============================================================
// Billing & Subscription System
// ============================================================

import { getDatabase } from '../db/database.js';
import { v4 as uuid } from 'uuid';

export interface Plan {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  features: string;
  max_users: number;
  max_products: number;
  max_storage_mb: number;
  is_active: boolean;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: number;
  current_period_end: number;
  trial_end: number | null;
  canceled_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  subscription_id: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  paid_at: number | null;
  due_date: number;
  created_at: number;
  lines: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  description: string;
  amount: number;
  quantity: number;
}

export class BillingManager {
  private db = getDatabase();

  // ---- Plans ----

  listPlans(): Plan[] {
    return this.db.prepare('SELECT * FROM billing_plans WHERE is_active = 1 ORDER BY price_monthly').all() as Plan[];
  }

  getPlan(planId: string): Plan | null {
    return this.db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(planId) as Plan | null;
  }

  createPlan(data: Omit<Plan, 'id'>): Plan {
    const id = uuid();
    this.db.prepare(
      `INSERT INTO billing_plans (id, name, description, price_monthly, price_yearly, features, max_users, max_products, max_storage_mb, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.name, data.description, data.price_monthly, data.price_yearly, data.features, data.max_users, data.max_products, data.max_storage_mb, data.is_active ? 1 : 0);
    return this.getPlan(id)!;
  }

  updatePlan(planId: string, data: Partial<Plan>): Plan | null {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return this.getPlan(planId);
    values.push(planId);
    this.db.prepare(`UPDATE billing_plans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getPlan(planId);
  }

  // ---- Subscriptions ----

  getSubscription(tenantId: string): Subscription | null {
    return this.db.prepare(
      'SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(tenantId) as Subscription | null;
  }

  createSubscription(data: {
    tenantId: string;
    planId: string;
    billingCycle: 'monthly' | 'yearly';
    trialDays?: number;
  }): Subscription {
    const now = Math.floor(Date.now() / 1000);
    const id = uuid();
    const trialEnd = data.trialDays ? now + (data.trialDays * 86400) : null;
    const periodEnd = trialEnd || now + (data.billingCycle === 'monthly' ? 2592000 : 31536000);

    this.db.prepare(
      `INSERT INTO subscriptions (id, tenant_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.tenantId, data.planId, trialEnd ? 'trialing' : 'active', data.billingCycle, now, periodEnd, trialEnd, now, now);

    return this.getSubscription(data.tenantId)!;
  }

  cancelSubscription(tenantId: string): Subscription | null {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(
      'UPDATE subscriptions SET status = ?, canceled_at = ?, updated_at = ? WHERE tenant_id = ? AND status IN (?, ?)'
    ).run('canceled', now, now, tenantId, 'active', 'trialing');
    return this.getSubscription(tenantId);
  }

  // ---- Invoices ----

  listInvoices(tenantId: string, limit = 50): Invoice[] {
    return this.db.prepare(
      'SELECT * FROM invoices WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(tenantId, limit) as Invoice[];
  }

  createInvoice(data: {
    tenantId: string;
    subscriptionId: string;
    amount: number;
    lines: { description: string; amount: number; quantity: number }[];
  }): Invoice {
    const now = Math.floor(Date.now() / 1000);
    const id = uuid();
    const dueDate = now + 2592000; // 30 days

    this.db.prepare(
      'INSERT INTO invoices (id, tenant_id, subscription_id, amount, currency, status, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, data.tenantId, data.subscriptionId, data.amount, 'USD', 'open', dueDate, now);

    for (const line of data.lines) {
      const lineId = uuid();
      this.db.prepare(
        'INSERT INTO invoice_lines (id, invoice_id, description, amount, quantity) VALUES (?, ?, ?, ?, ?)'
      ).run(lineId, id, line.description, line.amount, line.quantity);
    }

    return this.getInvoice(id)!;
  }

  getInvoice(invoiceId: string): Invoice | null {
    const invoice = this.db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) return null;
    invoice.lines = this.db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ?').all(invoiceId);
    return invoice as Invoice;
  }

  payInvoice(invoiceId: string): Invoice | null {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare('UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?').run('paid', now, invoiceId);
    return this.getInvoice(invoiceId);
  }

  // ---- Usage & Limits ----

  getUsage(tenantId: string): { users: number; products: number; storageMb: number } {
    const users = (this.db.prepare('SELECT COUNT(*) as count FROM users WHERE tenant_id = ?').get(tenantId) as any)?.count || 0;
    const products = (this.db.prepare('SELECT COUNT(*) as count FROM products WHERE tenant_id = ?').get(tenantId) as any)?.count || 0;
    return { users, products, storageMb: 0 };
  }

  checkLimits(tenantId: string): { allowed: boolean; limits: any; usage: any } {
    const sub = this.getSubscription(tenantId);
    if (!sub) return { allowed: false, limits: null, usage: null };

    const plan = this.getPlan(sub.plan_id);
    if (!plan) return { allowed: false, limits: null, usage: null };

    const usage = this.getUsage(tenantId);
    const allowed = usage.users <= plan.max_users && usage.products <= plan.max_products;

    return {
      allowed,
      limits: { maxUsers: plan.max_users, maxProducts: plan.max_products, maxStorageMb: plan.max_storage_mb },
      usage,
    };
  }
}
