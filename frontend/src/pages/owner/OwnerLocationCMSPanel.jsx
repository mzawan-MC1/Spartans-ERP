import { useEffect, useState } from 'react';
import { cmsAPI, publicAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FileUpload from '@/components/FileUpload';
import { HelpCircle, Image as ImageIcon, Plus, Save, Settings, Trash2 } from 'lucide-react';

export default function OwnerLocationCMSPanel({ locationId }) {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState(null);

  const [faqs, setFaqs] = useState([]);
  const [faqDialog, setFaqDialog] = useState({ open: false, data: null });
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: 'General', sort_order: 0, is_featured: false });

  const [gallery, setGallery] = useState([]);

  const fetchData = async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const [locRes, faqsRes] = await Promise.all([
        publicAPI.getBranch(locationId).catch(() => ({ data: null })),
        cmsAPI.listLocationFaqs(locationId, true).catch(() => ({ data: [] })),
      ]);
      if (locRes.data) {
        setLocation(locRes.data);
        setGallery(locRes.data.gallery_images || []);
      } else {
        setLocation(null);
        setGallery([]);
      }
      setFaqs(faqsRes.data || []);
    } catch (err) {
      toast.error('Failed to load location CMS');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [locationId]);

  const handleSaveGeneral = async () => {
    if (!location) return;
    setSaving(true);
    try {
      await cmsAPI.updateBranchPublic(locationId, {
        public_title: location.public_title,
        public_description: location.public_description,
        map_embed_url: location.map_embed_url,
      });
      await cmsAPI.updateBranchPublic(locationId, { gallery_images: gallery });
      toast.success('Location CMS updated');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const openFaqCreate = () => {
    setFaqDialog({ open: true, data: null });
    setFaqForm({ question: '', answer: '', category: 'General', sort_order: 0, is_featured: false });
  };

  const openFaqEdit = (f) => {
    setFaqDialog({ open: true, data: f });
    setFaqForm({
      question: f.question || '',
      answer: f.answer || '',
      category: f.category || 'General',
      sort_order: f.sort_order ?? 0,
      is_featured: !!f.is_featured,
    });
  };

  const handleSaveFaq = async () => {
    if (!faqForm.question || !faqForm.answer) {
      toast.error('Question and answer are required');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...faqForm, location_id: locationId };
      if (faqDialog.data) {
        await cmsAPI.updateLocationFaq(locationId, faqDialog.data.faq_id, payload);
        toast.success('FAQ updated');
      } else {
        await cmsAPI.createLocationFaq(locationId, payload);
        toast.success('FAQ created');
      }
      setFaqDialog({ open: false, data: null });
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save FAQ');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFaq = async (faqId) => {
    if (!window.confirm('Are you sure you want to delete this FAQ?')) return;
    setSaving(true);
    try {
      await cmsAPI.deleteLocationFaq(locationId, faqId, true);
      toast.success('FAQ deleted');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to delete FAQ');
    } finally {
      setSaving(false);
    }
  };

  const handleAddGalleryImage = () => {
    setGallery([...gallery, { image_path: '', title: '', sort_order: gallery.length, is_active: true }]);
  };

  const handleUpdateGalleryImage = (index, field, value) => {
    const next = [...gallery];
    next[index] = { ...next[index], [field]: value };
    setGallery(next);
  };

  const handleRemoveGalleryImage = (index) => {
    setGallery(gallery.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-bold text-white text-sm uppercase tracking-wider">Location CMS</h2>
          <p className="text-zinc-500 text-sm">Manage public content for {location?.name || 'this location'}</p>
        </div>
        <Button onClick={handleSaveGeneral} disabled={saving || !location} className="bg-red-600 hover:bg-red-700">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="flex border-b border-zinc-800">
        {[
          { id: 'general', label: 'General Info', icon: Settings },
          { id: 'gallery', label: 'Gallery', icon: ImageIcon },
          { id: 'faqs', label: 'FAQs', icon: HelpCircle },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-heading uppercase tracking-wider text-xs transition-colors ${
              activeTab === t.id ? 'border-red-600 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && location && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6 space-y-4">
          <div>
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Public Title</Label>
            <Input
              value={location.public_title || ''}
              onChange={(e) => setLocation({ ...location, public_title: e.target.value })}
              className="mt-2 bg-zinc-950 border-zinc-800 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Public Description</Label>
            <Textarea
              value={location.public_description || ''}
              onChange={(e) => setLocation({ ...location, public_description: e.target.value })}
              className="mt-2 bg-zinc-950 border-zinc-800 text-white min-h-[140px]"
            />
          </div>
          <div>
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Google Maps Embed URL</Label>
            <Input
              value={location.map_embed_url || ''}
              onChange={(e) => setLocation({ ...location, map_embed_url: e.target.value })}
              className="mt-2 bg-zinc-950 border-zinc-800 text-white"
            />
          </div>
        </div>
      )}

      {activeTab === 'gallery' && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-heading uppercase tracking-wider text-sm">Gallery</h3>
              <p className="text-zinc-500 text-sm">Images shown on the public location page.</p>
            </div>
            <Button onClick={handleAddGalleryImage} variant="outline" className="border-zinc-800 text-zinc-300">
              <Plus className="w-4 h-4 mr-2" /> Add Image
            </Button>
          </div>
          {gallery.length === 0 ? (
            <div className="text-zinc-500 text-sm">No gallery images.</div>
          ) : (
            <div className="space-y-4">
              {gallery.map((img, i) => (
                <div key={i} className="border border-zinc-800 rounded-sm bg-zinc-950 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Image</Label>
                        <div className="mt-2">
                          <FileUpload
                            value={img.image_path}
                            onChange={(url) => handleUpdateGalleryImage(i, 'image_path', url)}
                            buttonText={img.image_path ? 'Change Image' : 'Upload Image'}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Title</Label>
                        <Input
                          value={img.title || ''}
                          onChange={(e) => handleUpdateGalleryImage(i, 'title', e.target.value)}
                          className="mt-2 bg-zinc-900 border-zinc-800 text-white"
                        />
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="border-zinc-800 text-zinc-300"
                      onClick={() => handleRemoveGalleryImage(i)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'faqs' && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-heading uppercase tracking-wider text-sm">FAQs</h3>
              <p className="text-zinc-500 text-sm">Branch-specific FAQs.</p>
            </div>
            <Button onClick={openFaqCreate} className="bg-red-600 hover:bg-red-700">
              <Plus className="w-4 h-4 mr-2" /> Add FAQ
            </Button>
          </div>
          {faqs.length === 0 ? (
            <div className="text-zinc-500 text-sm">No FAQs.</div>
          ) : (
            <div className="space-y-3">
              {faqs.map((f) => (
                <div key={f.faq_id} className="border border-zinc-800 rounded-sm p-4 bg-zinc-950">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-white text-sm font-medium">{f.question}</div>
                      <div className="text-zinc-500 text-sm mt-1">{f.answer}</div>
                      <div className="text-zinc-600 text-xs mt-2">{f.category || 'General'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => openFaqEdit(f)}>Edit</Button>
                      <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => handleDeleteFaq(f.faq_id)}>Delete</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Dialog open={faqDialog.open} onOpenChange={(open) => !open && setFaqDialog({ open: false, data: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-wider">{faqDialog.data ? 'Edit FAQ' : 'Add FAQ'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Question</Label>
              <Input value={faqForm.question} onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Answer</Label>
              <Textarea value={faqForm.answer} onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white min-h-[120px]" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={faqForm.category} onChange={(e) => setFaqForm({ ...faqForm, category: e.target.value })} className="bg-zinc-950 border-zinc-800 text-white" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="border-zinc-800 text-zinc-300" onClick={() => setFaqDialog({ open: false, data: null })} disabled={saving}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleSaveFaq} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

