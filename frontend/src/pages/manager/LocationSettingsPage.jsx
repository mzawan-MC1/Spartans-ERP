import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ManagerLayout from '@/components/ManagerLayout';
import { cmsAPI, publicAPI } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Settings, Save, MapPin, Image as ImageIcon, MessageSquare, Plus, Trash2, GripVertical, HelpCircle, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import FileUpload from '@/components/FileUpload';

export default function LocationSettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState(null);
  
  // FAQs
  const [faqs, setFaqs] = useState([]);
  const [faqDialog, setFaqDialog] = useState({ open: false, data: null });
  const [faqForm, setFaqForm] = useState({ question: '', answer: '', category: 'General', sort_order: 0, is_featured: false });

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
        publicAPI.getBranch(user.location_id).catch(() => ({ data: null })),
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
      
      // Save General info (title, desc, map)
      await cmsAPI.updateBranchPublic(location.location_id, {
        public_title: location.public_title,
        public_description: location.public_description,
        map_embed_url: location.map_embed_url
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
                  <Label>Public Title</Label>
                  <Input 
                    value={location.public_title || ''} 
                    onChange={e => setLocation({...location, public_title: e.target.value})}
                    placeholder="e.g. Spartans Martial Arts Sharjah"
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label>Public Description</Label>
                  <Textarea 
                    value={location.public_description || ''} 
                    onChange={e => setLocation({...location, public_description: e.target.value})}
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
                <Button onClick={() => setFaqDialog({ open: true, data: null })} size="sm" className="bg-red-600 hover:bg-red-700">
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
                        setFaqForm({
                          question: f.question, answer: f.answer, category: f.category, sort_order: f.sort_order, is_featured: f.is_featured
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
              <Label>Question</Label>
              <Input value={faqForm.question} onChange={e => setFaqForm({...faqForm, question: e.target.value})} className="mt-1" />
            </div>
            <div>
              <Label>Answer</Label>
              <Textarea value={faqForm.answer} onChange={e => setFaqForm({...faqForm, answer: e.target.value})} className="mt-1 h-32" />
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
