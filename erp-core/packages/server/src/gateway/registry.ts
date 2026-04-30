// ============================================================
// ERP Service Registry
// Central registry for all services in the ERP ecosystem.
// Every module (Payment, Member, Affiliate, Chat/RAG, etc.)
// registers itself here so the Gateway and Web UI can discover them.
// ============================================================

import fs from 'fs';
import path from 'path';

export interface ServiceInfo {
  name: string;
  description: string;
  url?: string;
  status: 'planned' | 'building' | 'live' | 'degraded' | 'offline';
  type: 'core' | 'module' | 'connector' | 'tool' | 'ai';
  version?: string;
  tools?: string[];
  dataDir?: string;
  chat?: string;
  dependencies?: string[];
  updatedAt: number;
}

export interface RegistryData {
  system: string;
  version: string;
  services: Record<string, ServiceInfo>;
}

const REGISTRY_PATH = process.env.ERP_REGISTRY_PATH || path.join(process.cwd(), 'data', 'erp-registry.json');

export class ServiceRegistry {
  private data: RegistryData;

  constructor() {
    this.data = this.load();
  }

  private load(): RegistryData {
    const dir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(REGISTRY_PATH)) {
      try {
        return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
      } catch {
        console.warn('[Registry] Failed to parse registry file, creating new one');
      }
    }

    return this.getDefault();
  }

  private getDefault(): RegistryData {
    return {
      system: 'ERP Core Ecosystem',
      version: '1.0.0',
      services: {
        'erp-core': {
          name: 'ERP Core',
          description: 'ERP Core MCP Server + Web UI — ระบบหลักสำหรับจัดการสินค้า, ออเดอร์, การผลิต, รายงาน',
          url: process.env.ERP_CORE_URL || 'http://localhost:3000',
          status: 'live',
          type: 'core',
          version: '1.0.0',
          tools: [
            'list_products', 'get_product', 'create_product', 'update_product',
            'list_orders', 'get_order', 'create_order',
            'get_inventory', 'adjust_inventory',
            'list_customers', 'get_customer', 'get_customer_insights',
            'get_finance_summary', 'list_transactions',
            'list_production_orders', 'create_production_order', 'update_production_status',
            'get_sales_report', 'get_inventory_report',
            'get_dashboard_summary', 'get_product_performance', 'get_sales_trends',
            'get_channel_breakdown', 'get_top_products', 'get_etsy_analytics',
            'create_bom', 'get_bom', 'list_boms', 'update_bom',
            'create_reorder_rule', 'list_reorder_rules', 'check_reorder_needs', 'auto_schedule_production',
            'get_production_order', 'get_production_schedule',
            'create_channel_connection', 'list_channel_connections', 'update_channel_connection', 'delete_channel_connection',
            'create_channel_listing', 'list_channel_listings', 'get_inventory_sync_status',
            'create_report', 'list_reports', 'get_report', 'update_report', 'delete_report',
            'execute_report', 'execute_adhoc_report', 'export_report_csv', 'export_report_pdf',
            'create_notification_channel', 'list_notification_channels',
            'create_notification_rule', 'list_notification_rules',
            'send_notification', 'get_notification_logs',
            'create_role', 'list_roles', 'update_role', 'delete_role',
            'check_permission', 'create_team', 'list_teams',
            'add_team_member', 'list_team_members', 'remove_team_member', 'get_audit_logs',
            'list_kb_collections', 'list_kb_documents', 'get_kb_document', 'create_kb_document',
            'get_tenant_info', 'get_subscription', 'get_usage_stats',
          ],
          updatedAt: Date.now(),
        },
        'task-manager': {
          name: 'Task Manager',
          description: 'Project & Task management system — จัดการโปรเจกต์, งาน, คิว, และ Activity Log',
          url: process.env.TASK_MANAGER_URL || 'http://localhost:8081',
          status: 'building',
          type: 'tool',
          dataDir: process.env.TASK_MANAGER_DATA_DIR || '/workspace/.task-manager',
          chat: 'chat-building-task-system',
          updatedAt: Date.now(),
        },
        'noteforge': {
          name: 'NoteForge',
          description: 'Knowledge Base (Obsidian-like) — ระบบจัดเก็บเอกสาร, โน้ต, และความรู้',
          status: 'building',
          type: 'module',
          chat: 'chat-building-noteforge',
          updatedAt: Date.now(),
        },
        'payment': {
          name: 'Payment System',
          description: 'Payment gateway — รองรับการชำระเงินหลายช่องทาง',
          status: 'planned',
          type: 'module',
          dependencies: ['member'],
          updatedAt: Date.now(),
        },
        'member': {
          name: 'Member System',
          description: 'Member management — จัดการสมาชิก, โปรไฟล์, และสิทธิ์',
          status: 'planned',
          type: 'module',
          updatedAt: Date.now(),
        },
        'affiliate': {
          name: 'Affiliate System',
          description: 'Affiliate marketing — จัดการลิงก์, คอมมิชชั่น, และพาร์ทเนอร์',
          status: 'planned',
          type: 'module',
          dependencies: ['member', 'payment'],
          updatedAt: Date.now(),
        },
        'chat-rag': {
          name: 'Chat + RAG',
          description: 'Chat application with RAG (Retrieval-Augmented Generation) — เริ่มต้นที่ Line',
          status: 'planned',
          type: 'module',
          dependencies: ['noteforge'],
          updatedAt: Date.now(),
        },
        'video-gen': {
          name: 'Video Generator',
          description: 'Video generation — สร้างวิดีโออัตโนมัติ, ปักตะกร้า, โปรโมทสินค้า',
          status: 'planned',
          type: 'ai',
          dependencies: ['erp-core'],
          updatedAt: Date.now(),
        },
        'photo-gen': {
          name: 'Photo Generator',
          description: 'Photo generation — สร้างภาพสินค้าอัตโนมัติ',
          status: 'planned',
          type: 'ai',
          dependencies: ['erp-core'],
          updatedAt: Date.now(),
        },
        'autonomous': {
          name: 'Autonomous Agent',
          description: 'OpenHand SDK autonomous agent — สร้างงาน, ดูแล Etsy, รายงาน, และทำงานอัตโนมัติ',
          status: 'planned',
          type: 'ai',
          dependencies: ['erp-core', 'etsy-connector', 'video-gen', 'photo-gen'],
          updatedAt: Date.now(),
        },
        'etsy-connector': {
          name: 'Etsy Connector',
          description: 'Etsy MCP Connector — เชื่อมต่อ Etsy API, OAuth, Sync listings/receipts/reviews',
          status: 'building',
          type: 'connector',
          dependencies: ['erp-core'],
          updatedAt: Date.now(),
        },
        'r-d-team': {
          name: 'R&D Team',
          description: 'Research & Development — ค้นหาระบบใหม่, Brainstorm, นำเข้า Production',
          status: 'planned',
          type: 'tool',
          updatedAt: Date.now(),
        },
      },
    };
  }

  getAll(): RegistryData {
    return this.data;
  }

  getService(name: string): ServiceInfo | undefined {
    return this.data.services[name];
  }

  listServices(filter?: { status?: string; type?: string }): Record<string, ServiceInfo> {
    if (!filter) return this.data.services;

    return Object.fromEntries(
      Object.entries(this.data.services).filter(([_, svc]) => {
        if (filter.status && svc.status !== filter.status) return false;
        if (filter.type && svc.type !== filter.type) return false;
        return true;
      })
    );
  }

  registerService(name: string, info: ServiceInfo): void {
    this.data.services[name] = {
      ...info,
      updatedAt: Date.now(),
    };
    this.save();
  }

  updateService(name: string, updates: Partial<ServiceInfo>): void {
    if (this.data.services[name]) {
      this.data.services[name] = {
        ...this.data.services[name],
        ...updates,
        updatedAt: Date.now(),
      };
      this.save();
    }
  }

  private save(): void {
    const dir = path.dirname(REGISTRY_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
