import { useCallback, useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import { categoryAPI, disciplineRequestsAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function DisciplineRequestsPage() {
  return (
    <ManagerLayout activePage="discipline-requests">
      {({ location }) => <DisciplineRequestsContent location={location} />}
    </ManagerLayout>
  );
}

function DisciplineRequestsContent({ location }) {
  const locationId = location?.location_id;
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statusFilter, setStatusFilter] = useState('submitted');
  const [decisionDialog, setDecisionDialog] = useState({ open: false, request: null, action: null });
  const [decisionNote, setDecisionNote] = useState('');
  const [acting, setActing] = useState(false);

  const categoryNameById = useMemo(() => {
    const m = new Map();
    for (const c of categories || []) {
      if (c?.category_id) m.set(c.category_id, c.name || c.category_id);
    }
    return m;
  }, [categories]);

  const loadData = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const [reqRes, catRes] = await Promise.all([
        disciplineRequestsAPI.list(locationId, statusFilter ? { status: statusFilter } : {}),
        categoryAPI.list(locationId, { include_deleted: true }).catch(() => ({ data: [] })),
      ]);
      setRequests(reqRes.data?.requests || []);
      setCategories(Array.isArray(catRes.data) ? catRes.data : (catRes.data?.categories || []));
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [locationId, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const openDecision = (req, action) => {
    setDecisionNote('');
    setDecisionDialog({ open: true, request: req, action });
  };

  const submitDecision = async () => {
    const req = decisionDialog.request;
    if (!req) return;
    setActing(true);
    try {
      await disciplineRequestsAPI.act(req.request_id, { action: decisionDialog.action, decision_note: decisionNote }, locationId);
      toast.success(decisionDialog.action === 'approve' ? 'Request approved' : 'Request rejected');
      setDecisionDialog({ open: false, request: null, action: null });
      loadData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update request');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1200px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading font-extrabold text-white text-4xl uppercase tracking-tight">Discipline Requests</h1>
          <p className="text-zinc-500 font-body mt-1 text-base">Approve or reject supervisor schedule/program requests</p>
        </div>
        <div className="flex items-center gap-2">
          {['submitted', 'approved', 'rejected'].map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              className={statusFilter === s ? 'bg-red-600 hover:bg-red-700' : 'border-zinc-800 text-zinc-300'}
              onClick={() => setStatusFilter(s)}
            >
              {s.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : requests.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-sm p-10 text-center text-zinc-500">
          No requests found.
        </div>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Type</th>
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Discipline</th>
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Created</th>
                <th className="text-left p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Status</th>
                <th className="text-right p-4 text-zinc-500 font-heading uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.request_id} className="border-b border-zinc-800/50">
                  <td className="p-4 text-white text-sm">{r.request_type}</td>
                  <td className="p-4 text-zinc-300 text-sm">{categoryNameById.get(r.category_id) || r.category_id || '—'}</td>
                  <td className="p-4 text-zinc-400 text-sm">{(r.created_at || '').slice(0, 10)}</td>
                  <td className="p-4">
                    <Badge className={
                      r.status === 'approved' ? 'bg-green-500/20 text-green-400 border-0' :
                      r.status === 'rejected' ? 'bg-red-500/20 text-red-400 border-0' :
                      'bg-yellow-500/20 text-yellow-400 border-0'
                    }>
                      {(r.status || 'submitted').toUpperCase()}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    {r.status === 'submitted' ? (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => openDecision(r, 'reject')}>Reject</Button>
                        <Button className="bg-red-600 hover:bg-red-700" onClick={() => openDecision(r, 'approve')}>Approve</Button>
                      </div>
                    ) : (
                      <span className="text-zinc-600 text-sm">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={decisionDialog.open} onOpenChange={(open) => !open && setDecisionDialog({ open: false, request: null, action: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase tracking-wider">
              {decisionDialog.action === 'approve' ? 'Approve Request' : 'Reject Request'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div className="text-sm text-zinc-400">Decision note (optional)</div>
            <Input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} className="bg-zinc-950 border-zinc-800 text-white" />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => setDecisionDialog({ open: false, request: null, action: null })} disabled={acting}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={submitDecision} disabled={acting}>
              {acting ? 'Saving...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

