import { useState, useEffect, useCallback, useMemo } from 'react';
import { rolesAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Shield, 
  Plus, 
  Pencil, 
  Trash2, 
  Loader2,
  Lock,
  Check,
  X,
  AlertTriangle
} from 'lucide-react';

const SCOPE_COLORS = {
  OWNER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  MANAGER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  RECEPTIONIST: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  MEMBER: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

// Helper to group permissions by module
const groupPermissions = (permissions) => {
  const groups = {};
  
  permissions.forEach(perm => {
    let moduleName = 'Other';
    const key = perm.key.toLowerCase();
    
    if (key.includes('dashboard')) moduleName = 'Dashboard';
    else if (key.includes('location')) moduleName = 'Locations';
    else if (key.includes('program') || key.includes('categor')) moduleName = 'Programs & Categories';
    else if (key.includes('schedule') || key.includes('session')) moduleName = 'Schedule';
    else if (key.includes('attendance')) moduleName = 'Attendance';
    else if (key.includes('booking')) moduleName = 'Bookings';
    else if (key.includes('hr') || key.includes('staff') || key.includes('instructor')) moduleName = 'Staff & HR';
    else if (key.includes('finance') || key.includes('payment') || key.includes('auto_renew')) moduleName = 'Finance';
    else if (key.includes('sales')) moduleName = 'Sales';
    else if (key.includes('member') || key.includes('agreement') || key.includes('freeze') || key.includes('document')) moduleName = 'Members & Agreements';
    else if (key.includes('user') || key.includes('role')) moduleName = 'Users & Roles';
    else if (key.includes('lead')) moduleName = 'Leads';
    else if (key.includes('contact')) moduleName = 'Contacts';
    else if (key.includes('public')) moduleName = 'Public Site';
    
    if (!groups[moduleName]) groups[moduleName] = [];
    groups[moduleName].push(perm);
  });
  
  // Sort groups alphabetically but keep Dashboard first
  return Object.keys(groups).sort((a, b) => {
    if (a === 'Dashboard') return -1;
    if (b === 'Dashboard') return 1;
    return a.localeCompare(b);
  }).reduce((acc, key) => {
    acc[key] = groups[key];
    return acc;
  }, {});
};

export default function RolesTab() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState({ 
    owner_permissions: [], 
    manager_permissions: [],
    receptionist_permissions: [],
    member_permissions: []
  });
  const [loading, setLoading] = useState(true);
  
  // Dialogs
  const [createDialog, setCreateDialog] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, role: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, role: null });
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    scope: 'MANAGER',
    description: '',
    permissions: [],
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        rolesAPI.list(),
        rolesAPI.getPermissions(),
      ]);
      setRoles(rolesRes.data.roles);
      setPermissions(permsRes.data);
    } catch (err) {
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await rolesAPI.create(formData);
      toast.success('Role created successfully');
      setCreateDialog(false);
      setFormData({ name: '', code: '', scope: 'MANAGER', description: '', permissions: [] });
      fetchRoles();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create role');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editDialog.role) return;
    setSubmitting(true);
    try {
      await rolesAPI.update(editDialog.role.role_id, {
        name: formData.name,
        description: formData.description,
        permissions: formData.permissions,
      });
      toast.success('Role updated successfully');
      setEditDialog({ open: false, role: null });
      fetchRoles();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update role');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.role) return;
    setSubmitting(true);
    try {
      await rolesAPI.delete(deleteDialog.role.role_id);
      toast.success('Role deleted');
      setDeleteDialog({ open: false, role: null });
      fetchRoles();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete role');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (role) => {
    setFormData({
      name: role.name,
      code: role.code,
      scope: role.scope,
      description: role.description || '',
      permissions: role.permissions || [],
    });
    setEditDialog({ open: true, role });
  };

  const openCreateDialog = () => {
    setFormData({ name: '', code: '', scope: 'MANAGER', description: '', permissions: [] });
    setCreateDialog(true);
  };

  const getAvailablePermissions = useCallback((scope) => {
    switch(scope) {
      case 'OWNER': return permissions.owner_permissions || [];
      case 'MANAGER': return permissions.manager_permissions || [];
      case 'RECEPTIONIST': return permissions.receptionist_permissions || [];
      case 'MEMBER': return permissions.member_permissions || [];
      default: return [];
    }
  }, [permissions]);

  const togglePermission = (permKey) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permKey)
        ? prev.permissions.filter(p => p !== permKey)
        : [...prev.permissions, permKey]
    }));
  };

  const selectAllPermissions = (scope) => {
    const availablePerms = getAvailablePermissions(scope);
    setFormData(prev => ({
      ...prev,
      permissions: Array.from(new Set([...prev.permissions, ...availablePerms.map(p => p.key)]))
    }));
  };

  const clearAllPermissions = () => {
    setFormData(prev => ({ ...prev, permissions: [] }));
  };

  // Grouped permissions for current scope
  const groupedPermissions = useMemo(() => {
    const available = getAvailablePermissions(formData.scope);
    return groupPermissions(available);
  }, [formData.scope, getAvailablePermissions]);

  // Identify unmapped permissions (saved in role but not in current available list)
  const unmappedPermissions = useMemo(() => {
    const availableKeys = getAvailablePermissions(formData.scope).map(p => p.key);
    return formData.permissions.filter(p => !availableKeys.includes(p));
  }, [formData.permissions, formData.scope, getAvailablePermissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="roles-tab">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading font-bold text-white text-xl uppercase tracking-wider">
            Admin Roles
          </h2>
          <p className="text-zinc-500 text-sm mt-1">
            Configure roles and permissions for owners and managers
          </p>
        </div>
        <button
          data-testid="create-role-btn"
          onClick={openCreateDialog}
          className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all duration-200 active:scale-95 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Add Role
        </button>
      </div>

      {/* Roles Table */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/80">
              <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Name</th>
              <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Code</th>
              <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Scope</th>
              <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Permissions</th>
              <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Status</th>
              <th className="text-right p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500">
                  No roles found. Click "Add Role" to create one.
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr 
                  key={role.role_id} 
                  data-testid={`role-row-${role.role_id}`}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-zinc-500" />
                      <span className="text-white font-medium">{role.name}</span>
                      {role.is_system && (
                        <Lock className="w-3 h-3 text-zinc-600" title="System role" />
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-zinc-400 text-sm font-mono">{role.code}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-sm text-xs font-heading uppercase border ${SCOPE_COLORS[role.scope] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                      {role.scope}
                    </span>
                  </td>
                  <td className="p-4 text-zinc-400 text-sm">
                    {role.permissions?.length || 0} permissions
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-sm text-xs font-heading uppercase ${
                      role.is_active 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {role.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        data-testid={`edit-role-${role.role_id}`}
                        onClick={() => openEditDialog(role)}
                        className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!role.is_system && (
                        <button
                          data-testid={`delete-role-${role.role_id}`}
                          onClick={() => setDeleteDialog({ open: true, role })}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Role Form Dialog (Create/Edit) */}
      <Dialog 
        open={createDialog || editDialog.open} 
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialog(false);
            setEditDialog({ open: false, role: null });
          }
        }}
      >
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              {createDialog ? 'Create Role' : 'Edit Role'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              {createDialog ? 'Define a new role with specific permissions' : 'Modify role settings and permissions'}
              {editDialog.role?.is_system && (
                <span className="text-amber-400 block mt-1">
                  Note: This is a system role. Code and scope cannot be changed.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createDialog ? handleCreate : handleUpdate} className="space-y-6">
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Role Name</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., Manager – Read Only"
                      className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Code {createDialog ? '(unique)' : ''}</label>
                    <input
                      type="text"
                      required
                      disabled={!createDialog}
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                      placeholder="e.g., MANAGER_READONLY"
                      className={`w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600 font-mono ${!createDialog ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this role..."
                    rows={2}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600 resize-none"
                  />
                </div>
              </div>
              
              <div className="space-y-4">
                 <div>
                  <label className="block text-zinc-400 text-sm mb-1">Scope</label>
                  {createDialog ? (
                    <Select 
                      value={formData.scope} 
                      onValueChange={(v) => setFormData({ ...formData, scope: v, permissions: [] })}
                    >
                      <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-800 border-zinc-700">
                        <SelectItem value="OWNER">Admin</SelectItem>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="RECEPTIONIST">Receptionist</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <input
                      type="text"
                      disabled
                      value={formData.scope}
                      className="w-full bg-zinc-800/50 border border-zinc-700 text-zinc-500 px-3 py-2 rounded-sm text-sm cursor-not-allowed"
                    />
                  )}
                  <p className="text-zinc-500 text-xs mt-1">
                    Determines which permissions are available.
                  </p>
                </div>
                
                {/* Stats / Selection Info */}
                <div className="bg-zinc-800/50 border border-zinc-800 p-3 rounded-sm">
                   <div className="flex items-center justify-between mb-2">
                     <span className="text-zinc-400 text-xs uppercase">Selected</span>
                     <span className="text-white font-bold">{formData.permissions.length}</span>
                   </div>
                   <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => selectAllPermissions(formData.scope)}
                      className="flex-1 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearAllPermissions}
                      className="flex-1 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 text-white rounded transition-colors"
                    >
                      Clear
                    </button>
                   </div>
                </div>
              </div>
            </div>

            {/* Permissions Section */}
            <div>
              <div className="flex items-center justify-between mb-3 pt-4 border-t border-zinc-800">
                <h3 className="font-heading font-bold text-white uppercase tracking-wider text-sm">
                  Permissions
                </h3>
              </div>

              {/* Unmapped Permissions Warning */}
              {unmappedPermissions.length > 0 && (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/20 p-3 rounded-sm">
                  <div className="flex items-center gap-2 text-amber-400 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-bold">Unmapped Permissions ({unmappedPermissions.length})</span>
                  </div>
                  <p className="text-zinc-400 text-xs mb-2">
                    These permissions are assigned to this role but are not available in the current scope configuration.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {unmappedPermissions.map(p => (
                      <span key={p} className="px-2 py-1 bg-amber-500/20 text-amber-300 text-xs font-mono rounded border border-amber-500/30 flex items-center gap-1">
                        {p}
                        <button 
                          type="button" 
                          onClick={() => togglePermission(p)}
                          className="hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Permissions Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-2">
                {Object.entries(groupedPermissions).map(([group, perms]) => (
                  <div key={group} className="bg-zinc-800/30 border border-zinc-800 rounded-sm overflow-hidden h-fit">
                    <div className="bg-zinc-800/80 px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                      <span className="font-heading text-xs font-bold text-zinc-300 uppercase tracking-wide">
                        {group}
                      </span>
                      <span className="text-xs text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">
                        {perms.filter(p => formData.permissions.includes(p.key)).length}/{perms.length}
                      </span>
                    </div>
                    <div className="p-2 space-y-1">
                      {perms.map((perm) => (
                        <label 
                          key={perm.key} 
                          className={`flex items-start gap-2 cursor-pointer p-1.5 rounded transition-colors group ${
                            formData.permissions.includes(perm.key) 
                              ? 'bg-red-500/10 hover:bg-red-500/20' 
                              : 'hover:bg-zinc-700/30'
                          }`}
                        >
                          <div className="relative flex items-center mt-0.5">
                            <input
                              type="checkbox"
                              checked={formData.permissions.includes(perm.key)}
                              onChange={() => togglePermission(perm.key)}
                              className="peer h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-red-600 focus:ring-red-600 focus:ring-offset-zinc-900"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-tight ${
                              formData.permissions.includes(perm.key) ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-300'
                            }`}>
                              {perm.description}
                            </p>
                            <p className="text-[10px] text-zinc-600 font-mono mt-0.5 truncate group-hover:text-zinc-500">
                              {perm.key}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {Object.keys(groupedPermissions).length === 0 && (
                <div className="text-center py-8 text-zinc-500 bg-zinc-800/20 border border-zinc-800 rounded-sm">
                  No permissions available for this scope.
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 pt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setCreateDialog(false);
                  setEditDialog({ open: false, role: null });
                }}
                className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || formData.permissions.length === 0}
                className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {createDialog ? 'Create Role' : 'Save Changes'}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Role Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, role: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              Delete Role
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Are you sure you want to delete <strong className="text-white">{deleteDialog.role?.name}</strong>? 
              Users with this role will lose these permissions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <button
              onClick={() => setDeleteDialog({ open: false, role: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
