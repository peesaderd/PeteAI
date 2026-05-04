// ============================================================
// AI Docs Updater Service
// Watches code changes and auto-updates SiYuan documentation
// Uses AI to analyze code and generate/update docs
// ============================================================

import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const PORT = parseInt(process.env.AI_DOCS_PORT || "54517", 10);
const SIYUAN_URL = process.env.SIYUAN_URL || "http://127.0.0.1:54511";
const SIYUAN_TOKEN = process.env.SIYUAN_API_TOKEN || "w8qyx729d7pm5zqn";
const ERP_ROOT = process.env.ERP_ROOT || "/root/erp-core/erp-core";
const UPDATE_INTERVAL_MS = parseInt(process.env.UPDATE_INTERVAL || "300000", 10);

interface DocDefinition {
  path: string;
  title: string;
  description: string;
  watchPatterns: string[];
  lastUpdated: number;
}

interface DocState {
  [docPath: string]: {
    lastUpdated: number;
    lastGitHash: string;
    content: string;
  };
}

const DOC_REGISTRY: DocDefinition[] = [
  {
    path: "/ERP System Overview",
    title: "ERP System Overview",
    description: "High-level system overview, architecture, and capabilities",
    watchPatterns: ["README.md", "package.json", "packages/server/src/api/routes.ts"],
    lastUpdated: 0
  },
  {
    path: "/System Architecture",
    title: "System Architecture",
    description: "Technical architecture, service layout, data flow",
    watchPatterns: [
      "packages/server/src/index.ts",
      "packages/server/src/api/routes.ts",
      "docker-compose*.yml",
      "ecosystem.config*.cjs"
    ],
    lastUpdated: 0
  },
  {
    path: "/Finance & Accounting",
    title: "Finance & Accounting Module",
    description: "Finance module API and database documentation",
    watchPatterns: [
      "packages/server/src/api/routes.ts",
      "packages/server/src/db/migrations/finance*.ts",
      "packages/server/src/services/finance*.ts"
    ],
    lastUpdated: 0
  },
  {
    path: "/Supply Chain & Procurement",
    title: "Supply Chain & Procurement Module",
    description: "Procurement module API and database documentation",
    watchPatterns: [
      "packages/server/src/api/routes.ts",
      "packages/server/src/db/migrations/procurement*.ts",
      "packages/server/src/services/procurement*.ts"
    ],
    lastUpdated: 0
  },
  {
    path: "/HR & Payroll",
    title: "Human Resources & Payroll Module",
    description: "HR module API and database documentation",
    watchPatterns: [
      "packages/server/src/api/routes.ts",
      "packages/server/src/db/migrations/hr*.ts",
      "packages/server/src/services/hr*.ts"
    ],
    lastUpdated: 0
  },
  {
    path: "/Marketing",
    title: "Marketing Module",
    description: "Marketing module API and database documentation",
    watchPatterns: [
      "packages/server/src/api/routes.ts",
      "packages/server/src/db/migrations/marketing*.ts",
      "packages/server/src/services/marketing*.ts"
    ],
    lastUpdated: 0
  },
  {
    path: "/AI Platform",
    title: "AI Platform Module",
    description: "AI providers, MCP, orchestration documentation",
    watchPatterns: [
      "packages/server/src/api/routes.ts",
      "packages/ai-orchestrator/**/*.ts",
      "packages/agency-team/**/*.ts",
      "packages/system-agent/**/*.ts"
    ],
    lastUpdated: 0
  },
  {
    path: "/API Reference",
    title: "API Reference",
    description: "Complete API endpoint reference",
    watchPatterns: ["packages/server/src/api/routes.ts"],
    lastUpdated: 0
  },
  {
    path: "/Database Schema",
    title: "Database Schema",
    description: "Database tables, relationships, and schema",
    watchPatterns: ["packages/server/src/db/**/*.ts"],
    lastUpdated: 0
  },
  {
    path: "/Deployment Guide",
    title: "Deployment Guide",
    description: "Deployment, PM2, Docker, and operations guide",
    watchPatterns: [
      "ecosystem.config*.cjs",
      "docker-compose*.yml",
      "Dockerfile*",
      "packages/infra/**/*"
    ],
    lastUpdated: 0
  },
  {
    path: "/Integration & API",
    title: "Integration & API Module",
    description: "Webhooks, external integrations, API gateway",
    watchPatterns: [
      "packages/server/src/api/routes.ts",
      "packages/connectors/**/*.ts",
      "packages/sync-siyuan/**/*.ts"
    ],
    lastUpdated: 0
  }
];

// ============================================================
// SiYuan API Client
// ============================================================

async function siyuanPost(endpoint: string, body: any): Promise<any> {
  const url = `${SIYUAN_URL}${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${SIYUAN_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`SiYuan ${endpoint}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function getNotebooks(): Promise<any[]> {
  const data = await siyuanPost("/api/notebook/lsNotebooks", {});
  return data.data?.notebooks || [];
}

async function findNotebook(name: string): Promise<string | null> {
  const notebooks = await getNotebooks();
  const found = notebooks.find((n: any) => {
    const nName = n.name || n.notebook?.name || "";
    return nName === name;
  });
  return found ? (found.id || found.notebook?.id) : null;
}

async function updateDoc(notebookId: string, docPath: string, markdown: string): Promise<boolean> {
  const result = await siyuanPost("/api/filetree/createDocWithMd", {
    notebook: notebookId,
    path: docPath,
    markdown: markdown
  });
  return result.code === 0;
}

// ============================================================
// Code Analysis Engine
// ============================================================

class CodeAnalyzer {
  private erpRoot: string;

  constructor(erpRoot: string) {
    this.erpRoot = erpRoot;
  }

  extractApiRoutes(): Array<{ method: string; path: string; module: string }> {
    const routesPath = path.join(this.erpRoot, "packages/server/src/api/routes.ts");
    if (!fs.existsSync(routesPath)) return [];

    const content = fs.readFileSync(routesPath, "utf-8");
    const routes: Array<{ method: string; path: string; module: string }> = [];
    const regex = /router\.(get|post|put|delete)\('([^']+)'/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];
      const module = routePath.split("/")[1] || "system";
      routes.push({ method, path: routePath, module: module.charAt(0).toUpperCase() + module.slice(1) });
    }

    return routes;
  }

  extractDbTables(): Array<{ table: string; module: string; columns: string[] }> {
    const migrationsDir = path.join(this.erpRoot, "packages/server/src/db/migrations");
    if (!fs.existsSync(migrationsDir)) return [];

    const tables: Array<{ table: string; module: string; columns: string[] }> = [];

    try {
      const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".ts"));
      for (const file of files) {
        const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
        const tableRegex = /createTable\(['"`]([^'"`]+)['"`]/g;
        let tMatch;
        while ((tMatch = tableRegex.exec(content)) !== null) {
          const tableName = tMatch[1];
          const module = file.split("_")[0] || "unknown";
          const colRegex = /\.addColumn\(['"`]([^'"`]+)['"`]/g;
          const cols: string[] = [];
          let cMatch;
          while ((cMatch = colRegex.exec(content)) !== null) {
            cols.push(cMatch[1]);
          }
          tables.push({ table: tableName, module: module.charAt(0).toUpperCase() + module.slice(1), columns: cols });
        }
      }
    } catch {
      // Ignore errors
    }

    return tables;
  }

  getGitHash(filePattern: string): string {
    try {
      const { execSync } = require("child_process");
      const result = execSync(
        `cd "${this.erpRoot}" && git log -1 --format=%H -- ${filePattern} 2>/dev/null || echo "none"`,
        { encoding: "utf-8", timeout: 5000 }
      );
      return result.trim();
    } catch {
      return "none";
    }
  }

  generateApiReference(): string {
    const routes = this.extractApiRoutes();
    const modules = new Map<string, Array<{ method: string; path: string }>>();

    for (const route of routes) {
      if (!modules.has(route.module)) {
        modules.set(route.module, []);
      }
      modules.get(route.module)!.push({ method: route.method, path: route.path });
    }

    let md = "# API Reference\n\n";
    md += "## Authentication\n";
    md += "All API endpoints require JWT authentication via `Authorization: Bearer <token>` header.\n\n";
    md += "- `POST /api/auth/register` - Register new user\n";
    md += "- `POST /api/auth/login` - Login and get JWT token\n\n";

    for (const [module, moduleRoutes] of modules) {
      if (module === "Auth" || module === "System") continue;
      md += `## ${module}\n\n`;
      for (const route of moduleRoutes) {
        md += `- \`${route.method} ${route.path}\`\n`;
      }
      md += "\n";
    }

    md += "## Webhooks\n";
    md += "- `POST /api/webhooks/siyuan` - SiYuan document sync\n";
    md += "- `POST /api/webhooks/:source` - Generic webhook receiver\n";

    return md;
  }

  generateDbSchema(): string {
    const tables = this.extractDbTables();
    const modules = new Map<string, Array<{ table: string; columns: string[] }>>();

    for (const t of tables) {
      if (!modules.has(t.module)) {
        modules.set(t.module, []);
      }
      modules.get(t.module)!.push({ table: t.table, columns: t.columns });
    }

    let md = "# Database Schema\n\n";
    md += `The ERP system uses SQLite with ${tables.length} tables across ${modules.size} modules.\n\n`;

    for (const [module, moduleTables] of modules) {
      md += `## ${module} (${moduleTables.length} tables)\n\n`;
      for (const t of moduleTables) {
        md += `- \`${t.table}\``;
        if (t.columns.length > 0) {
          md += ` - ${t.columns.slice(0, 5).join(", ")}${t.columns.length > 5 ? "..." : ""}`;
        }
        md += "\n";
      }
      md += "\n";
    }

    return md;
  }

  generateArchitecture(): string {
    const routes = this.extractApiRoutes();
    const routeCount = routes.length;

    let md = "# System Architecture\n\n";
    md += "## Tech Stack\n";
    md += "- **Backend**: Node.js + Express + TypeScript\n";
    md += "- **Database**: SQLite (via better-sqlite3)\n";
    md += "- **Frontend**: React + Vite + TypeScript\n";
    md += "- **AI Integration**: MCP Protocol, Multi-provider support\n";
    md += "- **Process Management**: PM2\n";
    md += "- **Container**: Docker (SiYuan)\n\n";

    md += "## Service Architecture\n\n";
    md += "### Core Services\n";
    md += "| Service | Port | Description |\n";
    md += "|---------|------|-------------|\n";
    md += "| ERP Core | 3000 | Main ERP API + Frontend |\n";
    md += "| Knowledge Base | 3100 | Document storage & retrieval |\n";
    md += "| Redis | 6379 | Caching & session management |\n\n";

    md += "### AI Services\n";
    md += "| Service | Port | Description |\n";
    md += "|---------|------|-------------|\n";
    md += "| AI Orchestrator | 54516 | AI workflow coordination |\n";
    md += "| Agency Team | 54515 | Multi-agent collaboration |\n";
    md += "| System Agent | 54520 | System monitoring |\n";
    md += "| Sync SiYuan | 54513 | SiYuan KB sync |\n";
    md += "| AI Docs Updater | 54517 | Auto-doc generation |\n\n";

    md += "### External Services\n";
    md += "| Service | Port | Description |\n";
    md += "|---------|------|-------------|\n";
    md += "| SiYuan (Docker) | 54511 | Knowledge base & docs |\n";
    md += "| Nginx | 80/443 | Reverse proxy |\n\n";

    md += "## API Statistics\n";
    md += `- Total API endpoints: ${routeCount}\n`;
    md += `- Modules: Finance, Procurement, HR, Marketing, AI, System\n\n`;

    md += "## Data Flow\n";
    md += "1. Client Nginx ERP Core (port 3000)\n";
    md += "2. ERP Core SQLite (direct file access)\n";
    md += "3. ERP Core Knowledge Base (HTTP)\n";
    md += "4. Sync SiYuan SiYuan API (periodic sync)\n";
    md += "5. AI Orchestrator MCP Tools (internal)\n";

    return md;
  }
}

// ============================================================
// Docs Updater Engine
// ============================================================

class DocsUpdater {
  private state: DocState = {};
  private statePath = "./data/ai-docs-state.json";
  private analyzer: CodeAnalyzer;
  private notebookId: string | null = null;
  private isRunning = false;

  constructor(erpRoot: string) {
    this.analyzer = new CodeAnalyzer(erpRoot);
    this.loadState();
  }

  private loadState() {
    try {
      const dirname = path.dirname(this.statePath);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }
      if (fs.existsSync(this.statePath)) {
        this.state = JSON.parse(fs.readFileSync(this.statePath, "utf-8"));
        console.log(`[DocsUpdater] Loaded state: ${Object.keys(this.state).length} docs tracked`);
      }
    } catch {
      this.state = {};
    }
  }

  private saveState() {
    try {
      const dirname = path.dirname(this.statePath);
      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error("[DocsUpdater] Failed to save state:", e);
    }
  }

  async initialize(): Promise<boolean> {
    try {
      this.notebookId = await findNotebook("ERP System Documentation");
      if (!this.notebookId) {
        console.error("[DocsUpdater] Notebook 'ERP System Documentation' not found!");
        return false;
      }
      console.log(`[DocsUpdater] Found notebook: ${this.notebookId}`);
      return true;
    } catch (err: any) {
      console.error(`[DocsUpdater] Failed to initialize: ${err.message}`);
      return false;
    }
  }

  async checkAndUpdate(): Promise<{ updated: number; skipped: number; errors: number }> {
    if (!this.notebookId) {
      const initialized = await this.initialize();
      if (!initialized) return { updated: 0, skipped: 0, errors: 1 };
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const docDef of DOC_REGISTRY) {
      try {
        const needsUpdate = this.checkNeedsUpdate(docDef);
        if (!needsUpdate) {
          skipped++;
          continue;
        }

        const content = await this.generateDocContent(docDef);
        if (!content) {
          skipped++;
          continue;
        }

        const success = await updateDoc(this.notebookId!, docDef.path, content);
        if (success) {
          this.state[docDef.path] = {
            lastUpdated: Date.now(),
            lastGitHash: this.getCurrentHash(docDef),
            content: content.substring(0, 100)
          };
          updated++;
          console.log(`[DocsUpdater] Updated: ${docDef.title}`);
        } else {
          errors++;
          console.error(`[DocsUpdater] Failed to update: ${docDef.title}`);
        }
      } catch (err: any) {
        errors++;
        console.error(`[DocsUpdater] Error updating ${docDef.title}: ${err.message}`);
      }
    }

    this.saveState();
    return { updated, skipped, errors };
  }

  private checkNeedsUpdate(docDef: DocDefinition): boolean {
    const prev = this.state[docDef.path];
    if (!prev) return true;

    const currentHash = this.getCurrentHash(docDef);
    return currentHash !== prev.lastGitHash;
  }

  private getCurrentHash(docDef: DocDefinition): string {
    let combined = "";
    for (const pattern of docDef.watchPatterns) {
      combined += this.analyzer.getGitHash(pattern);
    }
    return combined;
  }

  private async generateDocContent(docDef: DocDefinition): Promise<string | null> {
    switch (docDef.path) {
      case "/API Reference":
        return this.analyzer.generateApiReference();
      case "/Database Schema":
        return this.analyzer.generateDbSchema();
      case "/System Architecture":
        return this.analyzer.generateArchitecture();
      default:
        return null;
    }
  }

  async startPeriodicUpdate() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[DocsUpdater] Starting periodic updates every ${UPDATE_INTERVAL_MS}ms`);

    try {
      const result = await this.checkAndUpdate();
      console.log(`[DocsUpdater] Initial update: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`);
    } catch (err: any) {
      console.error(`[DocsUpdater] Initial update failed: ${err.message}`);
    }

    setInterval(async () => {
      try {
        const result = await this.checkAndUpdate();
        if (result.updated > 0 || result.errors > 0) {
          console.log(`[DocsUpdater] Cycle: ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`);
        }
      } catch (err: any) {
        console.error(`[DocsUpdater] Cycle error: ${err.message}`);
      }
    }, UPDATE_INTERVAL_MS);
  }

  getStats() {
    return {
      trackedDocs: Object.keys(this.state).length,
      isRunning: this.isRunning,
      notebookId: this.notebookId,
      docRegistrySize: DOC_REGISTRY.length
    };
  }

  async forceUpdateAll(): Promise<{ updated: number; skipped: number; errors: number }> {
    this.state = {};
    return this.checkAndUpdate();
  }
}

// ============================================================
// HTTP Server
// ============================================================

const updater = new DocsUpdater(ERP_ROOT);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req: any, res: any) => {
  res.json({ status: "ok", service: "ai-docs-updater", ...updater.getStats() });
});

app.post("/update", async (_req: any, res: any) => {
  try {
    const result = await updater.checkAndUpdate();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/update/force", async (_req: any, res: any) => {
  try {
    const result = await updater.forceUpdateAll();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/stats", (_req: any, res: any) => {
  res.json(updater.getStats());
});

app.get("/registry", (_req: any, res: any) => {
  res.json(DOC_REGISTRY.map(d => ({
    path: d.path,
    title: d.title,
    watchPatterns: d.watchPatterns
  })));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[DocsUpdater] AI Docs Updater Service running on http://0.0.0.0:${PORT}`);
  console.log(`[DocsUpdater] SiYuan: ${SIYUAN_URL}, ERP Root: ${ERP_ROOT}`);
  updater.startPeriodicUpdate();
});
