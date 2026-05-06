import React, { useEffect, useState, useCallback } from "react";
import {
  Bot, Play, Square, Pause, RotateCcw, Activity,
  CheckCircle, XCircle, Clock, AlertTriangle,
  ListTodo, RefreshCw, Cpu, BarChart3, ChevronRight,
  Terminal, MessageSquare, Globe,
} from "lucide-react";
import { PageHeader, StatCard, Skeleton, StatusBadge } from "../components/ui";

const API_BASE = "/api";

interface AgentState {
  status: "idle" | "running" | "paused" | "stopped";
  currentTask: any | null;
  processedCount: number;
  failedCount: number;
  startedAt: string | null;
  uptimeMs: number;
}

interface Task {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  progress?: number;
  progressMessage?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  source?: string;
}

export default function AgentDashboard() {
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [failedTasks, setFailedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [stateRes, tasksRes, failedRes] = await Promise.all([
        fetch(`${API_BASE}/agent/state`),
        fetch(`${API_BASE}/agent/tasks?limit=50`),
        fetch(`${API_BASE}/agent/tasks/failed?limit=20`),
      ]);
      if (stateRes.ok) setAgentState(await stateRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (failedRes.ok) setFailedTasks(await failedRes.json());
    } catch (err) {
      console.error("Failed to fetch agent data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAll]);

  const sendAction = async (action: string) => {
    setActionLoading(action);
    try {
      await fetch(`${API_BASE}/agent/${action}`, { method: "POST" });
      await fetchAll();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "text-green-500";
      case "paused": return "text-yellow-500";
      case "idle": return "text-blue-500";
      case "stopped": return "text-gray-400";
      default: return "text-gray-400";
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "running": return "bg-green-100 border-green-200";
      case "paused": return "bg-yellow-100 border-yellow-200";
      case "idle": return "bg-blue-100 border-blue-200";
      case "stopped": return "bg-gray-100 border-gray-200";
      default: return "bg-gray-100 border-gray-200";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "chat": return MessageSquare;
      case "browser": return Globe;
      case "tool": return Terminal;
      default: return ListTodo;
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Agent Control" description="PeteAI Autonomous Agent v2" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const runningTasks = tasks.filter(t => t.status === "running");
  const queuedTasks = tasks.filter(t => t.status === "queued");
  const doneTasks = tasks.filter(t => t.status === "done");

  return (
    <div>
      <PageHeader title="Agent Control" description="PeteAI Autonomous Agent v2 — LLM Gateway + Task Queue + Agent Loop">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Activity size={14} className={autoRefresh ? "text-green-500" : "text-gray-300"} />
          <span>{autoRefresh ? "Auto-refresh 5s" : "Paused"}</span>
        </div>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`p-2 border rounded-lg transition-colors ${autoRefresh ? "bg-blue-50 border-blue-200" : "border-gray-200 hover:bg-gray-50"}`}
        >
          <RefreshCw size={18} className={autoRefresh ? "text-blue-600" : "text-gray-400"} />
        </button>
      </PageHeader>

      {/* Agent Status Hero */}
      <div className={`mb-6 rounded-xl border-2 p-6 ${agentState ? getStatusBg(agentState.status) : "bg-gray-100"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-full ${agentState?.status === "running" ? "bg-green-500" : agentState?.status === "paused" ? "bg-yellow-500" : "bg-gray-400"}`}>
              <Bot size={32} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900 capitalize">{agentState?.status || "Stopped"}</h2>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                  agentState?.status === "running" ? "bg-green-100 text-green-700" :
                  agentState?.status === "paused" ? "bg-yellow-100 text-yellow-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    agentState?.status === "running" ? "bg-green-500 animate-pulse" :
                    agentState?.status === "paused" ? "bg-yellow-500" :
                    "bg-gray-400"
                  }`} />
                  {agentState?.status === "running" ? "Active" : agentState?.status === "paused" ? "Paused" : "Inactive"}
                </span>
              </div>
              {agentState?.currentTask && (
                <p className="text-sm text-gray-600 mt-1">
                  Current: <span className="font-medium">{agentState.currentTask.title}</span>
                  {agentState.currentTask.progress !== undefined && (
                    <span className="ml-2 text-blue-600">({agentState.currentTask.progress}%)</span>
                  )}
                </p>
              )}
              {!agentState?.currentTask && (
                <p className="text-sm text-gray-500 mt-1">
                  {agentState?.status === "running" ? "Waiting for next task..." : "Agent is not running"}
                </p>
              )}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex gap-2">
            {agentState?.status !== "running" && agentState?.status !== "paused" && (
              <button
                onClick={() => sendAction("start")}
                disabled={actionLoading === "start"}
                className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium text-sm"
              >
                {actionLoading === "start" ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                Start
              </button>
            )}
            {agentState?.status === "running" && (
              <button
                onClick={() => sendAction("pause")}
                disabled={actionLoading === "pause"}
                className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 font-medium text-sm"
              >
                {actionLoading === "pause" ? <RefreshCw size={16} className="animate-spin" /> : <Pause size={16} />}
                Pause
              </button>
            )}
            {agentState?.status === "paused" && (
              <button
                onClick={() => sendAction("resume")}
                disabled={actionLoading === "resume"}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
              >
                {actionLoading === "resume" ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                Resume
              </button>
            )}
            {(agentState?.status === "running" || agentState?.status === "paused") && (
              <button
                onClick={() => sendAction("stop")}
                disabled={actionLoading === "stop"}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium text-sm"
              >
                {actionLoading === "stop" ? <RefreshCw size={16} className="animate-spin" /> : <Square size={16} />}
                Stop
              </button>
            )}
          </div>
        </div>

        {/* Progress bar for current task */}
        {agentState?.currentTask && agentState.currentTask.progress !== undefined && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">{agentState.currentTask.progressMessage || "Processing..."}</span>
              <span className="font-medium text-gray-900">{agentState.currentTask.progress}%</span>
            </div>
            <div className="w-full bg-white/50 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${agentState.currentTask.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={CheckCircle}
          label="Tasks Processed"
          value={agentState?.processedCount.toString() || "0"}
          color="bg-green-500"
          sub="Successfully completed"
        />
        <StatCard
          icon={XCircle}
          label="Tasks Failed"
          value={agentState?.failedCount.toString() || "0"}
          color="bg-red-500"
          sub="Requires attention"
        />
        <StatCard
          icon={Clock}
          label="Uptime"
          value={formatUptime(agentState?.uptimeMs || 0)}
          color="bg-blue-500"
          sub={agentState?.startedAt ? `Since ${new Date(agentState.startedAt).toLocaleTimeString()}` : "Not started"}
        />
        <StatCard
          icon={ListTodo}
          label="In Queue"
          value={queuedTasks.length.toString()}
          color="bg-purple-500"
          sub={`${runningTasks.length} running, ${doneTasks.length} done today`}
        />
      </div>

      {/* Task Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Active Tasks */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <ListTodo size={18} className="text-blue-600" />
              <h3 className="font-semibold text-gray-900">Task Queue</h3>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              {tasks.length} total
            </span>
          </div>
          <div className="overflow-x-auto">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <ListTodo size={32} className="mx-auto mb-2 opacity-50" />
                <p>No tasks in queue</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Title</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Priority</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Progress</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 text-xs uppercase">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tasks.map((task) => {
                    const TypeIcon = getTypeIcon(task.type);
                    return (
                      <tr key={task.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <TypeIcon size={16} className="text-gray-400" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{task.title}</div>
                          {task.description && (
                            <div className="text-xs text-gray-400 truncate max-w-[200px]">{task.description}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={task.status} />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            task.priority <= 2 ? "bg-red-100 text-red-700" :
                            task.priority <= 4 ? "bg-yellow-100 text-yellow-700" :
                            "bg-gray-100 text-gray-600"
                          }`}>
                            P{task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {task.progress !== undefined ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-100 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    task.status === "failed" ? "bg-red-500" :
                                    task.progress >= 100 ? "bg-green-500" : "bg-blue-500"
                                  }`}
                                  style={{ width: `${task.progress}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500">{task.progress}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-gray-400">{task.source || "system"}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Failed Tasks */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-500" />
              <h3 className="font-semibold text-gray-900">Failed Tasks</h3>
            </div>
            <span className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full">
              {failedTasks.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
            {failedTasks.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                <p className="text-sm">No failed tasks</p>
                <p className="text-xs text-gray-400 mt-1">All tasks completed successfully</p>
              </div>
            ) : (
              failedTasks.map((task) => (
                <div key={task.id} className="p-4 hover:bg-red-50 transition-colors">
                  <div className="flex items-start gap-2">
                    <XCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                      {task.error && (
                        <p className="text-xs text-red-600 mt-1 line-clamp-2">{task.error}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(task.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Agent Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cpu size={18} className="text-gray-500" />
          <h3 className="font-semibold text-gray-900">Agent Configuration</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-500">LLM Provider</span>
            <p className="font-medium text-gray-900 mt-1">DeepSeek</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-500">Task Queue</span>
            <p className="font-medium text-gray-900 mt-1">SQLite (Persistent)</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-500">Max Retries</span>
            <p className="font-medium text-gray-900 mt-1">3 (Exponential Backoff)</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-500">Timeout</span>
            <p className="font-medium text-gray-900 mt-1">5 minutes per task</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-500">Loop Interval</span>
            <p className="font-medium text-gray-900 mt-1">1 second</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <span className="text-gray-500">Tools Available</span>
            <p className="font-medium text-gray-900 mt-1">Browser + ReviveChat + MCP</p>
          </div>
        </div>
      </div>
    </div>
  );
}
