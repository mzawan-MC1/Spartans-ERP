import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Search, Filter, Eye, CheckCircle, XCircle, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { paymentsAPI } from '@/lib/api';
import ManagerLayout from '@/components/ManagerLayout';
import { ActionTooltip } from '@/components/ui/tooltip';

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog state
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [updateDialog, setUpdateDialog] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const locationId = user.location_id;

  const fetchPayments = useCallback(async () => {
    if (!locationId) return;
    try {
      setLoading(true);
      const params = {};
      
      // If a combined status filter is selected, we fetch all and filter client side
      // since the backend only accepts exact string match for 'status'
      if (statusFilter === 'paid') {
        params.status = 'paid';
      } else if (statusFilter === 'pending') {
        params.status = 'pending';
      } else if (statusFilter === 'refunded') {
        params.status = 'refunded';
      } else if (statusFilter === 'cancelled') {
        params.status = 'cancelled';
      }
      
      const res = await paymentsAPI.list(locationId, params);
      let data = res.data.payments || [];
      
      // Handle complex client side status filtering
      if (statusFilter === 'failed') {
        data = data.filter(p => ['failed', 'declined'].includes(p.status));
      } else if (statusFilter === 'paid') {
        // Just in case backend returns approved/completed
        const allRes = await paymentsAPI.list(locationId, {});
        data = (allRes.data.payments || []).filter(p => ['paid', 'approved', 'completed'].includes(p.status));
      }
      
      if (searchTerm) {
        data = data.filter(p => 
          (p.member_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (p.payment_id || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
      }
      setPayments(data);
    } catch (err) {
      toast.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [locationId, statusFilter, searchTerm]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const openUpdateDialog = (payment) => {
    setSelectedPayment(payment);
    setNewStatus(payment.status || 'pending');
    setNotes(payment.notes || '');
    setUpdateDialog(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedPayment) return;
    
    // Enforce lock rule in UI
    if (selectedPayment.status !== 'pending' && newStatus !== selectedPayment.status) {
      toast.error('Cannot change status of a finalized payment');
      return;
    }
    
    // Enforce reason rule in UI
    if (['declined', 'failed'].includes(newStatus) && (!notes || !notes.trim())) {
      toast.error('Internal Notes / Reason is required for declined or failed payments');
      return;
    }

    try {
      setSubmitting(true);
      await paymentsAPI.updateStatus(selectedPayment.payment_id, {
        status: newStatus,
        notes: notes
      }, locationId);
      
      toast.success(`Payment marked as ${newStatus}`);
      setUpdateDialog(false);
      fetchPayments();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update payment status');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'paid':
      case 'approved':
      case 'completed':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'failed':
      case 'declined':
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'refunded':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30';
    }
  };

  return (
    <ManagerLayout>
      <div className="p-6 sm:p-8 lg:p-10 max-w-[1400px] space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white font-heading tracking-tight uppercase">Payments</h1>
            <p className="text-zinc-400 text-sm mt-1">Review and manage member payments</p>
          </div>
        </div>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="border-b border-zinc-800/50 pb-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search by member or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-zinc-950 border-zinc-800"
                />
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="h-4 w-4 text-zinc-500" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] bg-zinc-950 border-zinc-800">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid / Approved</SelectItem>
                      <SelectItem value="failed">Failed / Declined</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-zinc-500">Loading payments...</div>
            ) : payments.length === 0 ? (
              <div className="p-8 text-center text-zinc-500">No payments found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-950/50 border-b border-zinc-800">
                    <tr>
                      <th className="text-left p-4 text-zinc-400 font-medium">Payment ID / Date</th>
                      <th className="text-left p-4 text-zinc-400 font-medium">Member</th>
                      <th className="text-left p-4 text-zinc-400 font-medium">Amount</th>
                      <th className="text-left p-4 text-zinc-400 font-medium">Method</th>
                      <th className="text-left p-4 text-zinc-400 font-medium">Status</th>
                      <th className="text-right p-4 text-zinc-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.payment_id} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                        <td className="p-4">
                          <p className="font-mono text-xs text-zinc-300">{p.payment_id.slice(-8)}</p>
                          <p className="text-zinc-500 text-xs mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-white font-medium">{p.member_name || 'Unknown'}</p>
                          {p.notes && <p className="text-xs text-zinc-500 mt-1 italic max-w-[200px] truncate">{p.notes}</p>}
                        </td>
                        <td className="p-4">
                          <p className="text-white font-medium">{p.amount} {p.currency}</p>
                        </td>
                        <td className="p-4">
                          <Badge variant="outline" className="capitalize">{p.method}</Badge>
                        </td>
                        <td className="p-4">
                          <Badge className={getStatusColor(p.status)}>
                            {p.status || 'unknown'}
                          </Badge>
                        </td>
                        <td className="p-4 text-right">
                          <Button size="sm" variant="outline" onClick={() => openUpdateDialog(p)}>
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Update Status Dialog */}
        <Dialog open={updateDialog} onOpenChange={setUpdateDialog}>
          <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
            <DialogHeader>
              <DialogTitle>Review Payment</DialogTitle>
            </DialogHeader>
            {selectedPayment && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4 text-sm mb-2 bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <div>
                    <span className="text-zinc-500 block text-xs">Member</span>
                    <span className="text-white">{selectedPayment.member_name}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-xs">Amount</span>
                    <span className="text-white font-bold">{selectedPayment.amount} {selectedPayment.currency}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-xs">Method</span>
                    <span className="text-white capitalize">{selectedPayment.method}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-xs">Date</span>
                    <span className="text-white">{new Date(selectedPayment.created_at).toLocaleString()}</span>
                  </div>
                </div>

                {/* Receipt Section */}
                {(selectedPayment.receipt_url || selectedPayment.receipt_info) && (
                  <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 space-y-2">
                    <h4 className="text-xs uppercase tracking-wider font-heading text-zinc-500 mb-2">Uploaded Receipt / Proof</h4>
                    
                    {selectedPayment.receipt_info && (
                      <p className="text-sm text-zinc-300 mb-3">{selectedPayment.receipt_info}</p>
                    )}
                    
                    {selectedPayment.receipt_url ? (
                      <div className="flex items-center gap-3">
                          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-2 flex items-center gap-2">
                            <Eye className="h-4 w-4 text-zinc-500" />
                            <span className="text-sm text-zinc-300 truncate">
                              {selectedPayment.receipt_url.split('/').pop()}
                            </span>
                          </div>
                          <ActionTooltip label="View Receipt">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="shrink-0"
                              onClick={() => {
                                const url = selectedPayment.receipt_url.startsWith('/') 
                                  ? `${process.env.REACT_APP_BACKEND_URL}${selectedPayment.receipt_url}` 
                                  : selectedPayment.receipt_url;
                                window.open(url, '_blank');
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </ActionTooltip>
                        </div>
                    ) : null}
                  </div>
                )}
                {(!selectedPayment.receipt_url && !selectedPayment.receipt_info) && (
                  <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800/50 text-center">
                    <p className="text-sm text-zinc-500 italic">No receipt or proof uploaded</p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm text-zinc-400">Update Status</label>
                  <Select value={newStatus} onValueChange={setNewStatus} disabled={selectedPayment.status !== 'pending'}>
                    <SelectTrigger className="w-full bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="declined">Declined</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm text-zinc-400">
                    Internal Notes / Reason {['declined', 'failed'].includes(newStatus) && <span className="text-red-500">*</span>}
                  </label>
                  <Input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., Confirmed via bank transfer, Declined due to mismatch..."
                    className="bg-zinc-800 border-zinc-700"
                    disabled={selectedPayment.status !== 'pending'}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setUpdateDialog(false)} disabled={submitting}>Cancel</Button>
              {selectedPayment?.status === 'pending' && (
                <Button onClick={handleUpdateStatus} disabled={submitting} className="bg-red-600 hover:bg-red-700 text-white">
                  {submitting ? 'Saving...' : 'Save Update'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ManagerLayout>
  );
}
