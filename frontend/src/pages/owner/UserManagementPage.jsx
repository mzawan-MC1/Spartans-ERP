import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { userManagementAPI, locationAPI, authAPI, rolesAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import RolesTab from './RolesTab';
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
  Users, 
  UserPlus, 
  Shield, 
  Building2, 
  Search, 
  Eye, 
  Pencil, 
  Key, 
  UserX, 
  UserCheck,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  ShieldCheck,
  Trash2,
  RotateCcw
} from 'lucide-react';

const ROLE_COLORS = {
  OWNER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  OWNER_FULL: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  MANAGER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  LOCATION_MANAGER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  RECEPTIONIST: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
  MEMBER: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  UNKNOWN: 'bg-zinc-800 text-zinc-300 border-zinc-700',
};

const ROLE_LABELS = {
  OWNER: 'Admin',
  LOCATION_MANAGER: 'Manager',
  RECEPTIONIST: 'Receptionist',
  MEMBER: 'Member',
};

export default function UserManagementPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('users');
  const [user, setUser] = useState(null);
  const [myPermissions, setMyPermissions] = useState(null);
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  
  // Admin roles for assignment
  const [availableRoles, setAvailableRoles] = useState([]);

  const resolveUserAssignedRoles = (u) => {
    const ids = Array.isArray(u?.admin_role_ids) ? u.admin_role_ids : [];
    if (ids.length === 0 || availableRoles.length === 0) return { roles: [], hasStale: ids.length > 0 };
    const byId = new Map(availableRoles.map(r => [r.role_id, r]));
    const roles = ids.map(id => byId.get(id)).filter(r => r && r.is_active);
    return { roles, hasStale: ids.length > 0 && roles.length === 0 };
  };

  const pickPrimaryAssignedRole = (roles) => {
    if (!Array.isArray(roles) || roles.length === 0) return null;
    return roles.find(r => !['OWNER_FULL', 'MANAGER_FULL', 'RECEPTIONIST_FULL'].includes(r.code)) || roles[0];
  };
  
  // Filters - initialize from URL params
  const [roleFilter, setRoleFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState(searchParams.get('location_id') || '');
  const [activeFilter, setActiveFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialogs
  const [createDialog, setCreateDialog] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, user: null });
  const [viewDialog, setViewDialog] = useState({ open: false, user: null });
  const [passwordDialog, setPasswordDialog] = useState({ open: false, user: null });
  const [deactivateDialog, setDeactivateDialog] = useState({ open: false, user: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, user: null });
  const [restoreDialog, setRestoreDialog] = useState({ open: false, user: null });
  
  // Form states
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role: 'LOCATION_MANAGER',
    manager_location_ids: [],
    admin_role_ids: [],
    employee: {
      employee_location_id: '',
      employment_type: 'FULL_TIME',
      join_date: '',
      phone: '',
      pay_structure: { type: 'FIXED_SALARY', base_amount: 0, currency: 'AED' },
    },
  });
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const INTERNAL_USER_ROLES = ['OWNER', 'OWNER_FULL', 'LOCATION_MANAGER', 'RECEPTIONIST'];
  const INTERNAL_ROLES_PARAM = INTERNAL_USER_ROLES.join(',');
  const MANAGER_ROLES_PARAM = ['LOCATION_MANAGER', 'RECEPTIONIST'].join(',');
  const isAdminUserType = formData.role === 'OWNER' || formData.role === 'OWNER_FULL';
  const payrollLocationRequired = !isAdminUserType;

  const fetchUsers = useCallback(async (page = 1) => {
    try {
      const params = { page, limit: pagination.limit };
      if (roleFilter === 'admin') params.role = 'OWNER';
      else if (roleFilter === 'manager') params.roles = MANAGER_ROLES_PARAM;
      else params.roles = INTERNAL_ROLES_PARAM;
      if (locationFilter) params.location_id = locationFilter;
      if (activeFilter === 'active') params.is_active = true;
      else if (activeFilter === 'inactive') params.is_active = false;
      else if (activeFilter === 'deleted') params.include_deleted = true;
      if (searchTerm) params.search = searchTerm;
      
      const res = await userManagementAPI.list(params);
      let filteredUsers = res.data.users;
      filteredUsers = filteredUsers.filter(u => INTERNAL_USER_ROLES.includes(u.role));
      
      // Client-side filter for deleted state
      if (activeFilter === 'deleted') {
        filteredUsers = filteredUsers.filter(u => u.deleted_at);
      } else if (activeFilter !== '') {
        filteredUsers = filteredUsers.filter(u => !u.deleted_at);
      }
      
      setUsers(filteredUsers);
      setPagination({
        page: res.data.page,
        limit: res.data.limit,
        total: res.data.total,
        totalPages: res.data.total_pages,
      });
    } catch (err) {
      toast.error('Failed to load users');
    }
  }, [roleFilter, locationFilter, activeFilter, searchTerm, pagination.limit]);

  const fetchData = useCallback(async () => {
    try {
      const [locRes, statsRes, rolesRes] = await Promise.all([
        locationAPI.list(),
        userManagementAPI.getStats().catch(() => ({ data: null })),
        rolesAPI.list().catch(() => ({ data: { roles: [] } })),
      ]);
      setLocations(locRes.data);
      if (statsRes.data) setStats(statsRes.data);
      setAvailableRoles(rolesRes.data.roles || []);
      await fetchUsers(1);
    } catch (err) {
      if (err.response?.status === 401) {
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [fetchUsers, navigate]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await authAPI.getMe();
        setUser(res.data);
        if (res.data.role !== 'OWNER' && res.data.role !== 'OWNER_FULL') {
          navigate('/login', { replace: true });
          return;
        }
      } catch {
        navigate('/login', { replace: true });
        return;
      }
      
      // Seed roles if needed
      try {
        await rolesAPI.seedRoles();
      } catch {
        // Ignore - roles already seeded
      }
      
      fetchData();
    };
    loadUser();
  }, [fetchData, navigate]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user?.role) return;
      if (user.role === 'OWNER') {
        if (active) setMyPermissions(null);
        return;
      }
      if (user.role !== 'OWNER_FULL') {
        if (active) setMyPermissions([]);
        return;
      }
      try {
        const res = await rolesAPI.getMyPermissions();
        if (active) setMyPermissions(res.data?.permissions || []);
      } catch {
        if (active) setMyPermissions([]);
      }
    })();
    return () => { active = false; };
  }, [user?.role]);

  useEffect(() => {
    if (!user?.role) return;
    if (user.role === 'OWNER') return;
    if (user.role !== 'OWNER_FULL') return;
    if (myPermissions == null) return;
    const canUsers = myPermissions.includes('owner.manage_users');
    const canRoles = myPermissions.includes('owner.manage_roles');
    if (!canUsers && canRoles && activeTab !== 'roles') setActiveTab('roles');
    if (canUsers && !canRoles && activeTab !== 'users') setActiveTab('users');
  }, [user?.role, myPermissions, activeTab]);

  useEffect(() => {
    if (!loading) {
      if (activeTab === 'users') fetchUsers(1);
    }
  }, [roleFilter, locationFilter, activeFilter, searchTerm, loading, fetchUsers, activeTab]);

  const getFilteredRoles = (userRole) => {
    const expectedScope = userRole === 'OWNER'
      ? 'OWNER'
      : (userRole === 'RECEPTIONIST' ? 'RECEPTIONIST' : 'MANAGER');
    return availableRoles.filter(r => r.scope === expectedScope && r.is_active);
  };

  const canManageUsers = user?.role === 'OWNER' || (user?.role === 'OWNER_FULL' && Array.isArray(myPermissions) && myPermissions.includes('owner.manage_users'));
  const canManageRoles = user?.role === 'OWNER' || (user?.role === 'OWNER_FULL' && Array.isArray(myPermissions) && myPermissions.includes('owner.manage_roles'));
  const permsLoading = user?.role === 'OWNER_FULL' && myPermissions == null;

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await userManagementAPI.create(formData);
      toast.success('User created successfully');
      setCreateDialog(false);
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        role: 'LOCATION_MANAGER',
        manager_location_ids: [],
        admin_role_ids: [],
        employee: {
          employee_location_id: '',
          employment_type: 'FULL_TIME',
          join_date: '',
          phone: '',
          pay_structure: { type: 'FIXED_SALARY', base_amount: 0, currency: 'AED' },
        },
      });
      fetchUsers(1);
      fetchData(); // Refresh stats
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editDialog.user) return;
    setSubmitting(true);
    try {
      const updateData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
        is_active: formData.is_active,
        admin_role_ids: formData.admin_role_ids,
        employee: formData.employee,
      };
      if (formData.role === 'LOCATION_MANAGER' || formData.role === 'RECEPTIONIST') {
        updateData.manager_location_ids = formData.manager_location_ids;
      }
      await userManagementAPI.update(editDialog.user.user_id, updateData);
      toast.success('User updated successfully');
      setEditDialog({ open: false, user: null });
      fetchUsers(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!passwordDialog.user || !newPassword) return;
    setSubmitting(true);
    try {
      await userManagementAPI.resetPassword(passwordDialog.user.user_id, { new_password: newPassword });
      toast.success('Password reset successfully');
      setPasswordDialog({ open: false, user: null });
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!deactivateDialog.user) return;
    setSubmitting(true);
    try {
      const u = deactivateDialog.user;
      if (u.is_active) {
        await userManagementAPI.deactivate(u.user_id);
        toast.success('User deactivated');
      } else {
        await userManagementAPI.activate(u.user_id);
        toast.success('User activated');
      }
      setDeactivateDialog({ open: false, user: null });
      fetchUsers(pagination.page);
      fetchData(); // Refresh stats
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.user) return;
    setSubmitting(true);
    try {
      await userManagementAPI.delete(deleteDialog.user.user_id);
      toast.success('User deleted');
      setDeleteDialog({ open: false, user: null });
      fetchUsers(pagination.page);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreDialog.user) return;
    setSubmitting(true);
    try {
      await userManagementAPI.restore(restoreDialog.user.user_id);
      toast.success('User restored');
      setRestoreDialog({ open: false, user: null });
      fetchUsers(pagination.page);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Restore failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (u) => {
    const uiRole = u.role === 'OWNER_FULL' ? 'OWNER' : u.role;
    const isAdmin = uiRole === 'OWNER';
    const fallbackLoc = u.employee_location_id || u.location_id || (u.manager_location_ids || [])[0] || locations[0]?.location_id || '';
    const fallbackCurrency = u.employee?.pay_structure?.currency || (isAdmin ? 'AED' : (locations.find(l => l.location_id === fallbackLoc)?.default_currency || 'AED'));
    setFormData({
      first_name: u.first_name || u.name?.split(' ')[0] || '',
      last_name: u.last_name || u.name?.split(' ').slice(1).join(' ') || '',
      email: u.email,
      password: '',
      role: uiRole,
      manager_location_ids: u.manager_location_ids || [],
      admin_role_ids: u.admin_role_ids || [],
      is_active: u.is_active,
      employee: {
        employee_location_id: isAdmin ? '' : (u.employee?.location_id || fallbackLoc),
        employment_type: u.employee?.employment_type || 'FULL_TIME',
        join_date: u.employee?.join_date || '',
        phone: u.employee?.phone || '',
        pay_structure: {
          type: u.employee?.pay_structure?.type || 'FIXED_SALARY',
          base_amount: u.employee?.pay_structure?.base_amount || 0,
          currency: fallbackCurrency,
        },
      },
    });
    setEditDialog({ open: true, user: u });
  };

  const openCreateDialog = () => {
    // Get default manager role
    const defaultManagerRole = availableRoles.find(r => r.code === 'MANAGER_FULL');
    const defaultLoc = locations[0]?.location_id || '';
    const defaultCurrency = locations[0]?.default_currency || 'AED';
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      role: 'LOCATION_MANAGER',
      manager_location_ids: [],
      admin_role_ids: defaultManagerRole ? [defaultManagerRole.role_id] : [],
      employee: {
        employee_location_id: defaultLoc,
        employment_type: 'FULL_TIME',
        join_date: '',
        phone: '',
        pay_structure: { type: 'FIXED_SALARY', base_amount: 0, currency: defaultCurrency },
      },
    });
    setCreateDialog(true);
  };

  const statCards = stats ? (() => {
    const admins = stats.total_owners || 0;
    const managers = (stats.total_managers || 0) + (stats.total_receptionists || 0);
    const total = admins + managers;
    return [
      { label: 'Total Users', value: total, icon: Users, color: 'text-white' },
      { label: 'Admins', value: admins, icon: Shield, color: 'text-amber-400' },
      { label: 'Managers', value: managers, icon: Building2, color: 'text-blue-400' },
    ];
  })() : [];

  if (loading || permsLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div data-testid="user-management-page" className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav user={user} locations={locations} />

      <main className="flex-1 px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-zinc-500 hover:text-white text-sm flex items-center gap-1 mb-2 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Dashboard
            </button>
            <h1 className="font-heading font-extrabold text-white text-4xl sm:text-5xl uppercase tracking-tight">
              Users & Roles
            </h1>
            <p className="text-zinc-500 font-body mt-2 text-base">
              Manage users, assign roles, and configure permissions
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-zinc-800 mb-6">
          {canManageUsers && (
            <button
              data-testid="users-tab-btn"
              onClick={() => setActiveTab('users')}
              className={`pb-3 px-1 font-heading uppercase tracking-wider text-sm transition-colors border-b-2 ${
                activeTab === 'users'
                  ? 'text-red-500 border-red-500'
                  : 'text-zinc-500 hover:text-white border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4" /> Users
              </span>
            </button>
          )}
          {canManageRoles && (
            <button
              data-testid="roles-tab-btn"
              onClick={() => setActiveTab('roles')}
              className={`pb-3 px-1 font-heading uppercase tracking-wider text-sm transition-colors border-b-2 ${
                activeTab === 'roles'
                  ? 'text-red-500 border-red-500'
                  : 'text-zinc-500 hover:text-white border-transparent'
              }`}
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Roles & Permissions
              </span>
            </button>
          )}
        </div>

        {/* Users Tab Content */}
        {activeTab === 'users' && canManageUsers && (
          <>
            {/* Stats Row */}
            {stats && (
              <div data-testid="user-stats-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {statCards.map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-zinc-900/50 border border-zinc-800 p-5 flex flex-col justify-between hover:bg-zinc-900 transition-colors rounded-sm"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-zinc-500 text-xs font-heading uppercase tracking-wider">
                        {stat.label}
                      </span>
                      <stat.icon className={`w-4 h-4 ${stat.color}`} strokeWidth={1.5} />
                    </div>
                    <p className={`font-heading font-extrabold text-3xl ${stat.color}`}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Filters */}
            <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-sm mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 text-zinc-400">
                  <Filter className="w-4 h-4" />
                  <span className="text-sm font-heading uppercase tracking-wider">Filters</span>
                </div>
                
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    data-testid="search-users-input"
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white pl-10 pr-4 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
                
                {/* Role Filter */}
                <Select value={roleFilter || "all"} onValueChange={(v) => setRoleFilter(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="role-filter" className="w-[150px] bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Location Filter */}
                <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="location-filter" className="w-[180px] bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="All Locations" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.location_id} value={loc.location_id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Status Filter */}
                <Select value={activeFilter || "all"} onValueChange={(v) => setActiveFilter(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="status-filter" className="w-[130px] bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectContent>
                </Select>

                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      await userManagementAPI.syncMembers();
                      toast.success('Members synced successfully');
                      fetchUsers(1);
                      fetchData();
                    } catch (err) {
                      toast.error('Sync failed');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all duration-200 flex items-center gap-2 ml-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Sync Members
                </button>
                <button
                  data-testid="create-user-btn"
                  onClick={openCreateDialog}
                  className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all duration-200 active:scale-95 flex items-center gap-2 ml-auto"
                >
                  <UserPlus className="w-4 h-4" strokeWidth={1.5} />
                  Add User
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80">
                      <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Name</th>
                      <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Email</th>
                      <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Role</th>
                      <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Admin Roles</th>
                      <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Locations</th>
                      <th className="text-left p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Status</th>
                      <th className="text-right p-4 font-heading text-xs uppercase tracking-wider text-zinc-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-zinc-500">
                          No users found
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr 
                          key={u.user_id} 
                          data-testid={`user-row-${u.user_id}`}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                        >
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              {u.picture ? (
                                <img 
                                  src={u.picture.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${u.picture}` : u.picture} 
                                  alt="" 
                                  className="w-8 h-8 rounded-full object-cover" 
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm font-bold">
                                  {u.name?.charAt(0)?.toUpperCase() || 'U'}
                                </div>
                              )}
                              <span className="text-white font-medium">{u.name || 'No Name'}</span>
                            </div>
                          </td>
                          <td className="p-4 text-zinc-400 text-sm">{u.email}</td>
                          <td className="p-4">
                            {(() => {
                              const { roles, hasStale } = resolveUserAssignedRoles(u);
                              const primary = pickPrimaryAssignedRole(roles);
                              const badgeKey = primary?.scope || (hasStale ? 'UNKNOWN' : u.role);
                              const label = primary?.name || (hasStale ? 'Role Deleted' : (ROLE_LABELS[u.role] || u.role));
                              return (
                                <span className={`px-2 py-1 rounded-sm text-xs font-heading uppercase border ${ROLE_COLORS[badgeKey] || ROLE_COLORS.UNKNOWN}`}>
                                  {label}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="p-4 text-zinc-400 text-sm">
                            {(() => {
                              const { roles, hasStale } = resolveUserAssignedRoles(u);
                              if (roles.length > 0) {
                                return (
                                  <div className="flex flex-wrap gap-1">
                                    {roles.map((role) => (
                                      <span key={role.role_id} className="px-2 py-0.5 bg-zinc-800 rounded text-xs flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3 text-zinc-500" />
                                        {role.name}
                                      </span>
                                    ))}
                                  </div>
                                );
                              }
                              if (hasStale) return <span className="text-zinc-500 text-xs">Role Deleted</span>;
                              return <span className="text-zinc-600">—</span>;
                            })()}
                          </td>
                          <td className="p-4 text-zinc-400 text-sm">
                            {u.role === 'LOCATION_MANAGER' && u.manager_location_names?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {u.manager_location_names.map((name, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-zinc-800 rounded text-xs">
                                    {name}
                                  </span>
                                ))}
                              </div>
                            ) : u.location_name ? (
                              <span className="px-2 py-0.5 bg-zinc-800 rounded text-xs">{u.location_name}</span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded-sm text-xs font-heading uppercase ${
                              u.deleted_at
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                : u.is_active 
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                  : 'bg-zinc-700/50 text-zinc-500 border border-zinc-600'
                            }`}>
                              {u.deleted_at ? 'Deleted' : u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-2">
                              {u.deleted_at ? (
                                /* Deleted user actions */
                                <button
                                  data-testid={`restore-user-${u.user_id}`}
                                  onClick={() => setRestoreDialog({ open: true, user: u })}
                                  className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 rounded transition-colors"
                                  title="Restore"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              ) : (
                                /* Normal user actions */
                                <>
                                  <button
                                    data-testid={`view-user-${u.user_id}`}
                                    onClick={() => setViewDialog({ open: true, user: u })}
                                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                                    title="View"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  <button
                                    data-testid={`edit-user-${u.user_id}`}
                                    onClick={() => openEditDialog(u)}
                                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                                    title="Edit"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    data-testid={`reset-password-${u.user_id}`}
                                    onClick={() => setPasswordDialog({ open: true, user: u })}
                                    className="p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-zinc-800 rounded transition-colors"
                                    title="Reset Password"
                                  >
                                    <Key className="w-4 h-4" />
                                  </button>
                                  {u.user_id !== user?.user_id && u.role !== 'OWNER' && (
                                    <>
                                      <button
                                        data-testid={`toggle-active-${u.user_id}`}
                                        onClick={() => setDeactivateDialog({ open: true, user: u })}
                                        className={`p-1.5 hover:bg-zinc-800 rounded transition-colors ${
                                          u.is_active ? 'text-zinc-500 hover:text-amber-400' : 'text-zinc-500 hover:text-emerald-400'
                                        }`}
                                        title={u.is_active ? 'Deactivate' : 'Activate'}
                                      >
                                        {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                      </button>
                                      <button
                                        data-testid={`delete-user-${u.user_id}`}
                                        onClick={() => setDeleteDialog({ open: true, user: u })}
                                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                                        title="Delete"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t border-zinc-800">
                  <span className="text-zinc-500 text-sm">
                    Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchUsers(pagination.page - 1)}
                      disabled={pagination.page <= 1}
                      className="p-2 text-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-white text-sm">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      onClick={() => fetchUsers(pagination.page + 1)}
                      disabled={pagination.page >= pagination.totalPages}
                      className="p-2 text-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Roles Tab Content */}
        {activeTab === 'roles' && canManageRoles && <RolesTab />}
      </main>

      {/* Create User Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              Create User
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Add a new owner or manager account with role assignment
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-sm mb-1">User Type</label>
              <Select 
                value={formData.role} 
                onValueChange={(v) => {
                  const defaultRole = availableRoles.find(r => 
                    r.code === (v === 'OWNER' ? 'OWNER_FULL' : (v === 'RECEPTIONIST' ? 'RECEPTIONIST_FULL' : 'MANAGER_FULL'))
                  );
                  const nextEmployeeLoc = v === 'OWNER'
                    ? ''
                    : ((formData.manager_location_ids || [])[0] || locations[0]?.location_id || '');
                  setFormData({ 
                    ...formData, 
                    role: v, 
                    manager_location_ids: [],
                    admin_role_ids: defaultRole ? [defaultRole.role_id] : [],
                    employee: {
                      ...(formData.employee || {}),
                      employee_location_id: nextEmployeeLoc,
                    },
                  });
                }}
              >
                <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  <SelectItem value="OWNER">Admin</SelectItem>
                  <SelectItem value="LOCATION_MANAGER">Manager</SelectItem>
                  <SelectItem value="RECEPTIONIST">Receptionist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-sm mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Email</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
              />
            </div>
            
            {/* Admin Roles Selection */}
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Admin Roles</label>
              <div className="space-y-2 max-h-32 overflow-y-auto bg-zinc-800/50 border border-zinc-700 rounded-sm p-2">
                {getFilteredRoles(formData.role).map((role) => (
                  <label key={role.role_id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-700/50 p-1 rounded">
                    <input
                      type="checkbox"
                      checked={formData.admin_role_ids.includes(role.role_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setFormData({ ...formData, admin_role_ids: [...formData.admin_role_ids, role.role_id] });
                        } else {
                          setFormData({ ...formData, admin_role_ids: formData.admin_role_ids.filter(id => id !== role.role_id) });
                        }
                      }}
                      className="rounded border-zinc-600 bg-zinc-700 text-red-600 focus:ring-red-600"
                    />
                    <span className="text-white text-sm">{role.name}</span>
                    <span className="text-zinc-500 text-xs">({role.permissions?.length || 0} permissions)</span>
                  </label>
                ))}
              </div>
            </div>

            {(formData.role === 'LOCATION_MANAGER' || formData.role === 'RECEPTIONIST') && (
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Assigned Locations</label>
                <div className="space-y-2 max-h-32 overflow-y-auto bg-zinc-800/50 border border-zinc-700 rounded-sm p-2">
                  {locations.map((loc) => (
                    <label key={loc.location_id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-700/50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={formData.manager_location_ids.includes(loc.location_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const nextIds = [...formData.manager_location_ids, loc.location_id];
                            const nextEmployeeLoc = nextIds.includes(formData.employee.employee_location_id) ? formData.employee.employee_location_id : (nextIds[0] || '');
                            setFormData({ ...formData, manager_location_ids: nextIds, employee: { ...formData.employee, employee_location_id: nextEmployeeLoc } });
                          } else {
                            const nextIds = formData.manager_location_ids.filter(id => id !== loc.location_id);
                            const nextEmployeeLoc = nextIds.includes(formData.employee.employee_location_id) ? formData.employee.employee_location_id : (nextIds[0] || '');
                            setFormData({ ...formData, manager_location_ids: nextIds, employee: { ...formData.employee, employee_location_id: nextEmployeeLoc } });
                          }
                        }}
                        className="rounded border-zinc-600 bg-zinc-700 text-red-600 focus:ring-red-600"
                      />
                      <span className="text-white text-sm">{loc.name}</span>
                    </label>
                  ))}
                </div>
                {formData.manager_location_ids.length === 0 && (
                  <p className="text-amber-400 text-xs mt-1">Select at least one location</p>
                )}
              </div>
            )}

            <div className="border-t border-zinc-800 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-zinc-300 text-sm font-heading uppercase tracking-wider">Employee / Payroll</label>
                <span className="text-zinc-500 text-xs">Required for HR/Payroll</span>
              </div>

              {!isAdminUserType && (
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Payroll Location</label>
                  <Select
                    value={formData.employee.employee_location_id || ''}
                    onValueChange={(v) => setFormData({ ...formData, employee: { ...formData.employee, employee_location_id: v } })}
                    disabled={formData.manager_location_ids.length === 0}
                  >
                    <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder={formData.manager_location_ids.length ? 'Select location' : 'Select assigned locations first'} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {formData.manager_location_ids.map((lid) => {
                        const loc = locations.find((l) => l.location_id === lid);
                        if (!loc) return null;
                        return <SelectItem key={loc.location_id} value={loc.location_id}>{loc.name}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Base Salary</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.employee.pay_structure.base_amount}
                    onChange={(e) => setFormData({ ...formData, employee: { ...formData.employee, pay_structure: { ...formData.employee.pay_structure, base_amount: parseFloat(e.target.value) || 0 } } })}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Currency</label>
                  <Select
                    value={formData.employee.pay_structure.currency || 'AED'}
                    onValueChange={(v) => setFormData({ ...formData, employee: { ...formData.employee, pay_structure: { ...formData.employee.pay_structure, currency: v } } })}
                  >
                    <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {['AED', 'USD', 'SAR'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 pt-4">
              <button
                type="button"
                onClick={() => setCreateDialog(false)}
                className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || ((formData.role === 'LOCATION_MANAGER' || formData.role === 'RECEPTIONIST') && formData.manager_location_ids.length === 0) || (payrollLocationRequired && !formData.employee.employee_location_id)}
                className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Create User
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => !open && setEditDialog({ open: false, user: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              Edit User
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Update user information and role assignments
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-sm mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Email</label>
              <input
                type="email"
                disabled
                value={formData.email}
                className="w-full bg-zinc-800/50 border border-zinc-700 text-zinc-500 px-3 py-2 rounded-sm text-sm cursor-not-allowed"
              />
            </div>
            {(() => {
              const isEditingPrimaryOwner = editDialog.user?.role === 'OWNER' && editDialog.user?.user_id && editDialog.user?.user_id === user?.user_id;
              return (
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">User Type</label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => {
                      const isAdmin = v === 'OWNER';
                      const defaultRole = availableRoles.find(r => r.code === (isAdmin ? 'OWNER_FULL' : (v === 'RECEPTIONIST' ? 'RECEPTIONIST_FULL' : 'MANAGER_FULL')));
                      const nextEmployeeLoc = isAdmin
                        ? ''
                        : (formData.employee?.employee_location_id || formData.employee_location_id || formData.location_id || (formData.manager_location_ids || [])[0] || locations[0]?.location_id || '');
                      setFormData({
                        ...formData,
                        role: v,
                        manager_location_ids: isAdmin ? [] : (formData.manager_location_ids || []),
                        admin_role_ids: defaultRole ? [defaultRole.role_id] : [],
                        employee: {
                          ...(formData.employee || {}),
                          employee_location_id: nextEmployeeLoc,
                        },
                      });
                    }}
                    disabled={isEditingPrimaryOwner}
                  >
                    <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="OWNER">Admin</SelectItem>
                      <SelectItem value="LOCATION_MANAGER">Manager</SelectItem>
                      <SelectItem value="RECEPTIONIST">Receptionist</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}
            
            {/* Admin Roles Selection (only for OWNER and MANAGER) */}
            {true && (
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Admin Roles</label>
                <div className="space-y-2 max-h-32 overflow-y-auto bg-zinc-800/50 border border-zinc-700 rounded-sm p-2">
                  {getFilteredRoles(formData.role).map((role) => (
                    <label key={role.role_id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-700/50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={formData.admin_role_ids.includes(role.role_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, admin_role_ids: [...formData.admin_role_ids, role.role_id] });
                          } else {
                            setFormData({ ...formData, admin_role_ids: formData.admin_role_ids.filter(id => id !== role.role_id) });
                          }
                        }}
                        className="rounded border-zinc-600 bg-zinc-700 text-red-600 focus:ring-red-600"
                      />
                      <span className="text-white text-sm">{role.name}</span>
                      <span className="text-zinc-500 text-xs">({role.permissions?.length || 0} permissions)</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {(formData.role === 'LOCATION_MANAGER' || formData.role === 'RECEPTIONIST') && (
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Assigned Locations</label>
                <div className="space-y-2 max-h-32 overflow-y-auto bg-zinc-800/50 border border-zinc-700 rounded-sm p-2">
                  {locations.map((loc) => (
                    <label key={loc.location_id} className="flex items-center gap-2 cursor-pointer hover:bg-zinc-700/50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={formData.manager_location_ids.includes(loc.location_id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const nextIds = [...formData.manager_location_ids, loc.location_id];
                            const nextEmployeeLoc = nextIds.includes(formData.employee.employee_location_id) ? formData.employee.employee_location_id : (nextIds[0] || '');
                            setFormData({ ...formData, manager_location_ids: nextIds, employee: { ...formData.employee, employee_location_id: nextEmployeeLoc } });
                          } else {
                            const nextIds = formData.manager_location_ids.filter(id => id !== loc.location_id);
                            const nextEmployeeLoc = nextIds.includes(formData.employee.employee_location_id) ? formData.employee.employee_location_id : (nextIds[0] || '');
                            setFormData({ ...formData, manager_location_ids: nextIds, employee: { ...formData.employee, employee_location_id: nextEmployeeLoc } });
                          }
                        }}
                        className="rounded border-zinc-600 bg-zinc-700 text-red-600 focus:ring-red-600"
                      />
                      <span className="text-white text-sm">{loc.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-zinc-800 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-zinc-300 text-sm font-heading uppercase tracking-wider">Employee / Payroll</label>
                <span className="text-zinc-500 text-xs">Required for HR/Payroll</span>
              </div>

              {!isAdminUserType && (
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Payroll Location</label>
                  <Select
                    value={formData.employee.employee_location_id || ''}
                    onValueChange={(v) => setFormData({ ...formData, employee: { ...formData.employee, employee_location_id: v } })}
                    disabled={formData.manager_location_ids.length === 0}
                  >
                    <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder={formData.manager_location_ids.length ? 'Select location' : 'Select assigned locations first'} />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {formData.manager_location_ids.map((lid) => {
                        const loc = locations.find((l) => l.location_id === lid);
                        if (!loc) return null;
                        return <SelectItem key={loc.location_id} value={loc.location_id}>{loc.name}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Base Salary</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.employee.pay_structure.base_amount}
                    onChange={(e) => setFormData({ ...formData, employee: { ...formData.employee, pay_structure: { ...formData.employee.pay_structure, base_amount: parseFloat(e.target.value) || 0 } } })}
                    className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Currency</label>
                  <Select
                    value={formData.employee.pay_structure.currency || 'AED'}
                    onValueChange={(v) => setFormData({ ...formData, employee: { ...formData.employee, pay_structure: { ...formData.employee.pay_structure, currency: v } } })}
                  >
                    <SelectTrigger className="w-full bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {['AED', 'USD', 'SAR'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 pt-4">
              <button
                type="button"
                onClick={() => setEditDialog({ open: false, user: null })}
                className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || (payrollLocationRequired && !formData.employee.employee_location_id) || ((formData.role === 'LOCATION_MANAGER' || formData.role === 'RECEPTIONIST') && formData.manager_location_ids.length === 0)}
                className="bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View User Dialog */}
      <Dialog open={viewDialog.open} onOpenChange={(open) => !open && setViewDialog({ open: false, user: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              User Details
            </DialogTitle>
          </DialogHeader>
          {viewDialog.user && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {viewDialog.user.picture ? (
                  <img 
                    src={viewDialog.user.picture.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${viewDialog.user.picture}` : viewDialog.user.picture} 
                    alt="" 
                    className="w-16 h-16 rounded-full object-cover" 
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-2xl font-bold">
                    {viewDialog.user.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}
                <div>
                  <h3 className="text-white font-bold text-lg">{viewDialog.user.name}</h3>
                  <p className="text-zinc-400 text-sm">{viewDialog.user.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-zinc-500 text-xs uppercase">User Type</span>
                  <p className="text-white">{ROLE_LABELS[viewDialog.user.role] || viewDialog.user.role}</p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs uppercase">Status</span>
                  <p className={viewDialog.user.is_active ? 'text-emerald-400' : 'text-red-400'}>
                    {viewDialog.user.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>
              <div>
                <span className="text-zinc-500 text-xs uppercase">Admin Roles</span>
                {(() => {
                  const { roles, hasStale } = resolveUserAssignedRoles(viewDialog.user);
                  if (roles.length > 0) {
                    return (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {roles.map((role) => (
                          <span key={role.role_id} className="px-2 py-1 bg-zinc-800 rounded text-sm text-white flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-zinc-500" />
                            {role.name}
                          </span>
                        ))}
                      </div>
                    );
                  }
                  if (hasStale) return <p className="text-zinc-500">Role Deleted</p>;
                  return <p className="text-zinc-600">—</p>;
                })()}
              </div>
              {viewDialog.user.manager_location_names?.length > 0 && (
                <div>
                  <span className="text-zinc-500 text-xs uppercase">Assigned Locations</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {viewDialog.user.manager_location_names.map((name, i) => (
                      <span key={i} className="px-2 py-1 bg-zinc-800 rounded text-sm text-white">
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
                <div>
                  <span className="text-zinc-500 text-xs uppercase">Created</span>
                  <p className="text-zinc-400 text-sm">
                    {viewDialog.user.created_at ? new Date(viewDialog.user.created_at).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500 text-xs uppercase">Updated</span>
                  <p className="text-zinc-400 text-sm">
                    {viewDialog.user.updated_at ? new Date(viewDialog.user.updated_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setViewDialog({ open: false, user: null }); openEditDialog(viewDialog.user); }}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all flex items-center justify-center gap-2"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => { setViewDialog({ open: false, user: null }); setPasswordDialog({ open: true, user: viewDialog.user }); }}
                  className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all flex items-center justify-center gap-2"
                >
                  <Key className="w-4 h-4" /> Reset Password
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={passwordDialog.open} onOpenChange={(open) => { if (!open) { setPasswordDialog({ open: false, user: null }); setNewPassword(''); } }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              Reset Password
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Set a new password for <strong className="text-white">{passwordDialog.user?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-sm mb-1">New Password</label>
              <input
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm focus:outline-none focus:border-red-600"
                placeholder="Minimum 6 characters"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <button
              onClick={() => { setPasswordDialog({ open: false, user: null }); setNewPassword(''); }}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleResetPassword}
              disabled={submitting || newPassword.length < 6}
              className="bg-amber-600 hover:bg-amber-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Reset Password
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate/Activate Dialog */}
      <Dialog open={deactivateDialog.open} onOpenChange={(open) => !open && setDeactivateDialog({ open: false, user: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              {deactivateDialog.user?.is_active ? 'Deactivate User' : 'Activate User'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              {deactivateDialog.user?.is_active 
                ? <>Are you sure you want to deactivate <strong className="text-white">{deactivateDialog.user?.name}</strong>? They won't be able to log in.</>
                : <>Reactivate <strong className="text-white">{deactivateDialog.user?.name}</strong> to allow them to log in again.</>
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <button
              onClick={() => setDeactivateDialog({ open: false, user: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleToggleActive}
              disabled={submitting}
              className={`font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2 ${
                deactivateDialog.user?.is_active 
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {deactivateDialog.user?.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, user: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              Delete User
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Are you sure you want to delete <strong className="text-white">{deleteDialog.user?.name}</strong>? 
              This will remove them from active lists but they can be restored later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <button
              onClick={() => setDeleteDialog({ open: false, user: null })}
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

      {/* Restore User Dialog */}
      <Dialog open={restoreDialog.open} onOpenChange={(open) => !open && setRestoreDialog({ open: false, user: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              Restore User
            </DialogTitle>
            <DialogDescription className="text-zinc-400 font-body">
              Restore <strong className="text-white">{restoreDialog.user?.name}</strong> to make them active again?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <button
              onClick={() => setRestoreDialog({ open: false, user: null })}
              className="bg-transparent border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleRestore}
              disabled={submitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-heading font-bold uppercase tracking-wider px-4 py-2 rounded-sm text-sm transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Restore
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
