import React, { useEffect, useState } from 'react';
import { DollarSign, Plus, RefreshCw, TrendingUp, TrendingDown, PiggyBank, Receipt } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function Finance() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [profitLoss, setProfitLoss] = useState<any>(null);
  const [ar, setAr] = useState<any[]>([]);
  const [ap, setAp] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('transaction');

  const load = async () => {
    setLoading(true);
    try {
      const [ac, tx, bs, pl, arR, apR, bg] = await Promise.all([
        api.finance.accounts(),
        api.finance.transactions(),
        api.finance.balanceSheet(),
        api.finance.profitLoss(),
        api.finance.ar(),
        api.finance.ap(),
        api.finance.budgets(),
      ]);
      setAccounts(ac);
      setTransactions(tx);
      setBalanceSheet(bs);
      setProfitLoss(pl);
      setAr(arR);
      setAp(apR);
      setBudgets(bg);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Finance & Accounting" description="GL, AR/AP, P&L, budgets, and tax">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => { setModalType('transaction'); setShowModal(true); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> Add Transaction
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={DollarSign} label="Total Assets" value={balanceSheet ? `$${(balanceSheet.totalAssets || 0).toLocaleString()}` : '-'} color="bg-green-500" />
        <StatCard icon={TrendingDown} label="Liabilities" value={balanceSheet ? `$${(balanceSheet.totalLiabilities || 0).toLocaleString()}` : '-'} color="bg-red-500" />
        <StatCard icon={PiggyBank} label="Equity" value={balanceSheet ? `$${(balanceSheet.equity || 0).toLocaleString()}` : '-'} color="bg-blue-500" />
        <StatCard icon={TrendingUp} label="Net Income" value={profitLoss ? `$${(profitLoss.netIncome || 0).toLocaleString()}` : '-'} color="bg-purple-500" />
      </div>

      <Tabs tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'accounts', label: `Accounts (${accounts.length})` },
        { id: 'transactions', label: `Transactions (${transactions.length})` },
        { id: 'ar', label: `AR (${ar.length})` },
        { id: 'ap', label: `AP (${ap.length})` },
        { id: 'budgets', label: `Budgets (${budgets.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold mb-4">Balance Sheet</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Total Assets</span><span className="font-semibold text-green-600">${(balanceSheet?.totalAssets || 0).toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Total Liabilities</span><span className="font-semibold text-red-600">${(balanceSheet?.totalLiabilities || 0).toLocaleString()}</span></div>
              <div className="border-t pt-3 flex justify-between text-sm"><span className="font-medium">Equity</span><span className="font-bold">${(balanceSheet?.equity || 0).toLocaleString()}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-lg font-semibold mb-4">Profit & Loss</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Income</span><span className="font-semibold text-green-600">${(profitLoss?.totalIncome || 0).toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Expenses</span><span className="font-semibold text-red-600">${(profitLoss?.totalExpenses || 0).toLocaleString()}</span></div>
              <div className="border-t pt-3 flex justify-between text-sm"><span className="font-medium">Net Income</span><span className={`font-bold ${(profitLoss?.netIncome || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>${(profitLoss?.netIncome || 0).toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'accounts' && (
        <DataTable columns={[
          { header: 'Code', accessor: 'code' },
          { header: 'Name', accessor: 'name' },
          { header: 'Type', accessor: 'type' },
          { header: 'Subtype', accessor: 'subtype' },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} /> },
        ]} data={accounts} loading={loading} />
      )}

      {tab === 'transactions' && (
        <DataTable columns={[
          { header: 'ID', render: (r: any) => <span className="font-mono text-xs">{r.id?.slice(0, 12)}...</span> },
          { header: 'Type', render: (r: any) => <StatusBadge status={r.type} /> },
          { header: 'Category', accessor: 'category' },
          { header: 'Amount', render: (r: any) => <span className="font-medium">${(r.amount || 0).toFixed(2)}</span> },
          { header: 'Description', accessor: 'description' },
          { header: 'Date', render: (r: any) => new Date(r.createdAt || r.created_at || Date.now()).toLocaleDateString() },
        ]} data={transactions} loading={loading} />
      )}

      {tab === 'ar' && (
        <DataTable columns={[
          { header: 'Invoice', accessor: 'invoiceNumber' },
          { header: 'Customer', accessor: 'customerId' },
          { header: 'Amount', render: (r: any) => `$${(r.amount || 0).toFixed(2)}` },
          { header: 'Paid', render: (r: any) => `$${(r.amountPaid || 0).toFixed(2)}` },
          { header: 'Due', render: (r: any) => new Date(r.dueDate).toLocaleDateString() },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'pending'} /> },
        ]} data={ar} loading={loading} />
      )}

      {tab === 'ap' && (
        <DataTable columns={[
          { header: 'Supplier', accessor: 'supplierId' },
          { header: 'Amount', render: (r: any) => `$${(r.amount || 0).toFixed(2)}` },
          { header: 'Due', render: (r: any) => new Date(r.dueDate).toLocaleDateString() },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'pending'} /> },
        ]} data={ap} loading={loading} />
      )}

      {tab === 'budgets' && (
        <DataTable columns={[
          { header: 'Name', accessor: 'name' },
          { header: 'Amount', render: (r: any) => `$${(r.amount || 0).toLocaleString()}` },
          { header: 'Spent', render: (r: any) => `$${(r.spent || 0).toLocaleString()}` },
          { header: 'Remaining', render: (r: any) => <span className="font-medium">${((r.amount || 0) - (r.spent || 0)).toLocaleString()}</span> },
          { header: 'Period', render: (r: any) => `${r.fiscalYear || r.period || '-'}` },
        ]} data={budgets} loading={loading} />
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Transaction">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.finance.createTransaction(data);
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Select label="Type" name="type" options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }]} />
          <Input label="Category" name="category" required />
          <Input label="Amount" name="amount" type="number" step="0.01" required />
          <Input label="Description" name="description" />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
