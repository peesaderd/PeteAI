import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { TEMPLATES, DOC_TYPES, DOC_LABELS, DocType } from "./templates.js";
export type { DocType };

const REPO_ROOT = process.env.REPO_ROOT || "/root/erp-core";
const SIYUAN_URL = process.env.SIYUAN_URL || "http://siyuan:6806";
const SIYUAN_TOKEN = process.env.SIYUAN_TOKEN || "";
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || "http://localhost:54516";
const DOCS_DIR = process.env.DOCS_DIR || "/app/docs";

interface ApiRoute {
  method: string;
  path: string;
  description?: string;
}

interface DocResult {
  type: DocType;
  markdown: string;
  published?: { notebookId: string; docId: string };
}

export class DocGenerator {
  private lastCommitHash = "";
  private siyuanNotebookId: string | null = null;
  private siyuanDocIds: Record<string, string> = {};

  async generate(type: DocType = "all"): Promise<DocResult[]> {
    console.log("[DocGenerator] Generating docs for type=" + type + "...");
    const results: DocResult[] = [];
    const types = type === "all" ? DOC_TYPES : [type];

    for (const t of types) {
      const md = await this.generateType(t);
      if (md) results.push({ type: t, markdown: md });
    }

    if (results.length === 0) {
      console.log("[DocGenerator] No changes detected.");
      return [];
    }

    this.saveLocally(results);

    for (const r of results) {
      const published = await this.publishToSiyuan(r.type, r.markdown);
      if (published) r.published = published;
    }

    return results;
  }

  private async generateType(type: DocType): Promise<string | null> {
    switch (type) {
      case "changelog": return this.genChangelog();
      case "api":       return await this.genApiRoutes();
      case "tools":     return await this.genTools();
      case "agents":    return await this.genAgents();
      case "architecture": return this.genArchitecture();
      case "packages":  return this.genPackages();
      default: return null;
    }
  }

  private genChangelog(): string | null {
    try {
      const latestHash = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, timeout: 5000 }).toString().trim();
      if (this.lastCommitHash === latestHash) return null;

      const prevHash = this.lastCommitHash || latestHash + "~1";
      this.lastCommitHash = latestHash;

      const log = execSync(
        "git log --oneline --no-decorate " + prevHash + ".." + latestHash + " 2>/dev/null || git log --oneline -5",
        { cwd: REPO_ROOT, timeout: 5000 }
      ).toString().trim();

      const changedFiles = execSync(
        "git diff --name-status " + prevHash + ".." + latestHash + " 2>/dev/null || echo ''",
        { cwd: REPO_ROOT, timeout: 5000 }
      ).toString().trim();

      const diffStat = execSync(
        "git diff --stat " + prevHash + ".." + latestHash + " 2>/dev/null || echo ''",
        { cwd: REPO_ROOT, timeout: 5000 }
      ).toString().trim();

      let filesTable = "";
      for (const line of changedFiles.split("\n").filter(Boolean).slice(0, 50)) {
        const parts = line.split("\t");
        const typeCode = parts[0];
        const file = parts.slice(1).join("/");
        let icon = "modified";
        if (typeCode === "A") icon = "added";
        else if (typeCode === "D") icon = "deleted";
        else if (typeCode === "R") icon = "renamed";
        filesTable += "| " + file + " | " + icon + " |\n";
      }

      const stat = diffStat ? ("\n```\n" + diffStat + "\n```") : "";

      return this.renderSection("changelogSection", {
        commits: log,
        filesTable: filesTable || "| _none_ | - |\n",
        stat,
      });
    } catch (err) {
      console.error("[DocGenerator] Changelog error:", (err as Error).message);
      return null;
    }
  }

  private async genApiRoutes(): Promise<string | null> {
    try {
      const packages = ["ai-orchestrator", "system-agent", "sync-siyuan", "task-manager"];
      let output = "";
      for (const pkg of packages) {
        const pkgPath = path.join(REPO_ROOT, "erp-core", "packages", pkg, "src");
        if (!fs.existsSync(pkgPath)) continue;
        const routes: ApiRoute[] = [];
        const files = this.walkDir(pkgPath, ".ts");
        for (const file of files) {
          const content = fs.readFileSync(file, "utf-8");
          const routeRegex = /\\.(get|post|put|patch|delete)\\(["\'"])([^"\'"]+)\2/g;
          let match;
          while ((match = routeRegex.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[3];
            const lines = content.split("\n");
            const lineIdx = content.substring(0, match.index).split("\n").length - 1;
            const prevLine = lineIdx > 0 ? lines[lineIdx - 1].trim() : "";
            const description = prevLine.startsWith("//") ? prevLine.replace("//", "").trim() : "";
            routes.push({ method, path: routePath, description });
          }
        }
        if (routes.length > 0) {
          let routesTable = "";
          for (const r of routes) {
            routesTable += "| " + r.method + " | `" + r.path + "` | " + (r.description || "-") + " |\n";
          }
          output += this.renderSection("apiSection", { packageName: pkg, routesTable });
        }
      }
      return output || null;
    } catch (err) {
      console.error("[DocGenerator] API routes error:", (err as Error).message);
      return null;
    }
  }

  private async genTools(): Promise<string | null> {
    try {
      const resp = await fetch(ORCHESTRATOR_URL + "/api/tools", { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.tools?.length) return null;
      let toolsTable = "";
      for (const t of data.tools.slice(0, 100)) {
        toolsTable += "| `" + t.name + "` | " + (t.description || "").substring(0, 100) + " |\n";
      }
      return this.renderSection("toolsSection", { total: String(data.tools.length), toolsTable });
    } catch { return null; }
  }

  private async genAgents(): Promise<string | null> {
    try {
      const resp = await fetch(ORCHESTRATOR_URL + "/api/agents/loop", { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return null;
      const data = await resp.json();
      let agentsTable = "";
      for (const a of data.agents || []) {
        const status = a.sleeping ? "Sleeping" : "Active";
        agentsTable += "| **" + a.name + "** | " + a.role + " | " + status + " | " + a.activeTasks + "/" + a.maxConcurrent + " |\n";
      }
      return this.renderSection("agentsSection", {
        mode: data.eventDriven ? "Event-Driven" : "Polling",
        maxConcurrent: String(data.maxConcurrentAgents),
        agentsTable: agentsTable || "| _none_ | - | - | - |\n",
      });
    } catch { return null; }
  }

  private genArchitecture(): string | null {
    try {
      const dcPath = path.join(REPO_ROOT, "erp-core", "docker-compose.yml");
      if (!fs.existsSync(dcPath)) return null;
      const dcContent = fs.readFileSync(dcPath, "utf-8");
      const serviceRegex = /^  ([\\w-]+):/gm;
      const services: string[] = [];
      let match;
      while ((match = serviceRegex.exec(dcContent)) !== null) services.push(match[1]);
      let servicesTable = "";
      for (const s of services) servicesTable += "| " + s + " |\n";
      return this.renderSection("architectureSection", { total: String(services.length), servicesTable });
    } catch { return null; }
  }

  private genPackages(): string | null {
    try {
      const packagesDir = path.join(REPO_ROOT, "erp-core", "packages");
      if (!fs.existsSync(packagesDir)) return null;
      const packages = fs.readdirSync(packagesDir)
        .filter(p => fs.existsSync(path.join(packagesDir, p, "package.json")));
      let packagesTable = "";
      for (const pkg of packages) {
        try {
          const pkgJson = JSON.parse(
            fs.readFileSync(path.join(packagesDir, pkg, "package.json"), "utf-8")
          );
          packagesTable += "| **" + pkg + "** | " + (pkgJson.description || "-") + " |\n";
        } catch {
          packagesTable += "| **" + pkg + "** | - |\n";
        }
      }
      return this.renderSection("packagesSection", { packagesTable });
    } catch { return null; }
  }

  private renderSection(templateKey: string, vars: Record<string, string>): string {
    const template = (TEMPLATES as any)[templateKey];
    if (!template) return "";
    let result = template;
    for (const [key, val] of Object.entries(vars)) {
      result = result.replace(new RegExp("{{" + key + "}}", "g"), val);
    }
    return result;
  }

  private buildFullMarkdown(sections: { type: DocType; markdown: string }[]): string {
    const date = new Date().toISOString().split("T")[0];
    const time = new Date().toISOString().split("T")[1].substring(0, 5);
    let commit = "";
    try {
      commit = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT, timeout: 3000 }).toString().trim();
    } catch {}

    let md = this.renderSection("header", { date, time, commit });
    for (const s of sections) {
      const label = DOC_LABELS[s.type] || s.type;
      md += "## " + label + "\n\n" + s.markdown + "\n";
    }
    md += TEMPLATES.footer;
    return md;
  }

  private saveLocally(results: DocResult[]): void {
    try {
      const dateDir = new Date().toISOString().split("T")[0];
      const outDir = path.join(DOCS_DIR, dateDir);
      fs.mkdirSync(outDir, { recursive: true });

      for (const r of results) {
        fs.writeFileSync(path.join(outDir, r.type + ".md"), r.markdown, "utf-8");
      }

      const combined = this.buildFullMarkdown(results.map(r => ({ type: r.type, markdown: r.markdown })));
      fs.writeFileSync(path.join(outDir, "full.md"), combined, "utf-8");
      fs.writeFileSync(path.join(DOCS_DIR, "latest.md"), combined, "utf-8");

      console.log("[DocGenerator] Saved " + results.length + " docs to " + outDir);
    } catch (err) {
      console.error("[DocGenerator] Local save error:", (err as Error).message);
    }
  }

  private async ensureSiyuanNotebook(): Promise<string | null> {
    if (this.siyuanNotebookId) return this.siyuanNotebookId;
    try {
      const resp = await fetch(SIYUAN_URL + "/api/notebook/lsNotebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Token " + SIYUAN_TOKEN },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) { console.error("[DocGenerator] SiYuan lsNotebooks failed: " + resp.status); return null; }
      const data = await resp.json();
      const notebooks = data?.data?.notebooks || [];

      let nb = notebooks.find((n: any) =>
        n.name === "System Docs" || n.name?.toLowerCase().includes("system")
      );
      if (nb) { this.siyuanNotebookId = nb.id; return nb.id; }

      const createResp = await fetch(SIYUAN_URL + "/api/notebook/createNotebook", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Token " + SIYUAN_TOKEN },
        body: JSON.stringify({ name: "System Docs" }),
        signal: AbortSignal.timeout(5000),
      });
      if (!createResp.ok) { console.error("[DocGenerator] Failed to create SiYuan notebook"); return null; }
      const createData = await createResp.json();
      this.siyuanNotebookId = createData?.data?.notebook?.id || notebooks[0]?.id;
      console.log("[DocGenerator] Created SiYuan notebook: " + this.siyuanNotebookId);
      return this.siyuanNotebookId;
    } catch (err) {
      console.error("[DocGenerator] SiYuan notebook error:", (err as Error).message);
      return null;
    }
  }

  private async publishToSiyuan(type: DocType, markdown: string): Promise<{ notebookId: string; docId: string } | null> {
    try {
      const notebookId = await this.ensureSiyuanNotebook();
      if (!notebookId) return null;

      const datePath = new Date().toISOString().split("T")[0].replace(/-/g, "/");
      const docName = DOC_LABELS[type] || type;
      const docPath = "/system/docs/" + datePath + "/" + docName;

      const existingDocId = this.siyuanDocIds[type];
      if (existingDocId) {
        const updateResp = await fetch(SIYUAN_URL + "/api/filetree/updateDoc", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Token " + SIYUAN_TOKEN },
          body: JSON.stringify({ id: existingDocId, markdown }),
          signal: AbortSignal.timeout(10000),
        });
        if (updateResp.ok) {
          console.log("[DocGenerator] Updated SiYuan doc: " + docName + " (" + existingDocId + ")");
          return { notebookId, docId: existingDocId };
        }
      }

      const createResp = await fetch(SIYUAN_URL + "/api/filetree/createDocWithMd", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Token " + SIYUAN_TOKEN },
        body: JSON.stringify({ notebook: notebookId, path: docPath, markdown }),
        signal: AbortSignal.timeout(10000),
      });
      if (!createResp.ok) { console.error("[DocGenerator] SiYuan createDoc failed for " + docName); return null; }
      const createData = await createResp.json();
      const docId = typeof createData?.data === "string" ? createData.data : (createData?.data?.id || "unknown");
      this.siyuanDocIds[type] = docId;
      console.log("[DocGenerator] Published to SiYuan: " + docName + " (" + docId + ")");
      return { notebookId, docId };
    } catch (err) {
      console.error("[DocGenerator] SiYuan publish error:", (err as Error).message);
      return null;
    }
  }

  private walkDir(dir: string, ext: string): string[] {
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
          results.push(...this.walkDir(fullPath, ext));
        else if (entry.isFile() && entry.name.endsWith(ext)) results.push(fullPath);
      }
    } catch { /* skip */ }
    return results;
  }
}
