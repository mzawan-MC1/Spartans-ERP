import { useState, useEffect, useCallback } from 'react';
import { agreementsAPI } from '@/lib/api';
import ManagerLayout from '@/components/ManagerLayout';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, FileSignature, Eye, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { ActionTooltip } from '@/components/ui/tooltip';

export default function AgreementsPage() {
  const [agreements, setAgreements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [dialog, setDialog] = useState({ open: false, data: null });
  const [preview, setPreview] = useState({ open: false, data: null });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', version: '1.0', content_html: '' });
  const [locationId, setLocationId] = useState(null);
  const [locationName, setLocationName] = useState('');

  const fetchAgreements = useCallback(async (locId) => {
    if (!locId) return;
    try {
      setLoading(true);
      const res = await agreementsAPI.list(locId, !showAll);
      setAgreements(res.data.agreements || []);
    } catch {
      toast.error('Failed to load agreements');
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    if (locationId) fetchAgreements(locationId);
  }, [locationId, fetchAgreements]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      if (dialog.data) {
        await agreementsAPI.update(dialog.data.agreement_id, form, locationId);
        toast.success('Agreement updated');
      } else {
        await agreementsAPI.create(form, locationId);
        toast.success('Agreement created');
      }
      setDialog({ open: false, data: null });
      fetchAgreements(locationId);
    } catch {
      toast.error('Failed to save agreement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agreementId) => {
    if (!confirm('Are you sure you want to delete this agreement?')) return;
    try {
      await agreementsAPI.delete(agreementId, locationId);
      toast.success('Agreement deleted');
      setAgreements(agreements.filter(a => a.agreement_id !== agreementId));
    } catch {
      toast.error('Failed to delete agreement');
    }
  };

  const handleToggleActive = async (agreement) => {
    try {
      await agreementsAPI.update(agreement.agreement_id, { is_active: !agreement.is_active }, locationId);
      toast.success(agreement.is_active ? 'Agreement deactivated' : 'Agreement activated');
      fetchAgreements(locationId);
    } catch {
      toast.error('Failed to update agreement');
    }
  };

  const openCreate = () => {
    setForm({ title: '', version: '1.0', content_html: '' });
    setDialog({ open: true, data: null });
  };

  const openEdit = (agreement) => {
    setForm({
      title: agreement.title,
      version: agreement.version || '1.0',
      content_html: agreement.content_html || '',
    });
    setDialog({ open: true, data: agreement });
  };

  return (
    <ManagerLayout activePage="agreements">
      {({ location }) => {
        if (location?.location_id && location.location_id !== locationId) {
          setTimeout(() => {
            setLocationId(location.location_id);
            setLocationName(location.name || '');
          }, 0);
        }

        return (
          <div className="px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full" data-testid="agreements-page">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="font-heading font-extrabold text-white text-2xl uppercase tracking-tight">
                  Agreements
                </h1>
                <p className="text-zinc-500 font-body mt-1 text-sm">
                  Manage membership agreement templates for {locationName || 'this location'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="text-zinc-400 hover:text-white text-sm flex items-center gap-1.5 transition-colors"
                  data-testid="toggle-show-all"
                >
                  {showAll ? <ToggleRight className="w-5 h-5 text-red-500" /> : <ToggleLeft className="w-5 h-5" />}
                  {showAll ? 'All' : 'Active only'}
                </button>
                <Button
                  onClick={openCreate}
                  className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide text-sm"
                  data-testid="add-agreement-btn"
                >
                  <Plus className="w-4 h-4 mr-2" /> Add Agreement
                </Button>
              </div>
            </div>

            {/* List */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              </div>
            ) : agreements.length === 0 ? (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <FileSignature className="w-12 h-12 text-zinc-700 mb-4" />
                  <p className="text-zinc-500 text-sm">No agreements yet</p>
                  <p className="text-zinc-600 text-xs mt-1">Create your first agreement template for members to sign</p>
                  <Button
                    onClick={openCreate}
                    className="mt-4 bg-red-600 hover:bg-red-700"
                    data-testid="empty-add-agreement-btn"
                  >
                    <Plus className="w-4 h-4 mr-2" /> Create Agreement
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agreements.map((agreement) => (
                  <Card
                    key={agreement.agreement_id}
                    className={`bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors ${!agreement.is_active ? 'opacity-60' : ''}`}
                    data-testid={`agreement-card-${agreement.agreement_id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-white font-heading text-base uppercase tracking-wide truncate">
                            {agreement.title}
                          </CardTitle>
                          <p className="text-zinc-500 text-xs mt-1">Version {agreement.version}</p>
                        </div>
                        <Badge className={agreement.is_active
                          ? 'bg-green-500/20 text-green-400 border-green-500/30'
                          : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                        }>
                          {agreement.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div
                        className="text-zinc-400 text-xs line-clamp-3 mb-4 prose-sm"
                        dangerouslySetInnerHTML={{ __html: agreement.content_html || '<em>No content</em>' }}
                      />
                      <div className="text-zinc-600 text-xs mb-4">
                        Updated: {(agreement.updated_at || agreement.created_at || '').slice(0, 10)}
                      </div>
                      <div className="flex items-center gap-2 pt-3 border-t border-zinc-800">
                        <ActionTooltip label="Preview">
                          <button
                            onClick={() => setPreview({ open: true, data: agreement })}
                            className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-zinc-800 transition-colors"
                            data-testid={`preview-agreement-${agreement.agreement_id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </ActionTooltip>
                        <ActionTooltip label="Edit">
                          <button
                            onClick={() => openEdit(agreement)}
                            className="text-zinc-400 hover:text-white p-1.5 rounded hover:bg-zinc-800 transition-colors"
                            data-testid={`edit-agreement-${agreement.agreement_id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        </ActionTooltip>
                        <ActionTooltip label={agreement.is_active ? 'Deactivate' : 'Activate'}>
                          <button
                            onClick={() => handleToggleActive(agreement)}
                            className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${agreement.is_active ? 'text-green-400' : 'text-zinc-600'}`}
                            data-testid={`toggle-agreement-${agreement.agreement_id}`}
                          >
                            {agreement.is_active ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                        </ActionTooltip>
                        <ActionTooltip label="Delete">
                          <button
                            onClick={() => handleDelete(agreement.agreement_id)}
                            className="text-zinc-400 hover:text-red-500 p-1.5 rounded hover:bg-zinc-800 transition-colors ml-auto"
                            data-testid={`delete-agreement-${agreement.agreement_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </ActionTooltip>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Create/Edit Dialog */}
            <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, data: null })}>
              <DialogContent className="bg-zinc-900 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading text-white uppercase">
                    {dialog.data ? 'Edit Agreement' : 'New Agreement'}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-sm mb-2">Title *</label>
                      <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                        placeholder="e.g. Standard Membership Agreement"
                        data-testid="agreement-title-input"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-sm mb-2">Version</label>
                      <input
                        type="text"
                        value={form.version}
                        onChange={(e) => setForm({ ...form, version: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                        placeholder="e.g. 1.0"
                        data-testid="agreement-version-input"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-2">Agreement Content (HTML)</label>
                    <div className="bg-white text-black rounded-sm" data-testid="agreement-editor">
                      <ReactQuill
                        theme="snow"
                        value={form.content_html}
                        onChange={(value) => setForm({ ...form, content_html: value })}
                        style={{ minHeight: '250px', color: 'black' }}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <button
                    onClick={() => setDialog({ open: false, data: null })}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50"
                    data-testid="save-agreement-btn"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {dialog.data ? 'Update' : 'Create'}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={preview.open} onOpenChange={(open) => !open && setPreview({ open: false, data: null })}>
              <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading text-white uppercase">
                    {preview.data?.title} (v{preview.data?.version})
                  </DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <div
                    className="prose prose-sm prose-invert max-w-none text-zinc-300"
                    dangerouslySetInnerHTML={{ __html: preview.data?.content_html || '<em>No content</em>' }}
                  />
                </div>
              </DialogContent>
            </Dialog>
          </div>
        );
      }}
    </ManagerLayout>
  );
}
