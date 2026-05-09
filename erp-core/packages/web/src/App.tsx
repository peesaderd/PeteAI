import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, Users, BarChart3,
  Warehouse, Factory, BookOpen, Settings, CreditCard,
  ChevronRight, Menu, X, Globe, PenTool, Truck, Users2,
  DollarSign, Megaphone, Bot, Layers, Shield, MessageSquare, TrendingUp
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import Production from './pages/Production';
import HR from './pages/HR';
import Finance from './pages/Finance';
import Procurement from './pages/Procurement';
import Channels from './pages/Channels';
import Marketing from './pages/Marketing';
import KnowledgeBase from './pages/KnowledgeBase';
import SettingsPage from './pages/Settings';
import LLMProviderSettings from './pages/LLMProviderSettings';
import AIChatbot from './pages/AIChatbot';
import AgentDashboard from './pages/AgentDashboard';
import Forecasting from './pages/Forecasting';
import FraudDetection from './pages/FraudDetection';
import UIDemo from './pages/UIDemo';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/products', icon: Package, label: 'Products' },
  { path: '/orders', icon: ShoppingCart, label: 'Orders' },
  { path: '/customers', icon: Users, label: 'Customers' },
  { path: '/inventory', icon: Warehouse, label: 'Inventory' },
  { path: '/production', icon: Factory, label: 'Production' },
  { path: '/procurement', icon: Truck, label: 'Procurement' },
  { path: '/hr', icon: Users2, label: 'HR' },
  { path: '/finance', icon: DollarSign, label: 'Finance' },
  { path: '/marketing', icon: Megaphone, label: 'Marketing' },
  { path: '/channels', icon: Globe, label: 'Channels' },
  { path: '/knowledge-base', icon: BookOpen, label: 'Knowledge Base' },
  { path: '/chat', icon: MessageSquare, label: 'AI Chat' },
  { path: '/agent', icon: Bot, label: 'Agent' },
  { path: '/forecasting', icon: TrendingUp, label: 'Forecasting' },
  { path: '/fraud', icon: Shield, label: 'Fraud Detection' },
  { path: '/llm', icon: Bot, label: 'LLM' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function App() {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => { setMobileSidebarOpen(false); }, [location.pathname]);

  return (
    <div className="flex h-screen bg-gray-50">
      {mobileSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setMobileSidebarOpen(false)} />
      )}
      <button onClick={() => setMobileSidebarOpen(true)} className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-white shadow-md border border-gray-200 md:hidden">
        <Menu size={20} />
      </button>

      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex flex-col bg-white border-r border-gray-200 transition-all duration-200 ${sidebarOpen ? 'w-64' : 'w-16'}`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {sidebarOpen && <h1 className="text-xl font-bold text-gray-800">ERP Core</h1>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-gray-100">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <item.icon size={20} />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          {sidebarOpen && <div className="text-xs text-gray-400">ERP Core v0.1.0</div>}
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside className={`md:hidden fixed top-0 left-0 z-30 h-full bg-white border-r border-gray-200 transition-transform duration-200 flex flex-col ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'} w-64`}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">ERP Core</h1>
          <button onClick={() => setMobileSidebarOpen(false)} className="p-1 rounded hover:bg-gray-100"><X size={20} /></button>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <item.icon size={20} />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200"><div className="text-xs text-gray-400">ERP Core v0.1.0</div></div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 pt-14 md:pt-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/production" element={<Production />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/hr" element={<HR />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/marketing" element={<Marketing />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/knowledge-base" element={<KnowledgeBase />} />
            <Route path="/chat" element={<AIChatbot />} />
            <Route path="/agent" element={<AgentDashboard />} />
            <Route path="/forecasting" element={<Forecasting />} />
            <Route path="/fraud" element={<FraudDetection />} />
            <Route path="/llm" element={<LLMProviderSettings />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/ui-demo" element={<UIDemo />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
