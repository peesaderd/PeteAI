// ============================================================
// Notification System
// ============================================================

import { getDatabase } from '../db/database.js';

interface NotificationChannel {
  id: string;
  tenantId: string;
  type: 'email' | 'slack' | 'line' | 'webhook';
  label: string;
  config: Record<string, any>;
  isActive: boolean;
}

interface NotificationRule {
  id: string;
  tenantId: string;
  name: string;
  eventType: string;
  conditionConfig?: Record<string, any>;
  channelIds: string[];
  isActive: boolean;
}

export class NotificationEngine {
  private db = getDatabase();

  // ---- Channel CRUD ----

  createChannel(args: {
    tenantId: string;
    type: NotificationChannel['type'];
    label: string;
    config: Record<string, any>;
  }): NotificationChannel {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO notification_channels (id, tenant_id, type, label, config, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, args.tenantId, args.type, args.label, JSON.stringify(args.config), now, now);
    return this.getChannel(id)!;
  }

  getChannel(id: string): NotificationChannel | null {
    const row = this.db.prepare('SELECT * FROM notification_channels WHERE id = ?').get(id) as any;
    if (!row) return null;
    return { id: row.id, tenantId: row.tenant_id, type: row.type, label: row.label, config: JSON.parse(row.config || '{}'), isActive: row.is_active === 1 };
  }

  listChannels(tenantId: string, type?: string): NotificationChannel[] {
    let sql = 'SELECT * FROM notification_channels WHERE tenant_id = ?';
    const params: any[] = [tenantId];
    if (type) { sql += ' AND type = ?'; params.push(type); }
    sql += ' ORDER BY created_at DESC';
    return this.db.prepare(sql).all(...params).map((r: any) => ({
      id: r.id, tenantId: r.tenant_id, type: r.type, label: r.label,
      config: JSON.parse(r.config || '{}'), isActive: r.is_active === 1,
    }));
  }

  updateChannel(id: string, args: Partial<NotificationChannel>): NotificationChannel {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    if (args.label !== undefined) { updates.push('label = ?'); params.push(args.label); }
    if (args.config !== undefined) { updates.push('config = ?'); params.push(JSON.stringify(args.config)); }
    if (args.isActive !== undefined) { updates.push('is_active = ?'); params.push(args.isActive ? 1 : 0); }
    params.push(id);
    this.db.prepare(`UPDATE notification_channels SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getChannel(id)!;
  }

  deleteChannel(id: string): void {
    this.db.prepare('DELETE FROM notification_channels WHERE id = ?').run(id);
  }

  // ---- Rule CRUD ----

  createRule(args: {
    tenantId: string;
    name: string;
    eventType: string;
    conditionConfig?: Record<string, any>;
    channelIds: string[];
  }): NotificationRule {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO notification_rules (id, tenant_id, name, event_type, condition_config, channel_ids, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, args.tenantId, args.name, args.eventType,
      JSON.stringify(args.conditionConfig || {}), JSON.stringify(args.channelIds), now, now);
    return this.getRule(id)!;
  }

  getRule(id: string): NotificationRule | null {
    const row = this.db.prepare('SELECT * FROM notification_rules WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id, tenantId: row.tenant_id, name: row.name, eventType: row.event_type,
      conditionConfig: JSON.parse(row.condition_config || '{}'),
      channelIds: JSON.parse(row.channel_ids || '[]'), isActive: row.is_active === 1,
    };
  }

  listRules(tenantId: string, eventType?: string): NotificationRule[] {
    let sql = 'SELECT * FROM notification_rules WHERE tenant_id = ?';
    const params: any[] = [tenantId];
    if (eventType) { sql += ' AND event_type = ?'; params.push(eventType); }
    sql += ' ORDER BY created_at DESC';
    return this.db.prepare(sql).all(...params).map((r: any) => ({
      id: r.id, tenantId: r.tenant_id, name: r.name, eventType: r.event_type,
      conditionConfig: JSON.parse(r.condition_config || '{}'),
      channelIds: JSON.parse(r.channel_ids || '[]'), isActive: r.is_active === 1,
    }));
  }

  updateRule(id: string, args: Partial<NotificationRule>): NotificationRule {
    const now = Math.floor(Date.now() / 1000);
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    if (args.name !== undefined) { updates.push('name = ?'); params.push(args.name); }
    if (args.eventType !== undefined) { updates.push('event_type = ?'); params.push(args.eventType); }
    if (args.conditionConfig !== undefined) { updates.push('condition_config = ?'); params.push(JSON.stringify(args.conditionConfig)); }
    if (args.channelIds !== undefined) { updates.push('channel_ids = ?'); params.push(JSON.stringify(args.channelIds)); }
    if (args.isActive !== undefined) { updates.push('is_active = ?'); params.push(args.isActive ? 1 : 0); }
    params.push(id);
    this.db.prepare(`UPDATE notification_rules SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getRule(id)!;
  }

  deleteRule(id: string): void {
    this.db.prepare('DELETE FROM notification_rules WHERE id = ?').run(id);
  }

  // ---- Send Notification ----

  sendNotification(args: {
    tenantId: string;
    eventType: string;
    message: string;
    data?: Record<string, any>;
  }): { sent: number; failed: number; logs: any[] } {
    const rules = this.listRules(args.tenantId, args.eventType).filter(r => r.isActive);
    const logs: any[] = [];
    let sent = 0;
    let failed = 0;

    for (const rule of rules) {
      if (rule.conditionConfig && !this.evaluateCondition(rule.conditionConfig, args.data)) {
        continue;
      }

      for (const channelId of rule.channelIds) {
        const channel = this.getChannel(channelId);
        if (!channel || !channel.isActive) continue;

        try {
          const result = this.sendToChannel(channel, args.message, args.data);
          this.logNotification(args.tenantId, rule.id, args.eventType, channel.type, 'sent', args.message);
          sent++;
          logs.push({ channelId, channelType: channel.type, status: 'sent', result });
        } catch (err: any) {
          this.logNotification(args.tenantId, rule.id, args.eventType, channel.type, 'failed', args.message, err.message);
          failed++;
          logs.push({ channelId, channelType: channel.type, status: 'failed', error: err.message });
        }
      }
    }

    return { sent, failed, logs };
  }

  private evaluateCondition(config: Record<string, any>, data?: Record<string, any>): boolean {
    if (!data) return true;
    const { field, operator, value } = config;
    if (!field || data[field] === undefined) return true;
    switch (operator) {
      case 'gt': return data[field] > value;
      case 'gte': return data[field] >= value;
      case 'lt': return data[field] < value;
      case 'lte': return data[field] <= value;
      case 'eq': return data[field] === value;
      case 'neq': return data[field] !== value;
      default: return true;
    }
  }

  private sendToChannel(channel: NotificationChannel, message: string, data?: Record<string, any>): string {
    switch (channel.type) {
      case 'email': {
        const { smtpHost, smtpPort, username, password, from, to } = channel.config;
        if (!to) throw new Error('Email recipient not configured');
        console.log(`[EMAIL] To: ${to}, Subject: ${message}, From: ${from || 'noreply@erp-core.com'}`);
        return `email_queued:${to}`;
      }
      case 'slack': {
        const { webhookUrl } = channel.config;
        if (!webhookUrl) throw new Error('Slack webhook URL not configured');
        console.log(`[SLACK] Webhook: ${webhookUrl}, Message: ${message}`);
        return `slack_queued`;
      }
      case 'line': {
        const { accessToken, to } = channel.config;
        if (!accessToken) throw new Error('LINE access token not configured');
        console.log(`[LINE] Token: ${accessToken.substring(0, 8)}..., Message: ${message}`);
        return `line_queued`;
      }
      case 'webhook': {
        const { url, method = 'POST', headers = {} } = channel.config;
        if (!url) throw new Error('Webhook URL not configured');
        console.log(`[WEBHOOK] ${method} ${url}, Message: ${message}`);
        return `webhook_queued:${url}`;
      }
      default:
        throw new Error(`Unknown channel type: ${channel.type}`);
    }
  }

  private logNotification(tenantId: string, ruleId: string, eventType: string, channelType: string, status: string, message?: string, error?: string) {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO notification_logs (id, tenant_id, rule_id, event_type, channel_type, status, message, sent_at, error, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, tenantId, ruleId, eventType, channelType, status, message || null,
      status === 'sent' ? now : null, error || null, now);
  }

  // ---- Logs ----

  getLogs(tenantId: string, limit = 50): any[] {
    return this.db.prepare(
      'SELECT * FROM notification_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(tenantId, limit);
  }
}
