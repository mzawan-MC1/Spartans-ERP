import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Users, Plus, Search, Filter, ToggleLeft, ToggleRight, Trash2, RotateCcw, Eye, Edit, AlertTriangle, CreditCard, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ActionTooltip } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { membersAPI, alertsAPI } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media';
import ManagerLayout from '@/components/ManagerLayout';

export default function MembersPage() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [counts, setCounts] = useState({ active: 0, inactive: 0, deleted: 0, all: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [alerts, setAlerts] = useState(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const locationId = user.location_id;

  const fetchMembers = useCallback(async () => {
    if (!locationId) return;
    try {
      setLoading(true);
      const params = { status: statusFilter };
      if (searchTerm) params.search = searchTerm;
      const res = await membersAPI.list(locationId, params);
      setMembers(res.data.members || []);
      if (res.data.counts) {
        setCounts(res.data.counts);
      }
    } catch (err) {
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
    } catch (err) {
      console.error('Failed to load alerts', err);
    }
  }, [locationId]);

  useEffect(() => {
    fetchMembers();
    fetchAlerts();
  }, [fetchMembers, fetchAlerts]);

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
    } catch (err) {
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
    } catch (err) {
      toast.error('Failed to delete member');
    }
  };

  const handleRestore = async (member) => {
    try {
      await membersAPI.restore(member.member_id, locationId);
      toast.success('Member restored');
      fetchMembers();
    } catch (err) {
      toast.error('Failed to restore member');
    }
  };

  return (
    <ManagerLayout>
      <div className="p-6 sm:p-8 lg:p-10 max-w-[1400px] space-y-6" data-testid="members-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Users className="h-6 w-6 text-orange-500" />
              Members
            </h1>
            <p className="text-zinc-400 text-sm mt-1">Manage member registrations and memberships</p>
          </div>
          <div className="flex gap-2">
          {user.role === 'LOCATION_MANAGER' && (
            <Button 
              variant="outline"
              onClick={() => navigate('/manager/members/import')}
              data-testid="import-members-btn"
            >
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          )}
          <Button 
            onClick={() => navigate('/manager/members/new')}
            className="bg-orange-500 hover:bg-orange-600"
            data-testid="add-member-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>
        </div>

        {/* Alerts Cards */}
        {alerts && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-yellow-500/10 border-yellow-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold text-yellow-500">{alerts.expiring_soon.count}</p>
                  <p className="text-sm text-yellow-400">Expiring in 7 days</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-red-500/10 border-red-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-2xl font-bold text-red-500">{alerts.expired.count}</p>
                  <p className="text-sm text-red-400">Expired Memberships</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-blue-500/10 border-blue-500/20">
              <CardContent className="p-4 flex items-center gap-3">
                <CreditCard className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold text-blue-500">{alerts.payments_due.count}</p>
                  <p className="text-sm text-blue-400">Payments Due</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search by name, email, phone, or member ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-zinc-800 border-zinc-700"
                  data-testid="member-search-input"
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
          </CardContent>
        </Card>

        {/* Members List */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-zinc-500">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">No members found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left p-4 text-zinc-400 font-medium">Member</th>
                      <th className="text-left p-4 text-zinc-400 font-medium">Contact</th>
                      <th className="text-left p-4 text-zinc-400 font-medium">Member ID</th>
                      <th className="text-left p-4 text-zinc-400 font-medium">Status</th>
                      <th className="text-right p-4 text-zinc-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr 
                        key={member.member_id} 
                        className="border-b border-zinc-800 hover:bg-zinc-800/50"
                        data-testid={`member-row-${member.member_id}`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {member.profile_photo_url ? (
                              <img 
                                src={resolveMediaUrl(member.profile_photo_url)} 
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
                          <p className="text-zinc-300">{member.email || 'No email'}</p>
                          <p className="text-sm text-zinc-500">{member.phone || 'No phone'}</p>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className="font-mono mb-1 block w-fit">
                            {member.member_no}
                          </Badge>
                          {member.active_membership && (
                            <span className="text-xs text-zinc-400 capitalize">
                              {member.active_membership.type.replace(/_/g, ' ')}
                            </span>
                          )}
                          {(member.plan_name || member.active_membership?.payment_plan_name) && (
                            <span className="text-xs text-zinc-500 block">
                              {member.is_active ? 'Plan:' : 'Last plan:'} {member.plan_name || member.active_membership?.payment_plan_name}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            {member.deleted_at ? (
                              <Badge variant="destructive" className="w-fit">Deleted</Badge>
                            ) : (
                              <>
                                {(member.membership_status || member.active_membership?.status) ? (
                                  <Badge className={`w-fit ${
                                    ((member.membership_status || member.active_membership?.status) || '').toLowerCase() === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                    ['past_due', 'expired', 'cancelled', 'failed', 'declined', 'renewal_required'].includes(((member.membership_status || member.active_membership?.status) || '').toLowerCase()) ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                  }`}>
                                    {((member.membership_status || member.active_membership?.status) || '').toUpperCase()}
                                  </Badge>
                                ) : (
                                  <Badge className="bg-zinc-700 text-zinc-400 w-fit">No Membership</Badge>
                                )}
                                <Badge variant="outline" className={`w-fit ${member.is_active ? 'text-zinc-300 border-zinc-700' : 'text-zinc-500 border-zinc-800'}`}>
                                  Account: {member.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                              </>
                            )}
                            
                            {member.active_membership?.payment_status && (
                                <Badge variant="outline" className={`w-fit text-[10px] h-4 px-1.5 mt-1 ${
                                  ['completed', 'paid', 'approved'].includes(member.active_membership.payment_status) ? 'text-green-400 border-green-500/30' :
                                  member.active_membership.payment_status === 'pending' ? 'text-yellow-400 border-yellow-500/30' :
                                  'text-red-400 border-red-500/30'
                                }`}>
                                  Pay: {member.active_membership.payment_status}
                                </Badge>
                              )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-end gap-2">
                            {member.deleted_at ? (
                              <ActionTooltip label="Restore Member">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRestore(member)}
                                  data-testid={`restore-member-${member.member_id}`}
                                >
                                  <RotateCcw className="h-4 w-4 mr-1" />
                                  Restore
                                </Button>
                              </ActionTooltip>
                            ) : (
                              <>
                                <ActionTooltip label="View Details">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => navigate(`/manager/members/${member.member_id}`)}
                                    data-testid={`view-member-${member.member_id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </ActionTooltip>
                                <ActionTooltip label="Edit Member">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => navigate(`/manager/members/${member.member_id}/edit`)}
                                    data-testid={`edit-member-${member.member_id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </ActionTooltip>
                                <ActionTooltip label={member.is_active ? "Deactivate Member" : "Activate Member"}>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleToggleStatus(member)}
                                    data-testid={`toggle-member-${member.member_id}`}
                                  >
                                    {member.is_active ? (
                                      <ToggleRight className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <ToggleLeft className="h-4 w-4 text-zinc-500" />
                                    )}
                                  </Button>
                                </ActionTooltip>
                                <ActionTooltip label="Delete Member">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-red-500 hover:text-red-400"
                                    onClick={() => {
                                      setSelectedMember(member);
                                      setShowDeleteDialog(true);
                                    }}
                                    data-testid={`delete-member-${member.member_id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
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
          </CardContent>
        </Card>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle>Delete Member</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {selectedMember?.full_name}? This action can be undone by restoring the member.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                data-testid="confirm-delete-member"
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ManagerLayout>
  );
}
