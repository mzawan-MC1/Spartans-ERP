import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerLayout from '@/components/ManagerLayout';
import { cmsAPI, locationAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Settings, Save, MapPin, Image as ImageIcon, FileVideo, Plus, Trash2, GripVertical, HelpCircle, Pencil, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import FileUpload from '@/components/FileUpload';
import LanguageTabs from '@/components/cms/LanguageTabs';
import { CMS_LANGS } from '@/lib/cmsLanguages';

export default function LocationSettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [generalLang, setGeneralLang] = useState('en');
  const [videoLang, setVideoLang] = useState('en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState(null);
  
  // FAQs
  const [faqs, setFaqs] = useState([]);
  const [faqDialog, setFaqDialog] = useState({ open: false, data: null });
  const [faqLang, setFaqLang] = useState('en');
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', translations: { ar: { question: '', answer: '' }, fr: { question: '', answer: '' }, ru: { question: '', answer: '' } }, category: 'General', sort_order: 0, is_featured: false });

  // Gallery
  const [gallery, setGallery] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      const user = JSON.parse(userStr);
      
      const [locRes, faqsRes] = await Promise.all([
        locationAPI.get(user.location_id).catch(() => ({ data: null })),
        cmsAPI.listLocationFaqs(user.location_id, true).catch(() => ({ data: [] }))
      ]);

      if (locRes.data) {
        setLocation(locRes.data);
        setGallery(locRes.data.gallery_images || []);
      }
      setFaqs(faqsRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load location settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGeneral = async () => {
    try {
      setSaving(true);
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
      
      // Save General info (title, desc, map)
      await cmsAPI.updateBranchPublic(location.location_id, {
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
      
      // Save Gallery separately since it uses ownerAPI under the hood for some legacy compat,
      // but let's just make sure we are correctly updating the gallery array
      await cmsAPI.updateBranchPublic(location.location_id, {
        gallery_images: gallery
      });
      
      toast.success('Location settings updated successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // FAQ Handlers
  const handleSaveFaq = async () => {
    try {
      if (!faqForm.question || !faqForm.answer) {
        return toast.error('Question and answer are required');
      }
      
      // Auto-attach location_id for managers
      const payload = { ...faqForm, location_id: location.location_id };
      
      if (faqDialog.data) {
        await cmsAPI.updateLocationFaq(location.location_id, faqDialog.data.faq_id, payload);
        toast.success('FAQ updated');
      } else {
        await cmsAPI.createLocationFaq(location.location_id, payload);
        toast.success('FAQ created');
      }
      setFaqDialog({ open: false, data: null });
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save FAQ');
    }
  };

  const handleDeleteFaq = async (faq_id) => {
    if (!window.confirm('Are you sure you want to delete this FAQ?')) return;
    try {
      await cmsAPI.deleteLocationFaq(location.location_id, faq_id, true);
      toast.success('FAQ deleted');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete FAQ');
    }
  };

  // Gallery Handlers
  const handleAddGalleryImage = () => {
    setGallery([...gallery, { image_path: '', title: '', sort_order: gallery.length, is_active: true }]);
  };

  const handleUpdateGalleryImage = (index, field, value) => {
    const newGallery = [...gallery];
    newGallery[index][field] = value;
    setGallery(newGallery);
  };

  const handleRemoveGalleryImage = (index) => {
    const newGallery = gallery.filter((_, i) => i !== index);
    setGallery(newGallery);
  };

  if (loading) {
    return (
      <ManagerLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
        </div>
      </ManagerLayout>
    );
  }

  return (
    <ManagerLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Location CMS</h1>
            <p className="text-zinc-400 mt-1">Manage public content for {location?.name}</p>
          </div>
          <Button onClick={handleSaveGeneral} disabled={saving} className="bg-red-600 hover:bg-red-700">
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 mb-6">
          {[
            { id: 'general', label: 'General Info', icon: Settings },
            { id: 'video', label: 'Video', icon: FileVideo },
            { id: 'reviews', label: 'Reviews', icon: Star },
            { id: 'gallery', label: 'Gallery', icon: ImageIcon },
            { id: 'faqs', label: 'FAQs', icon: HelpCircle },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium transition-colors ${
                activeTab === tab.id 
                  ? 'border-red-600 text-red-500' 
                  : 'border-transparent text-zinc-400 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'general' && location && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6 space-y-6">
              <h2 className="text-lg font-medium text-white mb-4">Public Information</h2>
              
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <Label>Public Title</Label>
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
                    onChange={e => {
                      const v = e.target.value;
                      if (generalLang === 'en') {
                        setLocation({ ...location, public_title: v });
                        return;
                      }
                      const merged = { ...(location.translations || {}) };
                      merged[generalLang] = { ...(merged[generalLang] || {}), public_title: v };
                      setLocation({ ...location, translations: merged });
                    }}
                    placeholder="e.g. Spartans Martial Arts Sharjah"
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label>Public Description</Label>
                  <Textarea 
                    dir={generalLang === 'ar' ? 'rtl' : 'ltr'}
                    value={generalLang === 'en' ? (location.public_description || '') : (location.translations?.[generalLang]?.public_description || '')}
                    onChange={e => {
                      const v = e.target.value;
                      if (generalLang === 'en') {
                        setLocation({ ...location, public_description: v });
                        return;
                      }
                      const merged = { ...(location.translations || {}) };
                      merged[generalLang] = { ...(merged[generalLang] || {}), public_description: v };
                      setLocation({ ...location, translations: merged });
                    }}
                    placeholder="Brief description of this location for the public page"
                    className="mt-1 h-32"
                  />
                </div>

                <div>
                  <Label>Google Maps Embed URL</Label>
                  <Input 
                    value={location.map_embed_url || ''} 
                    onChange={e => setLocation({...location, map_embed_url: e.target.value})}
                    placeholder="<iframe src='...'> URL only"
                    className="mt-1"
                  />
                  <p className="text-xs text-zinc-500 mt-1">Go to Google Maps -&gt; Share -&gt; Embed a map -&gt; Copy the src URL inside the iframe tag.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'video' && location && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6 space-y-6">
              <h2 className="text-lg font-medium text-white mb-4">Location Video</h2>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <Label>Section Title</Label>
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
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <Label>Video File (Max 10MB)</Label>
                  <FileUpload
                    value={location.location_video_path || ''}
                    onChange={(v) => setLocation({ ...location, location_video_path: v })}
                    accept="video/*"
                    maxSize={10}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label>Video Thumbnail</Label>
                  <FileUpload
                    value={location.location_video_thumbnail_path || ''}
                    onChange={(v) => setLocation({ ...location, location_video_thumbnail_path: v })}
                    accept="image/*"
                    maxSize={10}
                    className="mt-2"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-sm border border-zinc-800 p-4">
                <div>
                  <p className="text-white font-medium">Auto-play</p>
                  <p className="text-zinc-400 text-sm">If enabled, video auto-plays muted.</p>
                </div>
                <Switch
                  checked={!!location.location_video_autoplay}
                  onCheckedChange={(checked) => setLocation({ ...location, location_video_autoplay: checked })}
                />
              </div>
            </div>
          )}

          {activeTab === 'reviews' && location && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6 space-y-6">
              <h2 className="text-lg font-medium text-white mb-4">Google Reviews Integration</h2>

              <div className="flex items-center justify-between gap-4 rounded-sm border border-zinc-800 p-4">
                <div>
                  <p className="text-white font-medium">Enable Reviews</p>
                  <p className="text-zinc-400 text-sm">Shows Google reviews on this location’s public page.</p>
                </div>
                <Switch
                  checked={!!location.google_reviews_enabled}
                  onCheckedChange={(checked) => setLocation({ ...location, google_reviews_enabled: checked })}
                />
              </div>

              <div>
                <Label>Google Place ID</Label>
                <Input
                  value={location.google_place_id || ''}
                  onChange={(e) => setLocation({ ...location, google_place_id: e.target.value })}
                  placeholder="ChIJ..."
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Google Business/Location Name</Label>
                <Input
                  value={location.google_location_name || ''}
                  onChange={(e) => setLocation({ ...location, google_location_name: e.target.value })}
                  placeholder="Spartans - Sharjah (Maliha)"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {activeTab === 'gallery' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-white">Location Gallery</h2>
                  <p className="text-zinc-400 text-sm">Manage images shown on the public location page slider.</p>
                </div>
                <Button onClick={handleAddGalleryImage} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" /> Add Image
                </Button>
              </div>

              <div className="space-y-4">
                {gallery.map((img, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 border border-zinc-800 rounded-sm bg-zinc-950">
                    <div className="mt-2 cursor-move text-zinc-600">
                      <GripVertical className="w-5 h-5" />
                    </div>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs mb-1 block">Image File</Label>
                        <FileUpload 
                          value={img.image_path} 
                          onChange={url => handleUpdateGalleryImage(i, 'image_path', url)}
                          buttonText={img.image_path ? 'Change Image' : 'Upload Image'}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Title (Alt Text)</Label>
                        <Input 
                          value={img.title} 
                          onChange={e => handleUpdateGalleryImage(i, 'title', e.target.value)}
                          placeholder="Image title"
                          className="mt-1 h-10 text-sm bg-zinc-900 border-zinc-700"
                        />
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleRemoveGalleryImage(i)} className="text-red-500 hover:text-red-400 hover:bg-red-500/10 mt-6">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                {gallery.length === 0 && (
                  <div className="text-center py-8 border border-dashed border-zinc-800 rounded-sm text-zinc-500">
                    No images added yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'faqs' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-medium text-white">Location FAQs</h2>
                  <p className="text-zinc-400 text-sm">Manage frequently asked questions specific to this location.</p>
                </div>
                <Button onClick={() => {
                  setFaqLang('en');
                  setFaqForm({ question: '', answer: '', translations: { ar: { question: '', answer: '' }, fr: { question: '', answer: '' }, ru: { question: '', answer: '' } }, category: 'General', sort_order: 0, is_featured: false });
                  setFaqDialog({ open: true, data: null });
                }} size="sm" className="bg-red-600 hover:bg-red-700">
                  <Plus className="w-4 h-4 mr-2" /> Add FAQ
                </Button>
              </div>

              <div className="space-y-3">
                {faqs.map((f) => (
                  <div key={f.faq_id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-sm flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-white">{f.question}</h3>
                      <p className="text-zinc-400 text-sm mt-1 line-clamp-2">{f.answer}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-block text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded">{f.category}</span>
                        {f.is_featured && (
                          <span className="inline-block text-xs bg-red-600/20 text-red-500 px-2 py-1 rounded">Visible to Public</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button onClick={() => {
                        setFaqLang('en');
                        const baseTranslations = { ar: { question: '', answer: '' }, fr: { question: '', answer: '' }, ru: { question: '', answer: '' } };
                        setFaqForm({
                          question: f.question,
                          answer: f.answer,
                          translations: { ...baseTranslations, ...(f.translations || {}) },
                          category: f.category,
                          sort_order: f.sort_order,
                          is_featured: f.is_featured
                        });
                        setFaqDialog({ open: true, data: f });
                      }} className="text-zinc-400 hover:text-white p-1">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteFaq(f.faq_id)} className="text-zinc-400 hover:text-red-500 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {faqs.length === 0 && (
                  <div className="text-center py-8 border border-dashed border-zinc-800 rounded-sm text-zinc-500">
                    No FAQs added yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FAQ Dialog */}
      <Dialog open={faqDialog.open} onOpenChange={(open) => !open && setFaqDialog({ open: false, data: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{faqDialog.data ? 'Edit FAQ' : 'Add Location FAQ'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
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
                onChange={e => {
                  const v = e.target.value;
                  if (faqLang === 'en') {
                    setFaqForm({ ...faqForm, question: v });
                    return;
                  }
                  const merged = { ...(faqForm.translations || {}) };
                  merged[faqLang] = { ...(merged[faqLang] || {}), question: v };
                  setFaqForm({ ...faqForm, translations: merged });
                }}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Answer</Label>
              <Textarea
                dir={faqLang === 'ar' ? 'rtl' : 'ltr'}
                value={faqLang === 'en' ? faqForm.answer : (faqForm.translations?.[faqLang]?.answer || '')}
                onChange={e => {
                  const v = e.target.value;
                  if (faqLang === 'en') {
                    setFaqForm({ ...faqForm, answer: v });
                    return;
                  }
                  const merged = { ...(faqForm.translations || {}) };
                  merged[faqLang] = { ...(merged[faqLang] || {}), answer: v };
                  setFaqForm({ ...faqForm, translations: merged });
                }}
                className="mt-1 h-32"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Input value={faqForm.category} onChange={e => setFaqForm({...faqForm, category: e.target.value})} className="mt-1" />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" value={faqForm.sort_order} onChange={e => setFaqForm({...faqForm, sort_order: parseInt(e.target.value) || 0})} className="mt-1" />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" id="loc-faq-feat" checked={faqForm.is_featured} onChange={e => setFaqForm({...faqForm, is_featured: e.target.checked})} className="w-4 h-4 rounded-sm bg-zinc-950 border-zinc-800 text-red-600 focus:ring-red-600" />
              <label htmlFor="loc-faq-feat" className="text-sm cursor-pointer">Show on Public Location Page</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFaqDialog({ open: false, data: null })}>Cancel</Button>
            <Button onClick={handleSaveFaq} className="bg-red-600 hover:bg-red-700">Save FAQ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagerLayout>
  );
}
