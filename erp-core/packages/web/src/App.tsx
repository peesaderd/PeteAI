import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, Users, BarChart3,
  Warehouse, Factory, BookOpen, Settings, CreditCard,
  ChevronRight, Menu, X, Globe, PenTool
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Customers from './pages/Customers';
import KnowledgeBase from './pages/KnowledgeBase';
import ProductionPlanning from './pages/ProductionPlanning';
import ChannelManagement from './pages/ChannelManagement';
import SettingsPage from './pages/Settings';
import AIProviderSettings from './pages/AIProviderSettings';
import NoteForgePage from './pages/NoteForge';

const NAV_ITEMS = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard'},
  { path: '/products', icon: Package, label: 'Products'},
  { path: '/orders', icon: ShoppingCart, label: 'Orders'},
  { path: '/customers', icon: Users, label: 'Customers'},
  { path: '/production', icon: Factory, label: 'Production'},
  { path: '/channels', icon: Globe, label: 'Channels'},
  { path: '/knowledge-base', icon: BookOpen, label: 'Knowledge Base'},
  { path: '/noteforge', icon: PenTool, label: 'NoteForge'},
  { path: '/settings', icon: Settings, label: 'Settings'},
];

export default function App() {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const location = useLocation();

  // Close mobile sidebar on route change
  React.useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile hamburger (visible when sidebar is hidden on mobile) */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="fixed top-3 left-3 z-30 p-2 rounded-lg bg-white shadow-md border border-gray-200 md:hidden"
      >
        <Menu size={20} />
      </button>

      {/* Sidebar — desktop */}
      <aside className={`
        hidden md:flex flex-col bg-white border-r border-gray-200 transition-all duration-200
        ${sidebarOpen ? 'w-64' : 'w-16'}
      `}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          {sidebarOpen && <h1 className="text-xl font-bold text-gray-800">ERP Core</h1>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-gray-100">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <item.icon size={20} />
                {sidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          {sidebarOpen && (
            <div className="text-xs text-gray-400">
              ERP Core v0.1.0
            </div>
          )}
        </div>
      </aside>

      {/* Sidebar — mobile overlay */}
      <aside className={`
        md:hidden fixed top-0 left-0 z-30 h-full bg-white border-r border-gray-200
        transition-transform duration-200 flex flex-col
        ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        w-64
      `}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">ERP Core</h1>
          <button onClick={() => setMobileSidebarOpen(false)} className="p-1 rounded hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <item.icon size={20} />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <div className="text-xs text-gray-400">ERP Core v0.1.0</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 pt-14 md:pt-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/production" element={<ProductionPlanning />} />
            <Route path="/channels" element={<ChannelManagement />} />
            <Route path="/knowledge-base" element={<KnowledgeBase />} />
            <Route path="/noteforge" element={<NoteForgePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/ai-providers" element={<AIProviderSettings />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
