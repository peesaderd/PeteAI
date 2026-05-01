// ============================================================
// Webhook Handler - Receives events from ERP Core Gateway
// and triggers AI agent actions
// ============================================================

import { ToolRouter } from "./tool-router.js";
import { MemoryStore } from "./memory.js";

export interface WebhookEvent {
  source: string;
  type: string;
  payload: any;
  timestamp: number;
}

export interface TriggerRule {
  id: string;
  name: string;
  eventSource: string;
  eventType: string;
  condition?: (payload: any) => boolean;
  action: "create_task" | "notify" | "webhook_forward";
  actionConfig: Record<string, any>;
  enabled: boolean;
}

export class WebhookHandler {
  private toolRouter: ToolRouter;
  private memory: MemoryStore;
  private rules: TriggerRule[] = [];

  constructor(toolRouter: ToolRouter, memory: MemoryStore) {
    this.toolRouter = toolRouter;
    this.memory = memory;
    this.registerDefaultRules();
  }

  private registerDefaultRules() {
    this.addRule({
      id: "siyuan-note-summarize",
      name: "Summarize new SiYuan notes",
      eventSource: "siyuan",
      eventType: "note.created",
      action: "create_task",
      actionConfig: {
        targetRole: "rd",
        titleTemplate: "Summarize note: {{payload.title}}",
        descriptionTemplate:
          "Please summarize and categorize the new note: {{payload.content}}",
        priority: "medium",
      },
      enabled: false,
    });

    this.addRule({
      id: "new-order-review",
      name: "Review new orders",
      eventSource: "erp-core",
      eventType: "order.created",
      action: "create_task",
      actionConfig: {
        targetRole: "marketing",
        titleTemplate: "Review new order #{{payload.orderNumber}}",
        descriptionTemplate:
          "New order received. Please review and suggest marketing actions: {{payload.orderData}}",
        priority: "high",
      },
      enabled: false,
    });

    this.addRule({
      id: "low-stock-alert",
      name: "Alert on low stock",
      eventSource: "erp-core",
      eventType: "inventory.low_stock",
      action: "create_task",
      actionConfig: {
        targetRole: "production",
        titleTemplate: "Low stock alert: {{payload.productName}}",
        descriptionTemplate:
          "Product {{payload.productName}} (SKU: {{payload.sku}}) has low stock ({{payload.quantity}}). Please suggest reorder.",
        priority: "high",
      },
      enabled: false,
    });
  }

  addRule(rule: TriggerRule): void {
    this.rules.push(rule);
  }

  getRules(): TriggerRule[] {
    return this.rules;
  }

  updateRule(id: string, updates: Partial<TriggerRule>): TriggerRule | null {
    const idx = this.rules.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this.rules[idx] = { ...this.rules[idx], ...updates };
    return this.rules[idx];
  }

  async handleEvent(event: WebhookEvent): Promise<any[]> {
    const results: any[] = [];

    const matchingRules = this.rules.filter(
      (r) =>
        r.enabled &&
        r.eventSource === event.source &&
        r.eventType === event.type
    );

    for (const rule of matchingRules) {
      try {
        // Check condition if defined
        if (rule.condition && !rule.condition(event.payload)) {
          results.push({
            ruleId: rule.id,
            skipped: true,
            reason: "Condition not met",
          });
          continue;
        }

        switch (rule.action) {
          case "create_task": {
            const title = this.renderTemplate(
              rule.actionConfig.titleTemplate || "",
              event
            );
            const description = this.renderTemplate(
              rule.actionConfig.descriptionTemplate || "",
              event
            );

            const result = await this.toolRouter.executeTool(
              "agency_create_task",
              {
                tenantId: event.payload?.tenantId || "default",
                title,
                description,
                sourceRole: "system",
                targetRole: rule.actionConfig.targetRole || "rd",
                priority: rule.actionConfig.priority || "medium",
                inputData: {
                  event: event.type,
                  payload: event.payload,
                  triggeredBy: rule.id,
                },
              }
            );

            results.push({
              ruleId: rule.id,
              action: "create_task",
              result,
            });
            break;
          }

          case "notify":
            // Log notification (could be extended to send email/Line/etc.)
            console.log(
              `[Webhook] Notification: ${rule.name}`,
              event.payload
            );
            results.push({
              ruleId: rule.id,
              action: "notify",
              result: { notified: true },
            });
            break;

          case "webhook_forward":
            // Forward to external URL
            if (rule.actionConfig.url) {
              try {
                const res = await fetch(rule.actionConfig.url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(event),
                });
                results.push({
                  ruleId: rule.id,
                  action: "webhook_forward",
                  result: { status: res.status },
                });
              } catch (err: any) {
                results.push({
                  ruleId: rule.id,
                  action: "webhook_forward",
                  error: err.message,
                });
              }
            }
            break;
        }
      } catch (err: any) {
        results.push({
          ruleId: rule.id,
          action: rule.action,
          error: err.message,
        });
      }
    }

    return results;
  }

  private renderTemplate(template: string, event: WebhookEvent): string {
    return template.replace(/\{\{payload\.([^}]+)\}\}/g, (_match, key) => {
      const value = this.getNestedValue(event.payload, key);
      return value !== undefined ? String(value) : `{{payload.${key}}}`;
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }
}
