import React, { useEffect, useState, useCallback } from "react";
import {
  FolderKanban, ListTodo, Plus, CheckCircle, Play, Pause, Trash2,
  RefreshCw, Search, X, Clock, AlertTriangle, User, Layers,
} from "lucide-react";
import { PageHeader, StatCard, Skeleton } from "../components/ui";

const TM_API = "http://localhost:8081/api";
const TENANT = "erp-core";

interface Project {
  id: string; name: string; description: string; status: string;
  priority: string; start_date: string | null; due_date: string | null;
  completed_at: string | null; created_at: number; updated_at: number;
}

interface Task {
  id: string; title: string; description: string; status: string;
  priority: string; project_id: string | null; assignee: string | null;
  estimated_hours: number | null; actual_hours: number | null;
  due_date: string | null; sort_order: number;
  created_at: number; updated_at: number;
  comments: any[]; dependencies: string[];
}

export default function ProjectManager() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [newTask, setNewTask] = useState({ title: "", description: "", priority: "medium", project_id: "" });

  const fetchAll = useCallback(async () => {
    try {
      const [projRes, taskRes] = await Promise.all([
        fetch(`${TM_API}/projects?tenant_id=${TENANT}`),
        fetch(`${TM_API}/tasks?tenant_id=${TENANT}`),
      ]);
      if (projRes.ok) {
        const data = await projRes.json();
        setProjects(Array.isArray(data) ? data : []);
      }
      if (taskRes.ok) {
        const data = await taskRes.json();
        setTasks(Array.isArray(data) ? data : []);
      }
    } catch (err) { console.error("Fetch error:", err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createTask = async () => {
    if (!newTask.title) return;
    try {
      await fetch(`${TM_API}/tasks?tenant_id=${TENANT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newTask, project_id: selectedProject }),
      });
      setNewTask({ title: "", description: "", priority: "medium", project_id: "" });
      setShowNewTask(false);
      fetchAll();
    } catch (err) { console.error(err); }
  };

  const updateTaskStatus = async (id: string, status: string) => {
    try {
      await fetch(`${TM_API}/tasks/${id}?tenant_id=${TENANT}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchAll();
    } catch (err) { console.error(err); }
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    try {
      await fetch(`${TM_API}/tasks/${id}?tenant_id=${TENANT}`, { method: "DELETE" });
      fetchAll();
    } catch (err) { console.error(err); }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "critical": return "text-red-600 bg-red-50 border-red-200";
      case "high": return "text-orange-600 bg-orange-50 border-orange-200";
      case "medium": return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "low": return "text-blue-600 bg-blue-50 border-blue-200";
      default: return "text-gray-500 bg-gray-50 border-gray-200";
    }
  };

  const getStatusIcon = (s: string) => {
    switch (s) {
      case "done": return CheckCircle;
      case "running": return Play;
      case "todo": return ListTodo;
      case "failed": return AlertTriangle;
      default: return Clock;
    }
  };

  const filteredTasks = tasks.filter(t => {
    if (selectedProject && t.project_id !== selectedProject) return false;
    if (filter !== "all" && t.status !== filter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: tasks.length, todo: tasks.filter(t => t.status === "todo").length,
    running: tasks.filter(t => t.status === "running").length,
    done: tasks.filter(t => t.status === "done").length,
    failed: tasks.filter(t => t.status === "failed").length,
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Project & Task Manager" description="Task Manager API v1" />
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Project & Task Manager" description="Task Manager API v1 — Express + SQLite">
        <button onClick={() => { setShowNewTask(true); setNewTask(p => ({ ...p, project_id: selectedProject || "" })); }}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm">
          <Plus size={16} /> New Task
        </button>
        <button onClick={fetchAll} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
          <RefreshCw size={18} className="text-gray-500" />
        </button>
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard icon={Layers} label="Total" value={String(stats.total)} color="bg-blue-500" sub="All tasks" />
        <StatCard icon={ListTodo} label="Todo" value={String(stats.todo)} color="bg-gray-500" sub="Awaiting" />
        <StatCard icon={Play} label="Running" value={String(stats.running)} color="bg-yellow-500" sub="In progress" />
        <StatCard icon={CheckCircle} label="Done" value={String(stats.done)} color="bg-green-500" sub="Completed" />
        <StatCard icon={AlertTriangle} label="Failed" value={String(stats.failed)} color="bg-red-500" sub="Needs attention" />
      </div>

      {/* Projects */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <FolderKanban size={20} className="text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Projects</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{projects.length}</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map(proj => (
            <div key={proj.id}
              onClick={() => setSelectedProject(selectedProject === proj.id ? null : proj.id)}
              className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
                selectedProject === proj.id ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200"
              }`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FolderKanban size={18} className="text-blue-600" />
                  <h3 className="font-semibold text-gray-900">{proj.name}</h3>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getPriorityColor(proj.priority)}`}>
                  {proj.priority}
                </span>
              </div>
              {proj.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{proj.description}</p>}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="capitalize">{proj.status}</span>
                <span>{tasks.filter(t => t.project_id === proj.id).length} tasks</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tasks */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <ListTodo size={18} className="text-blue-600" />
            <h3 className="font-semibold text-gray-900">Tasks</h3>
            {selectedProject && (
              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                {projects.find(p => p.id === selectedProject)?.name || "Selected"}
                <button onClick={() => setSelectedProject(null)} className="ml-1 hover:text-blue-800">&times;</button>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
            </div>
            <div className="flex gap-1">
              {["all", "todo", "running", "done", "failed"].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    filter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}>{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {filteredTasks.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <ListTodo size={40} className="mx-auto mb-3 opacity-50" />
              <p className="font-medium">No tasks found</p>
            </div>
          ) : filteredTasks.map(task => {
            const StatusIcon = getStatusIcon(task.status);
            return (
              <div key={task.id} className="p-4 hover:bg-gray-50 transition-colors group">
                <div className="flex items-start gap-3">
                  <button onClick={() => updateTaskStatus(task.id, task.status === "done" ? "todo" : "done")}
                    className={`mt-0.5 p-1 rounded-full transition-colors ${
                      task.status === "done" ? "text-green-500 hover:text-green-700" : "text-gray-300 hover:text-gray-500"
                    }`}><CheckCircle size={18} /></button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${task.status === "done" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {task.title}
                      </span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                    </div>
                    {task.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{task.description}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                      <StatusIcon size={12} className="inline" />
                      <span className="capitalize">{task.status}</span>
                      {task.project_id && (
                        <span className="flex items-center gap-1"><FolderKanban size={10} />{projects.find(p => p.id === task.project_id)?.name || "Unknown"}</span>
                      )}
                      {task.assignee && <span className="flex items-center gap-1"><User size={10} />{task.assignee}</span>}
                      <span>{new Date(task.created_at * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {task.status !== "running" && (
                      <button onClick={() => updateTaskStatus(task.id, "running")} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Start"><Play size={14} /></button>
                    )}
                    {task.status === "running" && (
                      <button onClick={() => updateTaskStatus(task.id, "todo")} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-lg" title="Pause"><Pause size={14} /></button>
                    )}
                    <button onClick={() => deleteTask(task.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* New Task Modal */}
      {showNewTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowNewTask(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">New Task</h3>
              <button onClick={() => setShowNewTask(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Task title" value={newTask.title}
                onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" autoFocus />
              <textarea placeholder="Description (optional)" value={newTask.description}
                onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm h-20 resize-none" />
              <select value={newTask.priority}
                onChange={e => setNewTask(p => ({ ...p, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={newTask.project_id}
                onChange={e => setNewTask(p => ({ ...p, project_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={createTask}
                className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm">Create Task</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
