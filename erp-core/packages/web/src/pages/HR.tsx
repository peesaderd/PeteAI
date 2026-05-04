import React, { useEffect, useState } from 'react';
import { Users2, Plus, RefreshCw, Clock, CalendarDays, DollarSign, Briefcase } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader, DataTable, StatusBadge, Modal, Input, Select, Tabs, StatCard } from '../components/ui';

export default function HR() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [timeTracking, setTimeTracking] = useState<any[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('employees');
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [emp, lev, tt, pr] = await Promise.all([
        api.hr.employees(),
        api.hr.leaves(),
        api.hr.timeTracking(),
        api.hr.payrollPeriods(),
      ]);
      setEmployees(emp);
      setLeaves(lev);
      setTimeTracking(tt);
      setPayrollPeriods(pr);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader title="Human Resources" description="Employees, time tracking, leave, and payroll">
        <button onClick={load} className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50"><RefreshCw size={18} /></button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
          <Plus size={16} /> Add Employee
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users2} label="Employees" value={employees.length.toString()} color="bg-blue-500" />
        <StatCard icon={CalendarDays} label="On Leave" value={leaves.filter((l: any) => l.status === 'approved').length.toString()} color="bg-yellow-500" />
        <StatCard icon={Clock} label="Clocked In" value={timeTracking.filter((t: any) => !t.clockOut).length.toString()} color="bg-green-500" />
        <StatCard icon={DollarSign} label="Payroll Periods" value={payrollPeriods.length.toString()} color="bg-purple-500" />
      </div>

      <Tabs tabs={[
        { id: 'employees', label: `Employees (${employees.length})` },
        { id: 'leaves', label: `Leaves (${leaves.length})` },
        { id: 'time', label: `Time Tracking (${timeTracking.length})` },
        { id: 'payroll', label: `Payroll (${payrollPeriods.length})` },
      ]} active={tab} onChange={setTab} />

      {tab === 'employees' && (
        <DataTable columns={[
          { header: 'Name', render: (r: any) => <span className="font-medium">{r.firstName} {r.lastName}</span> },
          { header: 'Email', accessor: 'email' },
          { header: 'Department', accessor: 'department' },
          { header: 'Position', accessor: 'position' },
          { header: 'Salary', render: (r: any) => r.salary ? `$${r.salary.toLocaleString()}` : '-' },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'active'} /> },
        ]} data={employees} loading={loading} />
      )}

      {tab === 'leaves' && (
        <DataTable columns={[
          { header: 'Employee', accessor: 'employeeName' },
          { header: 'Type', accessor: 'type' },
          { header: 'Start', render: (r: any) => new Date(r.startDate).toLocaleDateString() },
          { header: 'End', render: (r: any) => new Date(r.endDate).toLocaleDateString() },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'pending'} /> },
        ]} data={leaves} loading={loading} />
      )}

      {tab === 'time' && (
        <DataTable columns={[
          { header: 'Employee', accessor: 'employeeName' },
          { header: 'Clock In', render: (r: any) => new Date(r.clockIn).toLocaleString() },
          { header: 'Clock Out', render: (r: any) => r.clockOut ? new Date(r.clockOut).toLocaleString() : <StatusBadge status="active" mapping={{ active: 'bg-green-100 text-green-700' }} /> },
          { header: 'Duration', render: (r: any) => {
            if (!r.clockOut) return '-';
            const hrs = (r.clockOut - r.clockIn) / 3600000;
            return `${hrs.toFixed(1)}h`;
          }},
        ]} data={timeTracking} loading={loading} />
      )}

      {tab === 'payroll' && (
        <DataTable columns={[
          { header: 'Period', render: (r: any) => `${new Date(r.startDate).toLocaleDateString()} - ${new Date(r.endDate).toLocaleDateString()}` },
          { header: 'Status', render: (r: any) => <StatusBadge status={r.status || 'draft'} /> },
          { header: 'Total', render: (r: any) => r.totalAmount ? `$${r.totalAmount.toLocaleString()}` : '-' },
          { header: 'Paid', render: (r: any) => r.paidDate ? new Date(r.paidDate).toLocaleDateString() : '-' },
        ]} data={payrollPeriods} loading={loading} />
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Employee">
        <form onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target as HTMLFormElement);
          const data = Object.fromEntries(fd);
          try {
            await api.hr.createEmployee(data);
            setShowModal(false);
            load();
          } catch (err: any) { alert(err.message); }
        }}>
          <Input label="First Name" name="firstName" required />
          <Input label="Last Name" name="lastName" required />
          <Input label="Email" name="email" type="email" required />
          <Input label="Department" name="department" />
          <Input label="Position" name="position" />
          <Input label="Salary" name="salary" type="number" />
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
