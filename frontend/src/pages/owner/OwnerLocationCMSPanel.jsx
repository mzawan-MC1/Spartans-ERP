import { useEffect, useState } from 'react';
import { cmsAPI, locationAPI } from '@/lib/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import FileUpload from '@/components/FileUpload';
import LanguageTabs from '@/components/cms/LanguageTabs';
import { CMS_LANGS } from '@/lib/cmsLanguages';
import { FileVideo, HelpCircle, Image as ImageIcon, Plus, Save, Settings, Star, Trash2 } from 'lucide-react';

export default function OwnerLocationCMSPanel({ locationId }) {
  const [activeTab, setActiveTab] = useState('general');
  const [generalLang, setGeneralLang] = useState('en');
  const [videoLang, setVideoLang] = useState('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState(null);

  const [faqs, setFaqs] = useState([]);
  const [faqDialog, setFaqDialog] = useState({ open: false, data: null });
  const [faqLang, setFaqLang] = useState('en');
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', translations: { ar: { question: '', answer: '' }, fr: { question: '', answer: '' }, ru: { question: '', answer: '' } }, category: 'General', sort_order: 0, is_featured: false });

  const [gallery, setGallery] = useState([]);

  const fetchData = async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const [locRes, faqsRes] = await Promise.all([
        locationAPI.get(locationId).catch(() => ({ data: null })),
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
      const translations = {};
      for (const l of CMS_LANGS) {
        if (l.code === 'en') continue;
        const t = location?.translations?.[l.code] || {};
        translations[l.code] = {
          public_title: t.public_title ?? '',
          public_description: t.public_description ?? '',
          video_section_title: t.video_section_title ?? '',
        };
      }
      await cmsAPI.updateBranchPublic(locationId, {
        public_title: location.public_title,
        public_description: location.public_description,
        video_section_title: location.video_section_title,
        map_embed_url: location.map_embed_url,
        location_video_path: location.location_video_path,
        location_video_thumbnail_path: location.location_video_thumbnail_path,
        location_video_autoplay: location.location_video_autoplay,
        google_place_id: location.google_place_id,
        google_location_name: location.google_location_name,
        google_reviews_enabled: location.google_reviews_enabled,
        translations,
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
    setFaqLang('en');
    setFaqForm({ question: '', answer: '', translations: { ar: { question: '', answer: '' }, fr: { question: '', answer: '' }, ru: { question: '', answer: '' } }, category: 'General', sort_order: 0, is_featured: false });
  };

  const openFaqEdit = (f) => {
    setFaqDialog({ open: true, data: f });
    setFaqLang('en');
    const baseTranslations = { ar: { question: '', answer: '' }, fr: { question: '', answer: '' }, ru: { question: '', answer: '' } };
    setFaqForm({
      question: f.question || '',
      answer: f.answer || '',
      translations: { ...baseTranslations, ...(f.translations || {}) },
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
          { id: 'video', label: 'Video', icon: FileVideo },
          { id: 'reviews', label: 'Reviews', icon: Star },
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
            <div className="flex items-center justify-between gap-4">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Public Title</Label>
              <LanguageTabs
                value={generalLang}
                onValueChange={setGeneralLang}
                statusByLang={CMS_LANGS.reduce((acc, l) => {
                  const title = l.code === 'en' ? (location?.public_title || '') : (location?.translations?.[l.code]?.public_title || '');
                  const desc = l.code === 'en' ? (location?.public_description || '') : (location?.translations?.[l.code]?.public_description || '');
                  const titleOk = typeof title === 'string' && title.trim().length > 0;
                  const descOk = typeof desc === 'string' && desc.trim().length > 0;
                  if (!titleOk && !descOk) return acc;
                  acc[l.code] = titleOk && descOk ? 'complete' : 'incomplete';
                  return acc;
                }, {})}
              />
            </div>
            <Input
              dir={generalLang === 'ar' ? 'rtl' : 'ltr'}
              value={generalLang === 'en' ? (location.public_title || '') : (location.translations?.[generalLang]?.public_title || '')}
              onChange={(e) => {
                const v = e.target.value;
                if (generalLang === 'en') {
                  setLocation({ ...location, public_title: v });
                  return;
                }
                const merged = { ...(location.translations || {}) };
                merged[generalLang] = { ...(merged[generalLang] || {}), public_title: v };
                setLocation({ ...location, translations: merged });
              }}
              className="mt-2 bg-zinc-950 border-zinc-800 text-white"
            />
          </div>
          <div>
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Public Description</Label>
            <Textarea
              dir={generalLang === 'ar' ? 'rtl' : 'ltr'}
              value={generalLang === 'en' ? (location.public_description || '') : (location.translations?.[generalLang]?.public_description || '')}
              onChange={(e) => {
                const v = e.target.value;
                if (generalLang === 'en') {
                  setLocation({ ...location, public_description: v });
                  return;
                }
                const merged = { ...(location.translations || {}) };
                merged[generalLang] = { ...(merged[generalLang] || {}), public_description: v };
                setLocation({ ...location, translations: merged });
              }}
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

      {activeTab === 'video' && location && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6 space-y-6">
          <div>
            <div className="flex items-center justify-between gap-4">
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Section Title</Label>
              <LanguageTabs
                value={videoLang}
                onValueChange={setVideoLang}
                statusByLang={CMS_LANGS.reduce((acc, l) => {
                  const title = l.code === 'en' ? (location?.video_section_title || '') : (location?.translations?.[l.code]?.video_section_title || '');
                  const ok = typeof title === 'string' && title.trim().length > 0;
                  if (!ok) return acc;
                  acc[l.code] = 'complete';
                  return acc;
                }, {})}
              />
            </div>
            <Input
              dir={videoLang === 'ar' ? 'rtl' : 'ltr'}
              value={videoLang === 'en' ? (location.video_section_title || '') : (location.translations?.[videoLang]?.video_section_title || '')}
              onChange={(e) => {
                const v = e.target.value;
                if (videoLang === 'en') {
                  setLocation({ ...location, video_section_title: v });
                  return;
                }
                const merged = { ...(location.translations || {}) };
                merged[videoLang] = { ...(merged[videoLang] || {}), video_section_title: v };
                setLocation({ ...location, translations: merged });
              }}
              className="mt-2 bg-zinc-950 border-zinc-800 text-white"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Video File (Max 10MB)</Label>
              <FileUpload
                value={location.location_video_path || ''}
                onChange={(v) => setLocation({ ...location, location_video_path: v })}
                accept="video/*"
                maxSize={10}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Video Thumbnail</Label>
              <FileUpload
                value={location.location_video_thumbnail_path || ''}
                onChange={(v) => setLocation({ ...location, location_video_thumbnail_path: v })}
                accept="image/*"
                maxSize={10}
                className="mt-2"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border border-zinc-800 rounded-sm p-4 bg-zinc-950">
            <div>
              <p className="text-white font-heading font-semibold">Auto-play</p>
              <p className="text-zinc-500 text-sm">If enabled, video auto-plays muted.</p>
            </div>
            <Switch
              checked={!!location.location_video_autoplay}
              onCheckedChange={(checked) => setLocation({ ...location, location_video_autoplay: checked })}
            />
          </div>
        </div>
      )}

      {activeTab === 'reviews' && location && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-sm p-6 space-y-6">
          <div className="flex items-center justify-between gap-4 border border-zinc-800 rounded-sm p-4 bg-zinc-950">
            <div>
              <p className="text-white font-heading font-semibold">Enable Reviews</p>
              <p className="text-zinc-500 text-sm">Shows Google reviews on this location’s public page.</p>
            </div>
            <Switch
              checked={!!location.google_reviews_enabled}
              onCheckedChange={(checked) => setLocation({ ...location, google_reviews_enabled: checked })}
            />
          </div>

          <div>
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Google Place ID</Label>
            <Input
              value={location.google_place_id || ''}
              onChange={(e) => setLocation({ ...location, google_place_id: e.target.value })}
              className="mt-2 bg-zinc-950 border-zinc-800 text-white"
              placeholder="ChIJ..."
            />
          </div>

          <div>
            <Label className="text-zinc-400 font-heading uppercase tracking-wider text-xs">Google Business/Location Name</Label>
            <Input
              value={location.google_location_name || ''}
              onChange={(e) => setLocation({ ...location, google_location_name: e.target.value })}
              className="mt-2 bg-zinc-950 border-zinc-800 text-white"
              placeholder="Spartans - Sharjah (Maliha)"
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
              <div className="flex items-center justify-between gap-4">
                <Label>Question</Label>
                <LanguageTabs
                  value={faqLang}
                  onValueChange={setFaqLang}
                  statusByLang={CMS_LANGS.reduce((acc, l) => {
                    const q = l.code === 'en' ? (faqForm?.question || '') : (faqForm?.translations?.[l.code]?.question || '');
                    const a = l.code === 'en' ? (faqForm?.answer || '') : (faqForm?.translations?.[l.code]?.answer || '');
                    const qOk = typeof q === 'string' && q.trim().length > 0;
                    const aOk = typeof a === 'string' && a.trim().length > 0;
                    if (!qOk && !aOk) return acc;
                    acc[l.code] = qOk && aOk ? 'complete' : 'incomplete';
                    return acc;
                  }, {})}
                />
              </div>
              <Input
                dir={faqLang === 'ar' ? 'rtl' : 'ltr'}
                value={faqLang === 'en' ? faqForm.question : (faqForm.translations?.[faqLang]?.question || '')}
                onChange={(e) => {
                  const v = e.target.value;
                  if (faqLang === 'en') {
                    setFaqForm({ ...faqForm, question: v });
                    return;
                  }
                  const merged = { ...(faqForm.translations || {}) };
                  merged[faqLang] = { ...(merged[faqLang] || {}), question: v };
                  setFaqForm({ ...faqForm, translations: merged });
                }}
                className="bg-zinc-950 border-zinc-800 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Answer</Label>
              <Textarea
                dir={faqLang === 'ar' ? 'rtl' : 'ltr'}
                value={faqLang === 'en' ? faqForm.answer : (faqForm.translations?.[faqLang]?.answer || '')}
                onChange={(e) => {
                  const v = e.target.value;
                  if (faqLang === 'en') {
                    setFaqForm({ ...faqForm, answer: v });
                    return;
                  }
                  const merged = { ...(faqForm.translations || {}) };
                  merged[faqLang] = { ...(merged[faqLang] || {}), answer: v };
                  setFaqForm({ ...faqForm, translations: merged });
                }}
                className="bg-zinc-950 border-zinc-800 text-white min-h-[120px]"
              />
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

