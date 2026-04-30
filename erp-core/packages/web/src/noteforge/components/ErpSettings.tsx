import { useState, useEffect } from 'react';
import { loadErpConfig, saveErpConfig, getErpConfig, erpLogin, erpRegister } from '../utils/erpApi';

type Mode = 'login' | 'register' | 'settings';

export function ErpSettings({ onConnected }: { onConnected?: () => void }) {
  const [mode, setMode] = useState<Mode>('settings');
  const [config, setConfig] = useState(() => loadErpConfig());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = () => {
    saveErpConfig(config);
    setMessage({ type: 'success', text: 'Settings saved!' });
    setTimeout(() => setMessage(null), 2000);
    onConnected?.();
  };

  const handleLogin = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await erpLogin(email, password);
      setConfig(getErpConfig());
      setMessage({ type: 'success', text: `Logged in as ${data.user?.name || email}` });
      onConnected?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const data = await erpRegister(tenantName, tenantSlug, email, name, password);
      setConfig(getErpConfig());
      setMessage({ type: 'success', text: `Tenant "${data.tenant?.name}" created!` });
      onConnected?.();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    saveErpConfig({ token: null, tenantId: '' });
    setConfig(getErpConfig());
    setMessage({ type: 'success', text: 'Disconnected' });
    onConnected?.();
  };

  return (
    <div className="erp-container">
      <div className="erp-header">
        <h2>⚙️ ERP Connection</h2>
      </div>

      <div className="erp-settings-form">
        <label className="erp-label">ERP Server URL</label>
        <input
          className="erp-input"
          value={config.baseUrl}
          onChange={e => setConfig({ ...config, baseUrl: e.target.value })}
          placeholder="http://localhost:52601"
        />

        {config.tenantId && config.token ? (
          <>
            <div className="erp-connected-info">
              <p>✅ Connected as tenant: <strong>{config.tenantId}</strong></p>
              <button className="erp-btn erp-btn-danger" onClick={handleDisconnect}>Disconnect</button>
            </div>
            <button className="erp-btn" onClick={handleSave}>Save Settings</button>
          </>
        ) : (
          <>
            <div className="erp-auth-tabs">
              <button
                className={`erp-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => setMode('login')}
              >Sign In</button>
              <button
                className={`erp-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => setMode('register')}
              >Create Tenant</button>
            </div>

            {mode === 'login' ? (
              <div className="erp-auth-form">
                <label className="erp-label">Email</label>
                <input className="erp-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" />
                <label className="erp-label">Password</label>
                <input className="erp-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                <button className="erp-btn" onClick={handleLogin} disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </div>
            ) : (
              <div className="erp-auth-form">
                <label className="erp-label">Tenant Name</label>
                <input className="erp-input" value={tenantName} onChange={e => setTenantName(e.target.value)} placeholder="My Company" />
                <label className="erp-label">Tenant Slug</label>
                <input className="erp-input" value={tenantSlug} onChange={e => setTenantSlug(e.target.value)} placeholder="my-company" />
                <label className="erp-label">Your Name</label>
                <input className="erp-input" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" />
                <label className="erp-label">Email</label>
                <input className="erp-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" />
                <label className="erp-label">Password</label>
                <input className="erp-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                <button className="erp-btn" onClick={handleRegister} disabled={loading}>
                  {loading ? 'Creating...' : 'Create Tenant & Register'}
                </button>
              </div>
            )}
          </>
        )}

        {message && (
          <div className={`erp-message erp-message-${message.type}`}>
            {message.type === 'success' ? '✅' : '⚠️'} {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
