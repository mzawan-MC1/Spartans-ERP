import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerLayout from '@/components/ManagerLayout';
import { programAPI, categoryAPI } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, BookOpen, Filter, RotateCcw } from 'lucide-react';
import { ActionTooltip } from '@/components/ui/tooltip';

export default function ProgramsPage() {
  return (
    <ManagerLayout activePage="programs">
      {() => <ProgramsContent />}
    </ManagerLayout>
  );
}

const EMPTY = { category_id: '', name: '', description: '', capacity: 20, difficulty_level: 'beginner' };

function ProgramsContent() {
  const navigate = useNavigate();
  const [programs, setPrograms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, program: null });
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState('active'); // 'active', 'inactive', 'deleted'

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter === 'deleted') {
        params.include_deleted = true;
      } else if (statusFilter === 'active') {
        params.is_active = true;
      } else if (statusFilter === 'inactive') {
        params.is_active = false;
      }
      
      // Don't send 'all' to the backend as category_id filter
      const catParam = categoryFilter === 'all' ? null : categoryFilter;
      
      const [pRes, cRes] = await Promise.all([
        programAPI.list(null, catParam, params), 
        categoryAPI.list()
      ]);
      
      let data = pRes.data;
      
      // Client-side filter for deleted vs non-deleted
      if (statusFilter === 'deleted') {
        data = data.filter(p => p.deleted_at);
      } else {
        data = data.filter(p => !p.deleted_at);
      }
      
      setPrograms(data);
      setCategories(cRes.data);
    } catch {} finally { setLoading(false); }
  }, [categoryFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const catMap = Object.fromEntries(categories.map(c => [c.category_id, c.name]));
  const activeCategories = categories.filter(c => c.is_active && !c.deleted_at);

  const openCreate = () => { 
    setForm({ ...EMPTY, category_id: activeCategories[0]?.category_id || '' }); 
    setDialog({ open: true, editing: null }); 
  };
  const openEdit = (p) => {
    setForm({ category_id: p.category_id, name: p.name, description: p.description, capacity: p.capacity, difficulty_level: p.difficulty_level });
    setDialog({ open: true, editing: p });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.category_id) { toast.error('Name and category required'); return; }
    setSaving(true);
    try {
      if (dialog.editing) {
        await programAPI.update(dialog.editing.program_id, form);
        toast.success('Program updated');
      } else {
        await programAPI.create(form);
        toast.success('Program created');
      }
      setDialog({ open: false, editing: null });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (p) => {
    try {
      if (p.is_active) {
        await programAPI.update(p.program_id, { is_active: false });
        toast.success('Program deactivated');
      } else {
        await programAPI.update(p.program_id, { is_active: true });
        toast.success('Program activated');
      }
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const handleDelete = async () => {
    if (!deleteDialog.program) return;
    setSaving(true);
    try {
      await programAPI.delete(deleteDialog.program.program_id);
      toast.success('Program deleted');
      setDeleteDialog({ open: false, program: null });
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleRestore = async (p) => {
    try {
      await programAPI.restore(p.program_id);
      toast.success('Program restored');
      fetchData();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  return (
    <div data-testid="programs-page" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Programs</h1>
          <p className="text-zinc-500 font-body mt-1 text-base">Manage training programs</p>
        </div>
        <button data-testid="add-program-btn" onClick={openCreate}
          className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all active:scale-95 flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={1.5} /> Add Program
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-4 py-2 rounded-sm text-sm font-heading uppercase tracking-wider transition-colors whitespace-nowrap ${
              categoryFilter === 'all' || categoryFilter === ''
                ? 'bg-red-600 text-white'
                : 'bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}
          >
            All Programs
          </button>
          {activeCategories.map((c) => (
            <button
              key={c.category_id}
              onClick={() => setCategoryFilter(c.category_id)}
              className={`px-4 py-2 rounded-sm text-sm font-heading uppercase tracking-wider transition-colors whitespace-nowrap ${
                categoryFilter === c.category_id
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-800/50 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-3 self-start sm:self-auto shrink-0">
          <div className="flex items-center gap-2 text-zinc-400">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-heading uppercase tracking-wider">Status:</span>
          </div>
          {['active', 'inactive', 'deleted'].map((filter) => (
            <button
              key={filter}
              data-testid={`filter-${filter}`}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-sm text-xs font-heading uppercase tracking-wider transition-colors ${
                statusFilter === filter 
                  ? filter === 'deleted' 
                    ? 'bg-red-600/20 text-red-400 border border-red-500/30' 
                    : 'bg-zinc-700 text-white' 
                  : 'bg-zinc-800/50 text-zinc-500 hover:text-white'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : activeCategories.length === 0 && statusFilter === 'active' ? (
        /* No categories - show guidance */
        <div data-testid="no-categories-state" className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <Layers className="w-12 h-12 text-zinc-700 mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">No Categories Yet</h3>
          <p className="text-zinc-500 font-body text-sm mb-6 max-w-md mx-auto">
            Before creating programs, you need to create at least one program category (e.g., "Kids BJJ", "Women's Kickboxing").
          </p>
          <button
            data-testid="create-first-category-btn"
            onClick={() => navigate('/manager/categories')}
            className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-2 rounded-sm text-sm transition-all active:scale-95 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} /> Create First Category
            <ArrowRight className="w-4 h-4 ml-1" strokeWidth={1.5} />
          </button>
        </div>
      ) : programs.length === 0 ? (
        /* Has categories but no programs */
        <div data-testid="no-programs-state" className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">
            {statusFilter === 'deleted' ? 'No Deleted Programs' :
             statusFilter === 'inactive' ? 'No Inactive Programs' : 'No Programs Yet'}
          </h3>
          <p className="text-zinc-500 font-body text-sm mb-6 max-w-md mx-auto">
            {statusFilter === 'active' && `You have ${activeCategories.length} ${activeCategories.length === 1 ? 'category' : 'categories'}. Now create your first program to start scheduling classes.`}
          </p>
          {statusFilter === 'active' && (
            <button
              data-testid="create-first-program-btn"
              onClick={openCreate}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-2 rounded-sm text-sm transition-all active:scale-95 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} /> Create First Program
            </button>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Program</th>
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Category</th>
                <th className="text-center p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden md:table-cell">Capacity</th>
                <th className="text-center p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden md:table-cell">Difficulty</th>
                <th className="text-center p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
                <th className="text-right p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.program_id} data-testid={`program-row-${p.program_id}`}
                  className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${p.deleted_at ? 'opacity-75' : ''}`}>
                  <td className="p-4">
                    <p className={`font-body text-sm font-medium ${p.deleted_at ? 'text-zinc-500 line-through' : 'text-white'}`}>{p.name}</p>
                    {p.description && <p className="text-zinc-600 text-xs mt-0.5 truncate max-w-[200px]">{p.description}</p>}
                  </td>
                  <td className="p-4 text-zinc-400 text-sm hidden sm:table-cell">{catMap[p.category_id] || '—'}</td>
                  <td className="p-4 text-center text-zinc-300 text-sm hidden md:table-cell">{p.capacity}</td>
                  <td className="p-4 text-center hidden md:table-cell">
                    <Badge className="rounded-sm font-heading uppercase text-[10px] bg-zinc-800 text-zinc-300 border-0">{p.difficulty_level}</Badge>
                  </td>
                  <td className="p-4 text-center">
                    {p.deleted_at ? (
                      <Badge className="rounded-sm font-heading uppercase text-[10px] bg-red-500/20 text-red-400 border-0">Deleted</Badge>
                    ) : (
                      <button
                        data-testid={`toggle-status-prog-${p.program_id}`}
                        onClick={() => handleToggleStatus(p)}
                        className={`px-2 py-1 rounded-sm font-heading uppercase text-[10px] border transition-colors ${
                          p.is_active 
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' 
                            : 'bg-zinc-700/50 text-zinc-500 border-zinc-600 hover:bg-zinc-700'
                        }`}
                      >
                        {p.is_active ? 'Active' : 'Inactive'}
                      </button>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {p.deleted_at ? (
                        <ActionTooltip label="Restore">
                          <button data-testid={`restore-prog-${p.program_id}`} onClick={() => handleRestore(p)}
                            className="text-zinc-500 hover:text-emerald-400 transition-colors p-1">
                            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </ActionTooltip>
                      ) : (
                        <>
                          <ActionTooltip label="Edit Program">
                            <button data-testid={`edit-prog-${p.program_id}`} onClick={() => openEdit(p)}
                              className="text-zinc-500 hover:text-white transition-colors p-1"><Pencil className="w-3.5 h-3.5" strokeWidth={1.5} /></button>
                          </ActionTooltip>
                          <ActionTooltip label="Delete Program">
                            <button data-testid={`delete-prog-${p.program_id}`} onClick={() => setDeleteDialog({ open: true, program: p })}
                              className="text-zinc-500 hover:text-red-400 transition-colors p-1"><Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} /></button>
                          </ActionTooltip>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, editing: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm">
          <DialogHeader><DialogTitle className="font-heading text-white uppercase tracking-wider">{dialog.editing ? 'Edit Program' : 'Add Program'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Category *</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger data-testid="program-category-select" className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-800">
                  {activeCategories.map(c => (
                    <SelectItem key={c.category_id} value={c.category_id} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Name *</Label>
              <Input data-testid="program-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Program name" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Description</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Capacity</Label>
                <Input data-testid="program-capacity-input" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })}
                  className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Difficulty</Label>
                <Select value={form.difficulty_level} onValueChange={(v) => setForm({ ...form, difficulty_level: v })}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {['beginner', 'intermediate', 'advanced', 'all'].map(l => (
                      <SelectItem key={l} value={l} className="text-zinc-300 focus:bg-zinc-800 focus:text-white capitalize">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setDialog({ open: false, editing: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all">Cancel</button>
            <button data-testid="save-program-btn" onClick={handleSave} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, program: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Delete Program</DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Are you sure you want to delete <strong className="text-white">{deleteDialog.program?.name}</strong>? 
              This will remove it from active lists but can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <button onClick={() => setDeleteDialog({ open: false, program: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
