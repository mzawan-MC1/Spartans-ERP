import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import TopNav from '@/components/TopNav';
import { locationAPI, membersAPI, authAPI, alertsAPI } from '@/lib/api';
import { Users, Search, Upload, Eye, Edit, Trash2, RotateCcw, ToggleLeft, ToggleRight, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActionTooltip } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 
export default function OwnerMembersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);

  const [members, setMembers] = useState([]);
  const [counts, setCounts] = useState({ active: 0, inactive: 0, deleted: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [alerts, setAlerts] = useState(null);

  const locationId = currentLocation?.location_id || '';

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, locRes] = await Promise.all([authAPI.getMe(), locationAPI.list()]);
        setUser(meRes.data);
        setLocations(locRes.data || []);

        const qp = searchParams.get('location_id');
        const initial = (locRes.data || []).find(l => l.location_id === qp) || (locRes.data || [])[0] || null;
        setCurrentLocation(initial);
      } catch {
        navigate('/login', { replace: true });
      }
    };
    load();
  }, [navigate, searchParams]);

  useEffect(() => {
    if (!currentLocation) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('location_id', currentLocation.location_id);
      return next;
    }, { replace: true });
  }, [currentLocation, setSearchParams]);

  const fetchMembers = useCallback(async () => {
    if (!locationId) return;
    try {
      setLoading(true);
      const params = { status: statusFilter };
      if (searchTerm) params.search = searchTerm;
      const res = await membersAPI.list(locationId, params);
      setMembers(res.data.members || []);
      if (res.data.counts) setCounts(res.data.counts);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [locationId, statusFilter, searchTerm]);

  const fetchAlerts = useCallback(async () => {
    if (!locationId) return;
    try {
      const res = await alertsAPI.get(locationId);
      setAlerts(res.data);
    } catch {}
  }, [locationId]);

  useEffect(() => {
    fetchMembers();
    fetchAlerts();
  }, [fetchMembers, fetchAlerts]);

  const handleLocationSwitch = (loc) => {
    setCurrentLocation(loc);
  };

  const handleToggleStatus = async (member) => {
    try {
      if (member.is_active) {
        await membersAPI.deactivate(member.member_id, locationId);
        toast.success('Member deactivated');
      } else {
        await membersAPI.activate(member.member_id, locationId);
        toast.success('Member activated');
      }
      fetchMembers();
    } catch {
      toast.error('Failed to update member status');
    }
  };

  const handleDelete = async () => {
    if (!selectedMember) return;
    try {
      await membersAPI.delete(selectedMember.member_id, locationId);
      toast.success('Member deleted');
      setShowDeleteDialog(false);
      setSelectedMember(null);
      fetchMembers();
    } catch {
      toast.error('Failed to delete member');
    }
  };

  const handleRestore = async (member) => {
    try {
      await membersAPI.restore(member.member_id, locationId);
      toast.success('Member restored');
      fetchMembers();
    } catch {
      toast.error('Failed to restore member');
    }
  };

  const alertsCards = useMemo(() => {
    if (!alerts) return null;
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Expiring in 7 days</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{alerts?.expiring_soon?.count ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Expired Memberships</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{alerts?.expired?.count ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Payments Due</CardTitle>
            <AlertTriangle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{alerts?.payments_due?.count ?? 0}</div>
          </CardContent>
        </Card>
      </div>
    );
  }, [alerts]);

  return (
    <div className="min-h-screen bg-[#09090b]">
      <TopNav user={user} locations={locations} currentLocation={currentLocation} onLocationSwitch={handleLocationSwitch} />
      <div className="p-6 sm:p-8 lg:p-10 max-w-[1400px] space-y-6" data-testid="owner-members-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users className="h-6 w-6 text-orange-500" />
              Members
            </h1>
            <p className="text-zinc-400 text-sm mt-1">All branches (select a location from the top)</p>
          </div>
          <div className="flex gap-2">
            <ActionTooltip label={locationId ? 'Add Member' : 'Select a branch first'}>
              <span>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={!locationId}
                  onClick={() => locationId && navigate(`/owner/members/new?location_id=${encodeURIComponent(locationId)}`)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </span>
            </ActionTooltip>

            <ActionTooltip label={locationId ? 'Import CSV' : 'Select a branch first'}>
              <span>
                <Button
                  variant="outline"
                  disabled={!locationId}
                  onClick={() => locationId && navigate(`/owner/members/import?location_id=${encodeURIComponent(locationId)}`)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import CSV
                </Button>
              </span>
            </ActionTooltip>
          </div>
        </div>

        {alertsCards}

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400 h-4 w-4" />
              <Input
                placeholder="Search by name, email, phone, or member ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-zinc-950 border-zinc-800 text-white placeholder:text-zinc-500"
                data-testid="search-members"
              />
            </div>

            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
              <TabsList className="bg-zinc-800">
                <TabsTrigger value="active" data-testid="filter-active">Active ({counts.active})</TabsTrigger>
                <TabsTrigger value="inactive" data-testid="filter-inactive">Inactive ({counts.inactive})</TabsTrigger>
                <TabsTrigger value="deleted" data-testid="filter-deleted">Deleted ({counts.deleted})</TabsTrigger>
                <TabsTrigger value="all" data-testid="filter-all">All ({counts.all})</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-zinc-400">Loading members...</div>
          ) : members.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">No members found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-950/50 border-b border-zinc-800">
                  <tr>
                    <th className="text-left p-4 text-zinc-400 font-medium">Member</th>
                    <th className="text-left p-4 text-zinc-400 font-medium">Contact</th>
                    <th className="text-left p-4 text-zinc-400 font-medium">Member ID</th>
                    <th className="text-left p-4 text-zinc-400 font-medium">Status</th>
                    <th className="text-right p-4 text-zinc-400 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.member_id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {member.profile_photo_url ? (
                            <img
                              src={member.profile_photo_url.startsWith('/') ? `${process.env.REACT_APP_BACKEND_URL}${member.profile_photo_url}` : member.profile_photo_url}
                              alt={member.full_name}
                              className="w-10 h-10 rounded-full object-cover border border-zinc-700"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                              <span className="text-zinc-400 font-medium">
                                {member.full_name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-white">{member.full_name}</p>
                            {member.gender && <p className="text-sm text-zinc-500 capitalize">{member.gender}</p>}
                            {!member.gender && <p className="text-sm text-zinc-500">N/A</p>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-white">{member.email || 'N/A'}</p>
                        <p className="text-zinc-500">{member.phone || 'N/A'}</p>
                      </td>
                      <td className="p-4">
                        <Badge variant="outline" className="font-mono">{member.member_no || member.member_id}</Badge>
                        {(member.plan_name || member.active_membership?.payment_plan_name) && (
                          <div className="text-xs text-zinc-500 mt-1">
                            {member.is_active ? 'Plan:' : 'Last plan:'} {member.plan_name || member.active_membership?.payment_plan_name}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          {(member.membership_status || member.active_membership?.status) ? (
                            <Badge className={`w-fit ${
                              ((member.membership_status || member.active_membership?.status) || '').toLowerCase() === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                              ['past_due', 'expired', 'cancelled', 'failed', 'declined', 'renewal_required'].includes(((member.membership_status || member.active_membership?.status) || '').toLowerCase()) ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                              'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                            }`}>
                              {((member.membership_status || member.active_membership?.status) || '').toUpperCase()}
                            </Badge>
                          ) : (
                            <Badge className="bg-zinc-700/50 text-zinc-400 border-zinc-600 w-fit">No Membership</Badge>
                          )}
                          <Badge variant="outline" className={`w-fit ${member.is_active ? 'text-zinc-300 border-zinc-700' : 'text-zinc-500 border-zinc-800'}`}>
                            Account: {member.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          {member.active_membership?.payment_status && (
                            <Badge variant="outline" className={`w-fit text-[10px] h-4 px-1.5 mt-1 ${
                              ['completed', 'paid', 'approved'].includes((member.active_membership.payment_status || '').toLowerCase()) ? 'text-green-400 border-green-500/30' :
                              (member.active_membership.payment_status || '').toLowerCase() === 'pending' ? 'text-yellow-400 border-yellow-500/30' :
                              'text-red-400 border-red-500/30'
                            }`}>
                              Pay: {member.active_membership.payment_status}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <ActionTooltip label="View">
                            <Button size="icon" variant="ghost" onClick={() => navigate(`/owner/members/${member.member_id}?location_id=${locationId}`)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </ActionTooltip>
                          {!member.deleted_at && (
                            <ActionTooltip label="Edit">
                              <Button size="icon" variant="ghost" onClick={() => navigate(`/owner/members/${member.member_id}/edit?location_id=${locationId}`)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            </ActionTooltip>
                          )}
                          <ActionTooltip label={member.is_active ? 'Deactivate' : 'Activate'}>
                            <Button size="icon" variant="ghost" onClick={() => handleToggleStatus(member)}>
                              {member.is_active ? <ToggleRight className="h-4 w-4 text-green-500" /> : <ToggleLeft className="h-4 w-4 text-zinc-500" />}
                            </Button>
                          </ActionTooltip>
                          {!member.deleted_at ? (
                            <ActionTooltip label="Delete">
                              <Button size="icon" variant="ghost" onClick={() => { setSelectedMember(member); setShowDeleteDialog(true); }}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </ActionTooltip>
                          ) : (
                            <ActionTooltip label="Restore">
                              <Button size="icon" variant="ghost" onClick={() => handleRestore(member)}>
                                <RotateCcw className="h-4 w-4 text-blue-500" />
                              </Button>
                            </ActionTooltip>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle>Delete Member</DialogTitle>
              <DialogDescription>
                This will soft-delete the member. You can restore later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
