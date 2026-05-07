import { useState, useEffect, useCallback } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import { payrollAPI, staffAPI, expenseAPI, financeAPI } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, DollarSign, TrendingDown, CheckCircle2, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export default function FinancePage() {
  return <ManagerLayout>{({ location }) => <FinanceContent location={location} />}</ManagerLayout>;
}

const EXPENSE_CATS = ['RENT', 'UTILITIES', 'MARKETING', 'EQUIPMENT', 'MAINTENANCE', 'MISC'];
const PIE_COLORS = ['#E53935', '#FB8C00', '#43A047', '#1E88E5', '#8E24AA', '#546E7A'];

function FinanceContent({ location }) {
  const [tab, setTab] = useState('payroll');
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const [periodStart, setPeriodStart] = useState(new Date(today.getFullYear(), today.getMonth() - 2, 1).toISOString().split('T')[0]);
  const [periodEnd, setPeriodEnd] = useState(today.toISOString().split('T')[0]);

  return (
    <div data-testid="finance-page" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="mb-8">
        <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Expenses</h1>
        <p className="text-zinc-500 font-body mt-1 text-base">Payroll, expenses & financial summary</p>
      </div>
      <div className="flex gap-1 border-b border-zinc-800 mb-6">
        {[{ key: 'payroll', label: 'Payroll' }, { key: 'expenses', label: 'Expenses' }, { key: 'summary', label: 'Summary' }].map(t => (
          <button key={t.key} data-testid={`finance-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-4 py-3 font-heading uppercase tracking-wider text-xs border-b-2 transition-all ${tab === t.key ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>{t.label}</button>
        ))}
      </div>
      {/* Period Filter */}
      <div className="flex gap-4 mb-6">
        <div className="space-y-1">
          <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">From</Label>
          <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-9 text-xs w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">To</Label>
          <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-9 text-xs w-36" />
        </div>
      </div>
      {tab === 'payroll' && <PayrollTab periodStart={periodStart} periodEnd={periodEnd} location={location} />}
      {tab === 'expenses' && <ExpensesTab periodStart={periodStart} periodEnd={periodEnd} location={location} />}
      {tab === 'summary' && <SummaryTab periodStart={periodStart} periodEnd={periodEnd} location={location} />}
    </div>
  );
}

function PayrollTab({ periodStart, periodEnd, location }) {
  const [records, setRecords] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false });
  const [form, setForm] = useState({ staff_id: '', period_start: '', period_end: '', base_pay: 0, bonuses: 0, deductions: 0, notes: '' });
  const [saving, setSaving] = useState(false);
  const locationId = location?.location_id;

  const fetch = useCallback(async () => {
    if (!locationId) return;
    try {
      const [pRes, sRes] = await Promise.all([payrollAPI.list({ period_start: periodStart, period_end: periodEnd, location_id: locationId }), staffAPI.list({ location_id: locationId })]);
      setRecords(pRes.data); setStaffList(sRes.data.filter(s => s.status === 'ACTIVE'));
    } catch {} finally { setLoading(false); }
  }, [periodStart, periodEnd, locationId]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => {
    const s = staffList[0];
    setForm({ staff_id: s?.staff_id || '', period_start: periodStart, period_end: periodEnd, base_pay: s?.pay_structure?.base_amount || 0, bonuses: 0, deductions: 0, notes: '' });
    setDialog({ open: true });
  };

  const handleStaffChange = (sid) => {
    const s = staffList.find(x => x.staff_id === sid);
    setForm({ ...form, staff_id: sid, base_pay: s?.pay_structure?.base_amount || 0 });
  };

  const handleCreate = async () => {
    if (!form.staff_id) { toast.error('Select staff'); return; }
    setSaving(true);
    try {
      await payrollAPI.create(form, locationId); toast.success('Payroll created'); setDialog({ open: false }); fetch();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleStatus = async (id, status) => {
    try { await payrollAPI.updateStatus(id, { status }, locationId); toast.success(`Marked as ${status}`); fetch(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const statusBadge = (s) => {
    const m = { DRAFT: 'bg-zinc-700/50 text-zinc-400', APPROVED: 'bg-amber-500/20 text-amber-400', PAID: 'bg-emerald-500/20 text-emerald-400' };
    return m[s] || 'bg-zinc-800 text-zinc-400';
  };

  return (
    <>
      <div className="flex justify-between mb-4">
        <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Payroll Records</h2>
        <button data-testid="add-payroll-btn" onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-3 py-1.5 rounded-sm text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Create Payroll
        </button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div> : records.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center"><p className="text-zinc-500 text-sm">No payroll records</p></div>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-zinc-800">
              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Staff</th>
              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Period</th>
              <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Base</th>
              <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden md:table-cell">Bonus</th>
              <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Total</th>
              <th className="text-center p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
              <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
            </tr></thead>
            <tbody>
              {records.map(r => (
                <tr key={r.payroll_id} data-testid={`payroll-row-${r.payroll_id}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                  <td className="p-3 text-white text-sm">{r.staff_name}</td>
                  <td className="p-3 text-zinc-400 text-xs hidden sm:table-cell">{r.period_start} — {r.period_end}</td>
                  <td className="p-3 text-right text-zinc-300 text-sm">{r.base_pay.toLocaleString()}</td>
                  <td className="p-3 text-right text-zinc-400 text-sm hidden md:table-cell">{r.bonuses.toLocaleString()}</td>
                  <td className="p-3 text-right text-white text-sm font-medium">{r.total_payable.toLocaleString()} {r.currency}</td>
                  <td className="p-3 text-center"><Badge className={`rounded-sm font-heading uppercase text-[10px] border-0 ${statusBadge(r.status)}`}>{r.status}</Badge></td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {r.status === 'DRAFT' && <button onClick={() => handleStatus(r.payroll_id, 'APPROVED')} className="text-amber-400 hover:text-amber-300 p-1" title="Approve"><CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /></button>}
                      {r.status === 'APPROVED' && <button onClick={() => handleStatus(r.payroll_id, 'PAID')} className="text-emerald-400 hover:text-emerald-300 p-1" title="Mark Paid"><DollarSign className="w-3.5 h-3.5" strokeWidth={1.5} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm">
          <DialogHeader><DialogTitle className="font-heading text-white uppercase tracking-wider">Create Payroll</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Staff *</Label>
              <Select value={form.staff_id} onValueChange={handleStaffChange}>
                <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">{staffList.map(s => (<SelectItem key={s.staff_id} value={s.staff_id} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{s.first_name} {s.last_name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Period Start</Label><Input type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10" /></div>
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Period End</Label><Input type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10" /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Base Pay</Label><Input type="number" value={form.base_pay} onChange={(e) => setForm({ ...form, base_pay: parseFloat(e.target.value) || 0 })} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10" /></div>
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Bonuses</Label><Input type="number" value={form.bonuses} onChange={(e) => setForm({ ...form, bonuses: parseFloat(e.target.value) || 0 })} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10" /></div>
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Deductions</Label><Input type="number" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: parseFloat(e.target.value) || 0 })} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10" /></div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setDialog({ open: false })} className="bg-transparent border border-zinc-700 text-zinc-300 font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm">Cancel</button>
            <button data-testid="save-payroll-btn" onClick={handleCreate} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Create</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExpensesTab({ periodStart, periodEnd, location }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], category: 'RENT', amount: 0, currency: 'AED', description: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const locationId = location?.location_id;

  const fetch = useCallback(async () => {
    if (!locationId) return;
    try { const r = await expenseAPI.list({ date_from: periodStart, date_to: periodEnd, location_id: locationId }); setExpenses(r.data); }
    catch {} finally { setLoading(false); }
  }, [periodStart, periodEnd, locationId]);

  useEffect(() => { fetch(); }, [fetch]);

  const openCreate = () => { setForm({ date: new Date().toISOString().split('T')[0], category: 'RENT', amount: 0, currency: 'AED', description: '', notes: '' }); setDialog({ open: true, editing: null }); };

  const handleSave = async () => {
    if (!form.amount) { toast.error('Amount required'); return; }
    setSaving(true);
    try {
      if (dialog.editing) { await expenseAPI.update(dialog.editing.expense_id, form, locationId); toast.success('Updated'); }
      else { await expenseAPI.create(form, locationId); toast.success('Expense added'); }
      setDialog({ open: false, editing: null }); fetch();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try { await expenseAPI.delete(id, locationId); toast.success('Expense deleted'); fetch(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const catColor = (c) => {
    const m = { RENT: 'text-red-400', UTILITIES: 'text-amber-400', MARKETING: 'text-blue-400', EQUIPMENT: 'text-emerald-400', MAINTENANCE: 'text-purple-400', MISC: 'text-zinc-400' };
    return m[c] || 'text-zinc-400';
  };

  return (
    <>
      <div className="flex justify-between mb-4">
        <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Expenses</h2>
        <button data-testid="add-expense-btn" onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-3 py-1.5 rounded-sm text-xs flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Add Expense</button>
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div> : expenses.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-sm p-12 text-center"><p className="text-zinc-500 text-sm">No expenses</p></div>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-zinc-800">
              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Date</th>
              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Category</th>
              <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Amount</th>
              <th className="text-left p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Description</th>
              <th className="text-right p-3 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
            </tr></thead>
            <tbody>{expenses.map(e => (
              <tr key={e.expense_id} data-testid={`expense-row-${e.expense_id}`} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                <td className="p-3 text-zinc-300 text-sm">{e.date}</td>
                <td className="p-3"><Badge className={`rounded-sm font-heading uppercase text-[10px] bg-zinc-800/50 border-0 ${catColor(e.category)}`}>{e.category}</Badge></td>
                <td className="p-3 text-right text-white text-sm font-medium">{e.amount.toLocaleString()} {e.currency}</td>
                <td className="p-3 text-zinc-400 text-sm hidden sm:table-cell truncate max-w-[200px]">{e.description}</td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => { setForm({ date: e.date, category: e.category, amount: e.amount, currency: e.currency, description: e.description, notes: e.notes }); setDialog({ open: true, editing: e }); }} className="text-zinc-500 hover:text-white p-1"><Pencil className="w-3.5 h-3.5" strokeWidth={1.5} /></button>
                    <button onClick={() => handleDelete(e.expense_id)} className="text-zinc-500 hover:text-red-400 p-1"><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, editing: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm">
          <DialogHeader><DialogTitle className="font-heading text-white uppercase tracking-wider">{dialog.editing ? 'Edit Expense' : 'Add Expense'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10" /></div>
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">{EXPENSE_CATS.map(c => (<SelectItem key={c} value={c} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{c}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Amount *</Label><Input data-testid="expense-amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10" /></div>
              <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">{['AED', 'USD', 'SAR'].map(c => (<SelectItem key={c} value={c} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{c}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2"><Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10" /></div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setDialog({ open: false, editing: null })} className="bg-transparent border border-zinc-700 text-zinc-300 font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm">Cancel</button>
            <button data-testid="save-expense-btn" onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 className="w-4 h-4 animate-spin" />} Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SummaryTab({ periodStart, periodEnd, location }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const locationId = location?.location_id;

  useEffect(() => {
    if (!locationId) return;
    financeAPI.locationSummary(periodStart, periodEnd, locationId).then(r => setSummary(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [periodStart, periodEnd, locationId]);

  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!summary) return null;

  return (
    <div data-testid="finance-summary" className="space-y-8">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
          <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Total Payroll</span>
          <p className="font-heading font-extrabold text-2xl text-red-500 mt-1">{summary.total_payroll.toLocaleString()} {summary.currency}</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-5 rounded-sm">
          <span className="text-zinc-500 text-[10px] font-heading uppercase tracking-wider">Total Expenses</span>
          <p className="font-heading font-extrabold text-2xl text-amber-400 mt-1">{summary.total_expenses.toLocaleString()} {summary.currency}</p>
        </div>
      </div>
      {summary.expenses_by_category?.length > 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6">
          <h3 className="font-heading font-bold text-white text-sm uppercase tracking-wider mb-4">Expenses by Category</h3>
          <div className="flex flex-col lg:flex-row items-center gap-8">
            <div className="w-64 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={summary.expenses_by_category} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={100} strokeWidth={0}>
                    {summary.expenses_by_category.map((_, i) => (<Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />))}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '2px', color: '#fff', fontSize: '12px' }} />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#a1a1aa' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 w-full">
              <table className="w-full">
                <tbody>{summary.expenses_by_category.map((e, i) => (
                  <tr key={e.category} className="border-b border-zinc-800/50">
                    <td className="py-2 flex items-center gap-2"><span className="w-3 h-3 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /><span className="text-zinc-300 text-sm">{e.category}</span></td>
                    <td className="py-2 text-right text-white text-sm font-medium">{e.amount.toLocaleString()} {summary.currency}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
