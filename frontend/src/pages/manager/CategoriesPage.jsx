import { useState, useEffect, useCallback } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import { categoryAPI, instructorAPI } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Layers, Filter, RotateCcw } from 'lucide-react';
import { ActionTooltip } from '@/components/ui/tooltip';

export default function CategoriesPage() {
  return (
    <ManagerLayout activePage="categories">
      {({ user, location }) => <CategoriesContent location={location} />}
    </ManagerLayout>
  );
}

const EMPTY_FORM = { name: '', description: '', age_group: '', skill_level: 'all' };

function CategoriesContent({ location }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, category: null });
  const [instructors, setInstructors] = useState([]);
  const [savingSupervisorFor, setSavingSupervisorFor] = useState(null);
  
  // Filter state
  const [statusFilter, setStatusFilter] = useState('active'); // 'active', 'inactive', 'deleted'

  const fetch = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter === 'deleted') {
        params.include_deleted = true;
      } else if (statusFilter === 'active') {
        params.is_active = true;
      } else if (statusFilter === 'inactive') {
        params.is_active = false;
      }
      const res = await categoryAPI.list(null, params);
      let data = res.data;
      
      // Client-side filter for deleted vs non-deleted
      if (statusFilter === 'deleted') {
        data = data.filter(c => c.deleted_at);
      } else {
        data = data.filter(c => !c.deleted_at);
      }
      
      setCategories(data);
    } catch {} finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const loadInstructors = async () => {
      try {
        const res = await instructorAPI.list(location?.location_id);
        const rows = Array.isArray(res.data) ? res.data : (res.data?.instructors || []);
        setInstructors((rows || []).filter(i => !i.deleted_at));
      } catch {
        setInstructors([]);
      }
    };
    loadInstructors();
  }, [location?.location_id]);

  const instructorNameByStaffId = new Map((instructors || []).filter(i => i.staff_id).map(i => [i.staff_id, i.full_name || i.name || i.staff_id]));

  const handleSupervisorChange = async (cat, staffId) => {
    setSavingSupervisorFor(cat.category_id);
    try {
      await categoryAPI.update(cat.category_id, { supervisor_staff_id: staffId === '__none__' ? '' : staffId });
      toast.success('Supervisor updated');
      fetch();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update supervisor');
    } finally {
      setSavingSupervisorFor(null);
    }
  };

  const openCreate = () => { setForm(EMPTY_FORM); setDialog({ open: true, editing: null }); };
  const openEdit = (cat) => {
    setForm({ name: cat.name, description: cat.description, age_group: cat.age_group, skill_level: cat.skill_level });
    setDialog({ open: true, editing: cat });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (dialog.editing) {
        await categoryAPI.update(dialog.editing.category_id, form);
        toast.success('Category updated');
      } else {
        await categoryAPI.create(form);
        toast.success('Category created');
      }
      setDialog({ open: false, editing: null });
      fetch();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleToggleStatus = async (cat) => {
    try {
      if (cat.is_active) {
        await categoryAPI.update(cat.category_id, { is_active: false });
        toast.success('Category deactivated');
      } else {
        await categoryAPI.update(cat.category_id, { is_active: true });
        toast.success('Category activated');
      }
      fetch();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  const handleDelete = async () => {
    if (!deleteDialog.category) return;
    setSaving(true);
    try {
      await categoryAPI.delete(deleteDialog.category.category_id);
      toast.success('Category deleted');
      setDeleteDialog({ open: false, category: null });
      fetch();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleRestore = async (cat) => {
    try {
      await categoryAPI.restore(cat.category_id);
      toast.success('Category restored');
      fetch();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
  };

  return (
    <div data-testid="categories-page" className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">Categories</h1>
          <p className="text-zinc-500 font-body mt-1 text-base">Manage program categories</p>
        </div>
        <button data-testid="add-category-btn" onClick={openCreate}
          className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all active:scale-95 flex items-center gap-2">
          <Plus className="w-4 h-4" strokeWidth={1.5} /> Add Category
        </button>
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 mb-6">
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

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : categories.length === 0 ? (
        <div data-testid="no-categories-empty-state" className="border border-dashed border-zinc-800 rounded-sm p-16 text-center">
          <Layers className="w-12 h-12 text-zinc-700 mx-auto mb-4" strokeWidth={1.5} />
          <h3 className="font-heading font-bold text-white text-lg uppercase tracking-wider mb-2">
            {statusFilter === 'deleted' ? 'No Deleted Categories' :
             statusFilter === 'inactive' ? 'No Inactive Categories' : 'No Categories Yet'}
          </h3>
          <p className="text-zinc-500 font-body text-sm mb-6 max-w-md mx-auto">
            {statusFilter === 'active' && 'Categories help organize your programs (e.g., "Kids BJJ", "Women\'s Kickboxing", "CrossFit").'}
          </p>
          {statusFilter === 'active' && (
            <button
              data-testid="create-first-category-btn"
              onClick={openCreate}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-2 rounded-sm text-sm transition-all active:scale-95 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" strokeWidth={1.5} /> Create First Category
            </button>
          )}
        </div>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Name</th>
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden sm:table-cell">Age Group</th>
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden md:table-cell">Skill Level</th>
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs hidden lg:table-cell">Supervisor</th>
                <th className="text-center p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
                <th className="text-right p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.category_id} data-testid={`category-row-${cat.category_id}`}
                  className={`border-b border-zinc-800/50 hover:bg-zinc-800/20 transition-colors ${cat.deleted_at ? 'opacity-75' : ''}`}>
                  <td className="p-4">
                    <p className={`font-body text-sm font-medium ${cat.deleted_at ? 'text-zinc-500 line-through' : 'text-white'}`}>{cat.name}</p>
                    {cat.description && <p className="text-zinc-600 text-xs mt-0.5">{cat.description}</p>}
                  </td>
                  <td className="p-4 text-zinc-400 text-sm hidden sm:table-cell">{cat.age_group || '—'}</td>
                  <td className="p-4 hidden md:table-cell">
                    <Badge className="rounded-sm font-heading uppercase text-[10px] bg-zinc-800 text-zinc-300 border-0">{cat.skill_level}</Badge>
                  </td>
                  <td className="p-4 hidden lg:table-cell">
                    {cat.deleted_at ? (
                      <span className="text-zinc-600 text-xs">—</span>
                    ) : (
                      <Select
                        value={cat.supervisor_staff_id || '__none__'}
                        onValueChange={(v) => handleSupervisorChange(cat, v)}
                        disabled={savingSupervisorFor === cat.category_id}
                      >
                        <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-9 w-[240px]">
                          <SelectValue placeholder="Assign supervisor" />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800">
                          <SelectItem value="__none__" className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                            None
                          </SelectItem>
                          {(instructors || []).filter(i => i.staff_id).map((i) => (
                            <SelectItem key={i.staff_id} value={i.staff_id} className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
                              {i.full_name || i.name || i.staff_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {cat.supervisor_staff_id && instructorNameByStaffId.has(cat.supervisor_staff_id) && (
                      <div className="text-[10px] text-zinc-500 mt-1">{instructorNameByStaffId.get(cat.supervisor_staff_id)}</div>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {cat.deleted_at ? (
                      <Badge className="rounded-sm font-heading uppercase text-[10px] bg-red-500/20 text-red-400 border-0">Deleted</Badge>
                    ) : (
                      <button
                        data-testid={`toggle-status-cat-${cat.category_id}`}
                        onClick={() => handleToggleStatus(cat)}
                        className={`px-2 py-1 rounded-sm font-heading uppercase text-[10px] border transition-colors ${
                          cat.is_active 
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30' 
                            : 'bg-zinc-700/50 text-zinc-500 border-zinc-600 hover:bg-zinc-700'
                        }`}
                      >
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </button>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {cat.deleted_at ? (
                        <ActionTooltip label="Restore">
                          <button data-testid={`restore-cat-${cat.category_id}`} onClick={() => handleRestore(cat)}
                            className="text-zinc-500 hover:text-emerald-400 transition-colors p-1">
                            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </ActionTooltip>
                      ) : (
                        <>
                          <ActionTooltip label="Edit Category">
                            <button data-testid={`edit-cat-${cat.category_id}`} onClick={() => openEdit(cat)}
                              className="text-zinc-500 hover:text-white transition-colors p-1"><Pencil className="w-3.5 h-3.5" strokeWidth={1.5} /></button>
                          </ActionTooltip>
                          <ActionTooltip label="Delete Category">
                            <button data-testid={`delete-cat-${cat.category_id}`} onClick={() => setDeleteDialog({ open: true, category: cat })}
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
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              {dialog.editing ? 'Edit Category' : 'Add Category'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Name *</Label>
              <Input data-testid="category-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Kids BJJ" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Description</Label>
              <Input data-testid="category-desc-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Short description" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Age Group</Label>
                <Input data-testid="category-age-input" value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })}
                  placeholder="e.g. 5-12, Adults" className="bg-zinc-950 border-zinc-800 focus:border-red-600 rounded-sm text-white h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Skill Level</Label>
                <Select value={form.skill_level} onValueChange={(v) => setForm({ ...form, skill_level: v })}>
                  <SelectTrigger data-testid="category-skill-select" className="bg-zinc-950 border-zinc-800 rounded-sm text-white h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    {['all', 'beginner', 'intermediate', 'advanced'].map(l => (
                      <SelectItem key={l} value={l} className="text-zinc-300 focus:bg-zinc-800 focus:text-white capitalize">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <button onClick={() => setDialog({ open: false, editing: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all">Cancel</button>
            <button data-testid="save-category-btn" onClick={handleSave} disabled={saving}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, category: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">Delete Category</DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Are you sure you want to delete <strong className="text-white">{deleteDialog.category?.name}</strong>? 
              This will remove it from active lists but can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <button onClick={() => setDeleteDialog({ open: false, category: null })}
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
