import { execSync } from "child_process";
import fs from "fs";

export interface ResourceSnapshot {
  timestamp: string;
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo;
  docker: DockerInfo;
}

interface CpuInfo {
  usagePercent: number;
  loadAvg: number[];
}

interface MemoryInfo {
  totalGb: number;
  usedGb: number;
  freeGb: number;
  percentUsed: number;
}

interface DiskInfo {
  totalGb: number;
  usedGb: number;
  freeGb: number;
  percentUsed: number;
}

interface DockerInfo {
  containers: number;
  runningContainers: number;
  images: number;
  buildCacheGb: number;
  containerSizeGb: number;
  imageSizeGb: number;
}

export class ResourceMonitor {
  private history: ResourceSnapshot[] = [];
  private maxHistory = 60;

  async getAll(): Promise<ResourceSnapshot> {
    const snapshot: ResourceSnapshot = {
      timestamp: new Date().toISOString(),
      cpu: this.getCpuInfo(),
      memory: this.getMemoryInfo(),
      disk: this.getDiskInfo(),
      docker: this.getDockerInfo(),
    };
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }
    return snapshot;
  }

  async getStatus(): Promise<Record<string, any>> {
    const snap = await this.getAll();
    const alerts: string[] = [];
    if (snap.disk.percentUsed > 80) alerts.push("DISK_HIGH: " + snap.disk.percentUsed + "%");
    if (snap.memory.percentUsed > 90) alerts.push("MEM_HIGH: " + snap.memory.percentUsed + "%");
    return {
      healthy: alerts.length === 0,
      alerts,
      cpu: snap.cpu.usagePercent,
      memory: snap.memory.percentUsed + "%",
      disk: snap.disk.percentUsed + "%",
      docker: snap.docker.runningContainers + "/" + snap.docker.containers + " containers",
    };
  }

  getHistory(): ResourceSnapshot[] {
    return [...this.history];
  }

  private getCpuInfo(): CpuInfo {
    try {
      const stat1 = fs.readFileSync("/proc/stat", "utf-8");
      const line1 = stat1.split("\n").find((l) => l.startsWith("cpu "));
      const parts1 = line1?.split(/\s+/).slice(1).map(Number) || [0, 0, 0, 0];
      const idle1 = parts1[3] || 0;
      const total1 = parts1.reduce((a, b) => a + b, 0);
      const start = Date.now();
      while (Date.now() - start < 200) { /* busy wait */ }
      const stat2 = fs.readFileSync("/proc/stat", "utf-8");
      const line2 = stat2.split("\n").find((l) => l.startsWith("cpu "));
      const parts2 = line2?.split(/\s+/).slice(1).map(Number) || [0, 0, 0, 0];
      const idle2 = parts2[3] || 0;
      const total2 = parts2.reduce((a, b) => a + b, 0);
      const totalDiff = total2 - total1;
      const idleDiff = idle2 - idle1;
      const usagePercent = totalDiff > 0 ? Math.round(((totalDiff - idleDiff) / totalDiff) * 100) : 0;
      const loadAvg = fs.readFileSync("/proc/loadavg", "utf-8").split(" ").slice(0, 3).map(Number);
      return { usagePercent, loadAvg };
    } catch {
      return { usagePercent: 0, loadAvg: [0, 0, 0] };
    }
  }

  private getMemoryInfo(): MemoryInfo {
    try {
      const info = fs.readFileSync("/proc/meminfo", "utf-8");
      const getVal = (key: string): number => {
        const line = info.split("\n").find((l) => l.startsWith(key));
        const match = line?.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };
      const totalKb = getVal("MemTotal:");
      const freeKb = getVal("MemFree:");
      const buffersKb = getVal("Buffers:");
      const cachedKb = getVal("Cached:");
      const usedKb = totalKb - freeKb - buffersKb - cachedKb;
      return {
        totalGb: Math.round((totalKb / 1024 / 1024) * 100) / 100,
        usedGb: Math.round((usedKb / 1024 / 1024) * 100) / 100,
        freeGb: Math.round(((freeKb + buffersKb + cachedKb) / 1024 / 1024) * 100) / 100,
        percentUsed: totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0,
      };
    } catch {
      return { totalGb: 0, usedGb: 0, freeGb: 0, percentUsed: 0 };
    }
  }

  private getDiskInfo(): DiskInfo {
    try {
      const stat = fs.statfsSync("/");
      const total = (stat.blocks * stat.bsize) / 1024 / 1024 / 1024;
      const free = (stat.bfree * stat.bsize) / 1024 / 1024 / 1024;
      const used = total - free;
      return {
        totalGb: Math.round(total * 100) / 100,
        usedGb: Math.round(used * 100) / 100,
        freeGb: Math.round(free * 100) / 100,
        percentUsed: total > 0 ? Math.round((used / total) * 100) : 0,
      };
    } catch {
      return { totalGb: 0, usedGb: 0, freeGb: 0, percentUsed: 0 };
    }
  }

  private getDockerInfo(): DockerInfo {
    try {
      const psOut = execSync("docker ps -q 2>/dev/null || true", { timeout: 5000 }).toString().trim();
      const running = psOut ? psOut.split("\n").length : 0;
      const allOut = execSync("docker ps -aq 2>/dev/null || true", { timeout: 5000 }).toString().trim();
      const all = allOut ? allOut.split("\n").length : 0;
      const imgOut = execSync("docker images -q 2>/dev/null || true", { timeout: 5000 }).toString().trim();
      const images = imgOut ? imgOut.split("\n").length : 0;
      const dfOut = execSync("docker system df --format '{{.Type}}\t{{.Size}}' 2>/dev/null || true", { timeout: 5000 }).toString();
      const parseSize = (s: string): number => {
        const m = s.match(/^([\d.]+)(GB|MB|KB)/);
        if (!m) return 0;
        const v = parseFloat(m[1]);
        return m[2] === "GB" ? v : m[2] === "MB" ? v / 1024 : v / 1024 / 1024;
      };
      let buildCacheGb = 0, containerSizeGb = 0, imageSizeGb = 0;
      for (const line of dfOut.split("\n")) {
        if (line.startsWith("Build Cache")) buildCacheGb = parseSize(line.split("\t")[1] || "0");
        if (line.startsWith("Containers")) containerSizeGb = parseSize(line.split("\t")[1] || "0");
        if (line.startsWith("Images")) imageSizeGb = parseSize(line.split("\t")[1] || "0");
      }
      return { containers: all, runningContainers: running, images, buildCacheGb, containerSizeGb, imageSizeGb };
    } catch {
      return { containers: 0, runningContainers: 0, images: 0, buildCacheGb: 0, containerSizeGb: 0, imageSizeGb: 0 };
    }
  }
}
