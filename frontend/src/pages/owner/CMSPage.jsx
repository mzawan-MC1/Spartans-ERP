import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cmsAPI, authAPI, locationAPI, blogsAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import FileUpload from '@/components/FileUpload';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Globe, Settings, BookOpen, DollarSign, HelpCircle, FileText, MessageSquare,
  Plus, Pencil, Trash2, Loader2, ArrowLeft, Eye, X, Check, ChevronDown,
  Menu as MenuIcon, Link as LinkIcon, GripVertical, ToggleLeft, ToggleRight,
  ImageIcon, Star, Newspaper, LayoutTemplate
} from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { ActionTooltip } from '@/components/ui/tooltip';

const CMS_LANGS = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ar', label: 'Arabic', short: 'AR' },
  { code: 'fr', label: 'French', short: 'FR' },
  { code: 'ru', label: 'Russian', short: 'RU' },
];

function isNonEmptyText(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function LanguageTabs({ value, onValueChange, statusByLang = {}, className = '' }) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-full bg-zinc-950 border border-zinc-800 p-1 ${className}`}>
      {CMS_LANGS.map((l) => {
        const active = value === l.code;
        const status = statusByLang[l.code];
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => onValueChange(l.code)}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
              active ? 'bg-red-600 text-white' : 'text-zinc-300 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <span>{l.short}</span>
            {status === 'complete' ? (
              <Check className="w-3.5 h-3.5 text-white/90" />
            ) : status === 'incomplete' ? (
              <span className="text-amber-300 text-xs leading-none">⚠</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default function CMSPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('settings');
  
  // Data states
  const [siteSettings, setSiteSettings] = useState(null);
  const [disciplines, setDisciplines] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [pages, setPages] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [pricingMembershipTypeFilter, setPricingMembershipTypeFilter] = useState('all');
  
  // Dialog states
  const [dialog, setDialog] = useState({ open: false, type: null, data: null });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, disciplinesRes, pricingRes, faqsRes, pagesRes, subsRes, locsRes] = await Promise.all([
        cmsAPI.getSiteSettings(),
        cmsAPI.listDisciplines(),
        cmsAPI.listPricing(),
        cmsAPI.listFaqs(),
        cmsAPI.listPages(),
        cmsAPI.listContactSubmissions(),
        locationAPI.list(),
      ]);
      setSiteSettings(settingsRes.data);
      setDisciplines(disciplinesRes.data || []);
      setPricing(pricingRes.data || []);
      setFaqs(faqsRes.data || []);
      setPages(pagesRes.data || []);
      setSubmissions(subsRes.data || []);
      setLocations(locsRes.data || []);
    } catch (err) {
      toast.error('Failed to load CMS data');
    }
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await authAPI.getMe();
        if (res.data.role !== 'OWNER') {
          navigate('/login');
          return;
        }
        setUser(res.data);
        await fetchData();
      } catch {
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, [navigate, fetchData]);

  // Site Settings handlers
  const handleSaveSettings = async (data) => {
    setSaving(true);
    try {
      const res = await cmsAPI.updateSiteSettings(data);
      setSiteSettings(res.data);
      toast.success('Settings saved');
      setDialog({ open: false, type: null, data: null });
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // Generic CRUD handlers
  const handleCreate = async (type, data) => {
    setSaving(true);
    try {
      if (type === 'discipline') {
        await cmsAPI.createDiscipline(data);
        const res = await cmsAPI.listDisciplines();
        setDisciplines(res.data);
      } else if (type === 'pricing') {
        await cmsAPI.createPricing(data);
        const res = await cmsAPI.listPricing();
        setPricing(res.data);
      } else if (type === 'faq') {
        await cmsAPI.createFaq(data);
        const res = await cmsAPI.listFaqs();
        setFaqs(res.data);
      } else if (type === 'page') {
        await cmsAPI.createPage(data);
        const res = await cmsAPI.listPages();
        setPages(res.data);
      }
      toast.success('Created successfully');
      setDialog({ open: false, type: null, data: null });
    } catch (err) {
      toast.error('Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (type, id, data) => {
    setSaving(true);
    try {
      if (type === 'discipline') {
        await cmsAPI.updateDiscipline(id, data);
        const res = await cmsAPI.listDisciplines();
        setDisciplines(res.data);
      } else if (type === 'pricing') {
        await cmsAPI.updatePricing(id, data);
        const res = await cmsAPI.listPricing();
        setPricing(res.data);
      } else if (type === 'faq') {
        await cmsAPI.updateFaq(id, data);
        const res = await cmsAPI.listFaqs();
        setFaqs(res.data);
      } else if (type === 'page') {
        await cmsAPI.updatePage(id, data);
        const res = await cmsAPI.listPages();
        setPages(res.data);
      }
      toast.success('Updated successfully');
      setDialog({ open: false, type: null, data: null });
    } catch (err) {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type, id) => {
    if (!confirm('Are you sure you want to permanently delete this item? This action cannot be undone.')) return;
    try {
      if (type === 'discipline') {
        await cmsAPI.deleteDiscipline(id, true);
        setDisciplines(disciplines.filter(d => d.discipline_id !== id));
      } else if (type === 'pricing') {
        await cmsAPI.deletePricing(id, true);
        setPricing(pricing.filter(p => p.plan_id !== id));
      } else if (type === 'faq') {
        await cmsAPI.deleteFaq(id, true);
        setFaqs(faqs.filter(f => f.faq_id !== id));
      } else if (type === 'page') {
        await cmsAPI.deletePage(id, true);
        setPages(pages.filter(p => p.page_id !== id));
      }
      toast.success('Deleted successfully');
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleMarkRead = async (submissionId) => {
    try {
      await cmsAPI.updateContactStatus(submissionId, 'READ');
      setSubmissions(submissions.map(s => 
        s.submission_id === submissionId ? { ...s, status: 'READ' } : s
      ));
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const newSubmissions = submissions.filter(s => s.status === 'NEW').length;
  const normalizedPricing = pricing.map(p => ({ ...p, membership_type: p.membership_type || 'full_access' }));
  const filteredPricing = pricingMembershipTypeFilter === 'all'
    ? normalizedPricing
    : normalizedPricing.filter(p => p.membership_type === pricingMembershipTypeFilter);

  return (
    <div data-testid="cms-page" className="min-h-screen bg-[#09090b] flex flex-col">
      <TopNav user={user} locations={locations} />

      <main className="flex-1 px-6 sm:px-8 lg:px-12 py-8 max-w-[1440px] mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-heading font-extrabold text-white text-3xl uppercase tracking-tight">
              Public Site CMS
            </h1>
            <p className="text-zinc-500 font-body mt-1">Manage your public website content</p>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <Eye className="w-4 h-4" /> View Public Site
          </a>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1 flex-wrap">
            <TabsTrigger value="settings" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-settings">
              <Settings className="w-4 h-4 mr-2" /> Settings
            </TabsTrigger>
            <TabsTrigger value="header" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-header">
              <LayoutTemplate className="w-4 h-4 mr-2" /> Header
            </TabsTrigger>
            <TabsTrigger value="footer" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-footer">
              <LinkIcon className="w-4 h-4 mr-2" /> Footer
            </TabsTrigger>
            <TabsTrigger value="reviews" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-reviews">
              <Star className="w-4 h-4 mr-2" /> Reviews
            </TabsTrigger>
            <TabsTrigger value="disciplines" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-disciplines">
              <BookOpen className="w-4 h-4 mr-2" /> Disciplines
            </TabsTrigger>
            <TabsTrigger value="pricing" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-pricing">
              <DollarSign className="w-4 h-4 mr-2" /> Pricing
            </TabsTrigger>
            <TabsTrigger value="faqs" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-faqs">
              <HelpCircle className="w-4 h-4 mr-2" /> FAQs
            </TabsTrigger>
            <TabsTrigger value="pages" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-pages">
              <FileText className="w-4 h-4 mr-2" /> Pages
            </TabsTrigger>
            <TabsTrigger value="blogs" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="cms-tab-blogs">
              <Newspaper className="w-4 h-4 mr-2" /> Blogs
            </TabsTrigger>
            <TabsTrigger value="submissions" className="data-[state=active]:bg-red-600 data-[state=active]:text-white relative" data-testid="cms-tab-messages">
              <MessageSquare className="w-4 h-4 mr-2" /> Messages
              {newSubmissions > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {newSubmissions}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Site Settings */}
          <TabsContent value="settings">
            <SiteSettingsTab 
              settings={siteSettings} 
              onSave={handleSaveSettings}
              saving={saving}
            />
          </TabsContent>

          {/* Header Settings */}
          <TabsContent value="header">
            <HeaderSettingsTab
              settings={siteSettings}
              onSave={handleSaveSettings}
              saving={saving}
            />
          </TabsContent>

          {/* Footer Settings */}
          <TabsContent value="footer">
            <FooterSettingsTab
              settings={siteSettings}
              onSave={handleSaveSettings}
              saving={saving}
            />
          </TabsContent>

          {/* Reviews */}
          <TabsContent value="reviews">
            <ReviewsTab
              settings={siteSettings}
              onSave={handleSaveSettings}
              saving={saving}
            />
          </TabsContent>

          {/* Disciplines */}
          <TabsContent value="disciplines">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading font-bold text-white text-lg">Disciplines ({disciplines.length})</h2>
              <button
                onClick={() => setDialog({ open: true, type: 'discipline', data: null })}
                className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Discipline
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {disciplines.map((d) => (
                <div key={d.discipline_id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{d.icon || '🥋'}</span>
                      <div>
                        <h3 className="font-heading font-bold text-white">{d.name}</h3>
                        <p className="text-zinc-500 text-sm">{d.slug}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ActionTooltip label="Edit Discipline">
                        <button
                          onClick={() => setDialog({ open: true, type: 'discipline', data: d })}
                          className="text-zinc-400 hover:text-white p-1"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </ActionTooltip>
                      <ActionTooltip label="Delete Discipline">
                        <button
                          onClick={() => handleDelete('discipline', d.discipline_id)}
                          className="text-zinc-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </ActionTooltip>
                    </div>
                  </div>
                  <p className="text-zinc-400 text-sm mt-2 line-clamp-2">{d.short_description}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`text-xs px-2 py-1 rounded ${d.is_active ? 'bg-green-900/50 text-green-400' : 'bg-zinc-800 text-zinc-500'}`}>
                      {d.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-xs text-zinc-600">Order: {d.sort_order}</span>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Pricing */}
          <TabsContent value="pricing">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading font-bold text-white text-lg">
                Pricing Plans ({filteredPricing.length}{pricingMembershipTypeFilter === 'all' ? '' : ` / ${pricing.length}`})
              </h2>
              <button
                onClick={() => setDialog({ open: true, type: 'pricing', data: null })}
                className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Plan
              </button>
            </div>
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                type="button"
                onClick={() => setPricingMembershipTypeFilter('all')}
                className={`px-3 py-2 rounded-sm border text-sm font-semibold transition-colors ${
                  pricingMembershipTypeFilter === 'all'
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPricingMembershipTypeFilter('full_access')}
                className={`px-3 py-2 rounded-sm border text-sm font-semibold transition-colors ${
                  pricingMembershipTypeFilter === 'full_access'
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                Full Access
              </button>
              <button
                type="button"
                onClick={() => setPricingMembershipTypeFilter('only_gym')}
                className={`px-3 py-2 rounded-sm border text-sm font-semibold transition-colors ${
                  pricingMembershipTypeFilter === 'only_gym'
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                Only Gym
              </button>
              <button
                type="button"
                onClick={() => setPricingMembershipTypeFilter('kids')}
                className={`px-3 py-2 rounded-sm border text-sm font-semibold transition-colors ${
                  pricingMembershipTypeFilter === 'kids'
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                Kids
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {filteredPricing.map((p) => (
                <div key={p.plan_id} className={`bg-zinc-900 border rounded-sm p-4 ${p.is_popular ? 'border-red-600' : 'border-zinc-800'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-heading font-bold text-white">{p.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded capitalize">
                          {(p.membership_type || 'full_access').replace('_', ' ')}
                        </span>
                        {p.is_popular && <span className="text-xs text-red-500">Popular</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <ActionTooltip label="Edit Plan">
                        <button
                          onClick={() => setDialog({ open: true, type: 'pricing', data: p })}
                          className="text-zinc-400 hover:text-white p-1"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </ActionTooltip>
                      <ActionTooltip label="Delete Plan">
                        <button
                          onClick={() => handleDelete('pricing', p.plan_id)}
                          className="text-zinc-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </ActionTooltip>
                    </div>
                  </div>
                  <div className="text-2xl font-heading font-extrabold text-red-500">
                    {p.currency} {p.price}
                    <span className="text-sm text-zinc-500 font-normal">/{p.billing_cycle || p.billing_period}</span>
                  </div>
                  <p className="text-zinc-500 text-sm mt-2">{p.description}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* FAQs */}
          <TabsContent value="faqs">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading font-bold text-white text-lg">Global FAQs ({faqs.filter(f => !f.location_id).length})</h2>
              <button
                onClick={() => setDialog({ open: true, type: 'faq', data: null })}
                className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add FAQ
              </button>
            </div>
            <div className="space-y-3">
              {faqs.filter(f => !f.location_id).map((f) => (
                <div key={f.faq_id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
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
                      <ActionTooltip label="Edit FAQ">
                        <button
                          onClick={() => setDialog({ open: true, type: 'faq', data: f })}
                          className="text-zinc-400 hover:text-white p-1"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </ActionTooltip>
                      <ActionTooltip label="Delete FAQ">
                        <button
                          onClick={() => handleDelete('faq', f.faq_id)}
                          className="text-zinc-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </ActionTooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Pages */}
          <TabsContent value="pages">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading font-bold text-white text-lg">Static Pages ({pages.length})</h2>
              <button
                onClick={() => setDialog({ open: true, type: 'page', data: null })}
                className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Page
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pages.map((p) => (
                <div key={p.page_id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-heading font-bold text-white">{p.title}</h3>
                      <p className="text-zinc-500 text-sm">/{p.slug}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <ActionTooltip label="Preview Page">
                        <a
                          href={`/page/${p.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-400 hover:text-white p-1"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                      </ActionTooltip>
                      <ActionTooltip label="Edit Page">
                        <button
                          onClick={() => setDialog({ open: true, type: 'page', data: p })}
                          className="text-zinc-400 hover:text-white p-1"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </ActionTooltip>
                      <ActionTooltip label="Delete Page">
                        <button
                          onClick={() => handleDelete('page', p.page_id)}
                          className="text-zinc-400 hover:text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </ActionTooltip>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Blogs */}
          <TabsContent value="blogs">
            <BlogsTab />
          </TabsContent>

          {/* Contact Submissions */}
          <TabsContent value="submissions">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-heading font-bold text-white text-lg">
                Contact Messages ({submissions.length})
                {newSubmissions > 0 && <span className="ml-2 text-red-500 text-sm">({newSubmissions} new)</span>}
              </h2>
            </div>
            <div className="space-y-3">
              {submissions.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">No messages yet</div>
              ) : (
                submissions.map((s) => (
                  <div 
                    key={s.submission_id} 
                    className={`bg-zinc-900 border rounded-sm p-4 ${s.status === 'NEW' ? 'border-red-600' : 'border-zinc-800'}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-white">{s.name}</h3>
                          {s.status === 'NEW' && (
                            <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded">NEW</span>
                          )}
                        </div>
                        <p className="text-zinc-500 text-sm">{s.email} · {s.phone || 'No phone'}</p>
                        {s.subject && <p className="text-zinc-400 text-sm mt-1">Subject: {s.subject}</p>}
                        <p className="text-zinc-300 text-sm mt-2">{s.message}</p>
                        <p className="text-zinc-600 text-xs mt-2">{new Date(s.created_at).toLocaleString()}</p>
                      </div>
                      {s.status === 'NEW' && (
                        <button
                          onClick={() => handleMarkRead(s.submission_id)}
                          className="text-zinc-400 hover:text-green-500 p-1"
                          title="Mark as read"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Edit Dialogs */}
      <EditDialog 
        dialog={dialog} 
        setDialog={setDialog}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        saving={saving}
      />
    </div>
  );
}

// Helper to display image dimensions
const ImageDimensions = ({ url }) => {
  const [dims, setDims] = useState(null);

  useEffect(() => {
    if (!url) {
      setDims(null);
      return;
    }
    const img = new Image();
    img.src = resolveMediaUrl(url) || '';
    img.onload = () => setDims(`${img.naturalWidth} x ${img.naturalHeight}px`);
    img.onerror = () => setDims(null);
  }, [url]);

  if (!dims) return null;
  return <span className="text-xs text-zinc-500 ml-2 font-normal">({dims})</span>;
};

// Site Settings Tab Component
function SiteSettingsTab({ settings, onSave, saving }) {
  const [form, setForm] = useState({
    site_name: settings?.site_name || '',
    tagline: settings?.tagline || '',
    description: settings?.description || '',
    logo_url: settings?.logo_url || '',
    favicon_url: settings?.favicon_url || '',
    hero_image_url: settings?.hero_image_url || '',
    hero_images: settings?.hero_images || (settings?.hero_image_url ? [settings.hero_image_url] : []),
    video_section_title: settings?.video_section_title || '',
    video_url: settings?.video_url || '',
    video_thumbnail: settings?.video_thumbnail || '',
    video_autoplay: settings?.video_autoplay || false,
    custom_stats: settings?.custom_stats || [],
    contact_email: settings?.contact_email || '',
    contact_phone: settings?.contact_phone || '',
    contact_address: settings?.contact_address || '',
    footer_text: settings?.footer_text || '',
    hero_primary_cta_text: settings?.hero_primary_cta_text || '',
    hero_primary_cta_url: settings?.hero_primary_cta_url || '',
    hero_secondary_cta_text: settings?.hero_secondary_cta_text || '',
    hero_secondary_cta_url: settings?.hero_secondary_cta_url || '',
    social_links: settings?.social_links || {}
  });
  const [contentLang, setContentLang] = useState('en');
  const [i18nForm, setI18nForm] = useState({
    ar: { site_name: '', tagline: '', description: '', video_section_title: '', hero_primary_cta_text: '', hero_primary_cta_url: '', hero_secondary_cta_text: '', hero_secondary_cta_url: '' },
    fr: { site_name: '', tagline: '', description: '', video_section_title: '', hero_primary_cta_text: '', hero_primary_cta_url: '', hero_secondary_cta_text: '', hero_secondary_cta_url: '' },
    ru: { site_name: '', tagline: '', description: '', video_section_title: '', hero_primary_cta_text: '', hero_primary_cta_url: '', hero_secondary_cta_text: '', hero_secondary_cta_url: '' },
  });

  useEffect(() => {
    if (settings) {
      setForm({
        site_name: settings.site_name || '',
        tagline: settings.tagline || '',
        description: settings.description || '',
        logo_url: settings.logo_url || '',
        favicon_url: settings.favicon_url || '',
        hero_image_url: settings.hero_image_url || '',
        hero_images: settings.hero_images || (settings.hero_image_url ? [settings.hero_image_url] : []),
        video_section_title: settings.video_section_title || '',
        video_url: settings.video_url || '',
        video_thumbnail: settings.video_thumbnail || '',
        video_autoplay: settings.video_autoplay || false,
        custom_stats: settings.custom_stats || [],
        contact_email: settings.contact_email || '',
        contact_phone: settings.contact_phone || '',
        contact_address: settings.contact_address || '',
        footer_text: settings.footer_text || '',
        hero_primary_cta_text: settings.hero_primary_cta_text || '',
        hero_primary_cta_url: settings.hero_primary_cta_url || '',
        hero_secondary_cta_text: settings.hero_secondary_cta_text || '',
        hero_secondary_cta_url: settings.hero_secondary_cta_url || '',
        social_links: settings.social_links || {}
      });
      const t = settings.translations || {};
      setI18nForm({
        ar: {
          site_name: t.ar?.site_name || '',
          tagline: t.ar?.tagline || '',
          description: t.ar?.description || '',
          video_section_title: t.ar?.video_section_title || '',
          hero_primary_cta_text: t.ar?.hero_primary_cta_text || '',
          hero_primary_cta_url: t.ar?.hero_primary_cta_url || '',
          hero_secondary_cta_text: t.ar?.hero_secondary_cta_text || '',
          hero_secondary_cta_url: t.ar?.hero_secondary_cta_url || '',
        },
        fr: {
          site_name: t.fr?.site_name || '',
          tagline: t.fr?.tagline || '',
          description: t.fr?.description || '',
          video_section_title: t.fr?.video_section_title || '',
          hero_primary_cta_text: t.fr?.hero_primary_cta_text || '',
          hero_primary_cta_url: t.fr?.hero_primary_cta_url || '',
          hero_secondary_cta_text: t.fr?.hero_secondary_cta_text || '',
          hero_secondary_cta_url: t.fr?.hero_secondary_cta_url || '',
        },
        ru: {
          site_name: t.ru?.site_name || '',
          tagline: t.ru?.tagline || '',
          description: t.ru?.description || '',
          video_section_title: t.ru?.video_section_title || '',
          hero_primary_cta_text: t.ru?.hero_primary_cta_text || '',
          hero_primary_cta_url: t.ru?.hero_primary_cta_url || '',
          hero_secondary_cta_text: t.ru?.hero_secondary_cta_text || '',
          hero_secondary_cta_url: t.ru?.hero_secondary_cta_url || '',
        },
      });
    }
  }, [settings]);

  const getT = (key) => {
    if (contentLang === 'en') return form[key] || '';
    return i18nForm?.[contentLang]?.[key] || '';
  };

  const setT = (key, value) => {
    if (contentLang === 'en') {
      setForm({ ...form, [key]: value });
      return;
    }
    setI18nForm({
      ...i18nForm,
      [contentLang]: { ...(i18nForm?.[contentLang] || {}), [key]: value },
    });
  };

  const settingsRequiredKeys = ['site_name', 'tagline', 'description'];
  const settingsStatusByLang = CMS_LANGS.reduce((acc, l) => {
    const isComplete = settingsRequiredKeys.every((k) => isNonEmptyText(l.code === 'en' ? form[k] : (i18nForm?.[l.code]?.[k] || '')));
    acc[l.code] = isComplete ? 'complete' : 'incomplete';
    return acc;
  }, {});

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6">
      <h2 className="font-heading font-bold text-white text-lg mb-6">Site Settings</h2>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="text-sm text-zinc-400">Language</div>
        <LanguageTabs value={contentLang} onValueChange={setContentLang} statusByLang={settingsStatusByLang} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-zinc-400 text-sm mb-2">Site Name</label>
          <input
            type="text"
            value={getT('site_name')}
            onChange={(e) => setT('site_name', e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
          />
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-2">Tagline</label>
          <input
            type="text"
            value={getT('tagline')}
            onChange={(e) => setT('tagline', e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-zinc-400 text-sm mb-2">Description</label>
          <textarea
            value={getT('description')}
            onChange={(e) => setT('description', e.target.value)}
            rows={3}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm resize-none"
          />
        </div>
        <div className="md:col-span-2 border-t border-zinc-800 pt-6">
          <h3 className="font-heading font-bold text-white text-md mb-4">Hero Buttons</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Primary Button Label</label>
              <input
                type="text"
                value={getT('hero_primary_cta_text')}
                onChange={(e) => setT('hero_primary_cta_text', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Primary Button URL</label>
              <input
                type="text"
                value={getT('hero_primary_cta_url')}
                onChange={(e) => setT('hero_primary_cta_url', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Secondary Button Label</label>
              <input
                type="text"
                value={getT('hero_secondary_cta_text')}
                onChange={(e) => setT('hero_secondary_cta_text', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-2">Secondary Button URL</label>
              <input
                type="text"
                value={getT('hero_secondary_cta_url')}
                onChange={(e) => setT('hero_secondary_cta_url', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-2">Contact Email</label>
          <input
            type="email"
            value={form.contact_email}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
          />
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-2">Contact Phone</label>
          <input
            type="text"
            value={form.contact_phone}
            onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-zinc-400 text-sm mb-2">Footer Text</label>
          <input
            type="text"
            value={form.footer_text}
            onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
          />
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-2">
            Logo <ImageDimensions url={form.logo_url} />
          </label>
          <FileUpload value={form.logo_url} onChange={(url) => setForm({ ...form, logo_url: url })} />
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-2">
            Favicon <ImageDimensions url={form.favicon_url} />
          </label>
          <FileUpload value={form.favicon_url} onChange={(url) => setForm({ ...form, favicon_url: url })} />
        </div>
        <div className="md:col-span-2">
          <label className="block text-zinc-400 text-sm mb-2">
            Hero Images (Max 5)
          </label>
          <div className="space-y-3">
            {form.hero_images.map((url, idx) => (
              <div key={idx} className="relative group">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-zinc-500">Image {idx + 1}</span>
                  <ImageDimensions url={url} />
                </div>
                <FileUpload 
                  value={url} 
                  onChange={(newUrl) => {
                    const newImages = [...form.hero_images];
                    if (newUrl) {
                      newImages[idx] = newUrl;
                    } else {
                      // Remove if cleared, or just clear it? User might want to replace.
                      // FileUpload calls onChange(null) on clear.
                      // If we want to support removing, we should probably just splice it out
                      // but FileUpload component has a remove button that calls onChange(null).
                      // Let's remove it from the array if it's null.
                      newImages.splice(idx, 1);
                    }
                    // Sync first image to hero_image_url for backward compatibility
                    const firstImage = newImages.length > 0 ? newImages[0] : '';
                    setForm({ ...form, hero_images: newImages, hero_image_url: firstImage });
                  }} 
                />
              </div>
            ))}
            
            {form.hero_images.length < 5 && (
              <button
                type="button"
                onClick={() => setForm({ ...form, hero_images: [...form.hero_images, ''] })}
                className="mt-2 text-sm text-red-500 hover:text-red-400 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Another Image
              </button>
            )}
            
            {form.hero_images.length === 0 && (
               <button
                type="button"
                onClick={() => setForm({ ...form, hero_images: [''] })}
                className="mt-2 text-sm text-red-500 hover:text-red-400 flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Image
              </button>
            )}
          </div>
          <p className="text-zinc-600 text-xs mt-2">
            These images will auto-scroll on the landing page (4s delay). First image is default.
          </p>
        </div>

        {/* Video Section */}
        <div className="md:col-span-2 border-t border-zinc-800 pt-6 mt-2">
          <h3 className="font-heading font-bold text-white text-md mb-4">Video Section</h3>
        </div>
        <div className="md:col-span-2">
          <label className="block text-zinc-400 text-sm mb-2">Section Title (H1)</label>
          <input
            type="text"
            value={getT('video_section_title')}
            onChange={(e) => setT('video_section_title', e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
            placeholder="e.g. Experience The Energy"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-zinc-400 text-sm mb-2">Video File (MP4, WebM, etc. - Max 5MB)</label>
          <FileUpload 
            value={form.video_url} 
            onChange={(url) => setForm({ ...form, video_url: url })} 
            accept="video/*"
            maxSize={5}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-zinc-400 text-sm mb-2">Video Thumbnail (Image)</label>
          <FileUpload 
            value={form.video_thumbnail} 
            onChange={(url) => setForm({ ...form, video_thumbnail: url })} 
            accept="image/*"
          />
          <p className="text-zinc-600 text-xs mt-1">This image will show before the video plays.</p>
        </div>
        <div className="md:col-span-2">
          <label className="flex items-center gap-2 text-zinc-400 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.video_autoplay}
              onChange={(e) => setForm({ ...form, video_autoplay: e.target.checked })}
              className="rounded border-zinc-700 bg-zinc-950"
            />
            Auto-play Video (starts automatically muted)
          </label>
        </div>

        {/* Custom Stats / Tiles */}
        <div className="md:col-span-2 border-t border-zinc-800 pt-6 mt-2">
          <h3 className="font-heading font-bold text-white text-md mb-2">Stats / Tiles</h3>
          <p className="text-zinc-600 text-xs mb-4">Overrides auto-calculated stats if provided. Add tiles to display on the landing page.</p>
          
          <div className="space-y-3">
            {(form.custom_stats || []).map((stat, idx) => (
              <div key={idx} className="flex gap-2 items-end bg-zinc-950 p-3 border border-zinc-800 rounded-sm">
                <div className="flex-1">
                  <label className="block text-zinc-400 text-xs mb-1">Value</label>
                  <input
                    type="text"
                    value={stat.value}
                    onChange={(e) => {
                      const newStats = [...(form.custom_stats || [])];
                      newStats[idx] = { ...newStats[idx], value: e.target.value };
                      setForm({ ...form, custom_stats: newStats });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 text-white px-3 py-1.5 rounded-sm text-sm"
                    placeholder="e.g. 3+"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-zinc-400 text-xs mb-1">Label</label>
                  <input
                    type="text"
                    value={stat.label}
                    onChange={(e) => {
                      const newStats = [...(form.custom_stats || [])];
                      newStats[idx] = { ...newStats[idx], label: e.target.value };
                      setForm({ ...form, custom_stats: newStats });
                    }}
                    className="w-full bg-zinc-900 border border-zinc-700 text-white px-3 py-1.5 rounded-sm text-sm"
                    placeholder="e.g. Locations"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newStats = form.custom_stats.filter((_, i) => i !== idx);
                    setForm({ ...form, custom_stats: newStats });
                  }}
                  className="text-zinc-500 hover:text-red-500 p-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setForm({ ...form, custom_stats: [...(form.custom_stats || []), { value: '', label: '' }] })}
              className="text-sm text-red-500 hover:text-red-400 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Add Stat Tile
            </button>
          </div>
        </div>
        
        <div className="border-t border-zinc-800 pt-6 mt-2 md:col-span-2"></div>

        <div>
          <label className="block text-zinc-400 text-sm mb-2">Instagram URL</label>
          <input
            type="text"
            value={form.social_links.instagram || ''}
            onChange={(e) => setForm({ ...form, social_links: { ...form.social_links, instagram: e.target.value } })}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
          />
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-2">Facebook URL</label>
          <input
            type="text"
            value={form.social_links.facebook || ''}
            onChange={(e) => setForm({ ...form, social_links: { ...form.social_links, facebook: e.target.value } })}
            className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
          />
        </div>
      </div>
      <div className="mt-6">
        <button
          onClick={() => onSave({
            ...form,
            translations: {
              ar: { ...i18nForm.ar },
              fr: { ...i18nForm.fr },
              ru: { ...i18nForm.ru },
            },
          })}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-6 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save Settings
        </button>
      </div>
    </div>
  );
}

// Header Settings Tab Component
function HeaderSettingsTab({ settings, onSave, saving }) {
  const defaultMenu = [
    { label: 'Home', url: '/', is_active: true, sort_order: 0 },
    { label: 'Locations', url: '/branches', is_active: true, sort_order: 1 },
    { label: 'Disciplines', url: '/disciplines', is_active: true, sort_order: 2 },
    { label: 'Pricing', url: '/pricing', is_active: true, sort_order: 3 },
    { label: 'FAQ', url: '/faqs', is_active: true, sort_order: 4 },
    { label: 'Contact', url: '/contact', is_active: true, sort_order: 5 },
  ];

  const [menuItems, setMenuItems] = useState(settings?.header_menu || defaultMenu);
  const [ctaText, setCtaText] = useState(settings?.header_cta_text || 'Get Started');
  const [ctaUrl, setCtaUrl] = useState(settings?.header_cta_url || '/contact');
  const [editIdx, setEditIdx] = useState(null);
  const [editLang, setEditLang] = useState('en');
  const [editForm, setEditForm] = useState({ label: '', url: '', label_ar: '', label_fr: '', label_ru: '' });
  const [ctaLang, setCtaLang] = useState('en');
  const [ctaTranslations, setCtaTranslations] = useState({
    ar: { text: '', url: '' },
    fr: { text: '', url: '' },
    ru: { text: '', url: '' },
  });

  useEffect(() => {
    if (settings) {
      setMenuItems(settings.header_menu || defaultMenu);
      setCtaText(settings.header_cta_text || 'Get Started');
      setCtaUrl(settings.header_cta_url || '/contact');
      const t = settings.translations || {};
      setCtaTranslations({
        ar: { text: t.ar?.header_cta_text || '', url: t.ar?.header_cta_url || '' },
        fr: { text: t.fr?.header_cta_text || '', url: t.fr?.header_cta_url || '' },
        ru: { text: t.ru?.header_cta_text || '', url: t.ru?.header_cta_url || '' },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const toggleItem = (idx) => {
    const updated = [...menuItems];
    updated[idx] = { ...updated[idx], is_active: !updated[idx].is_active };
    setMenuItems(updated);
  };

  const moveItem = (idx, direction) => {
    const updated = [...menuItems];
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= updated.length) return;
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    updated.forEach((item, i) => item.sort_order = i);
    setMenuItems(updated);
  };

  const addItem = () => {
    setMenuItems([...menuItems, { label: 'New Link', url: '/', is_active: true, sort_order: menuItems.length }]);
  };

  const removeItem = (idx) => {
    setMenuItems(menuItems.filter((_, i) => i !== idx));
  };

  const startEdit = (idx) => {
    setEditIdx(idx);
    setEditLang('en');
    const t = menuItems[idx]?.translations || {};
    setEditForm({
      label: menuItems[idx].label,
      url: menuItems[idx].url,
      label_ar: t.ar?.label || '',
      label_fr: t.fr?.label || '',
      label_ru: t.ru?.label || '',
    });
  };

  const saveEdit = () => {
    if (editIdx === null) return;
    const updated = [...menuItems];
    const nextTranslations = {
      ...(updated[editIdx].translations || {}),
      ar: { ...(updated[editIdx].translations?.ar || {}), label: editForm.label_ar || '' },
      fr: { ...(updated[editIdx].translations?.fr || {}), label: editForm.label_fr || '' },
      ru: { ...(updated[editIdx].translations?.ru || {}), label: editForm.label_ru || '' },
    };
    updated[editIdx] = { ...updated[editIdx], label: editForm.label, url: editForm.url, translations: nextTranslations };
    setMenuItems(updated);
    setEditIdx(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6" data-testid="header-settings">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading font-bold text-white text-lg">Navigation Menu</h2>
          <button
            onClick={addItem}
            className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm flex items-center gap-2"
            data-testid="add-menu-item-btn"
          >
            <Plus className="w-4 h-4" /> Add Link
          </button>
        </div>
        <div className="space-y-2">
          {menuItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-sm group" data-testid={`menu-item-${idx}`}>
              <div className="flex flex-col gap-1">
                <button onClick={() => moveItem(idx, -1)} className="text-zinc-600 hover:text-white disabled:opacity-30" disabled={idx === 0}>
                  <ChevronDown className="w-3 h-3 rotate-180" />
                </button>
                <button onClick={() => moveItem(idx, 1)} className="text-zinc-600 hover:text-white disabled:opacity-30" disabled={idx === menuItems.length - 1}>
                  <ChevronDown className="w-3 h-3" />
                </button>
              </div>

              {editIdx === idx ? (
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-500">Menu Item #{idx + 1}</div>
                    <LanguageTabs
                      value={editLang}
                      onValueChange={setEditLang}
                      statusByLang={CMS_LANGS.reduce((acc, l) => {
                        const v =
                          l.code === 'en'
                            ? (editForm.label || '')
                            : (editForm[`label_${l.code}`] || '');
                        acc[l.code] = isNonEmptyText(v) ? 'complete' : 'incomplete';
                        return acc;
                      }, {})}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="md:col-span-1">
                      <label className="block text-zinc-400 text-sm mb-1">Label</label>
                      <input
                        type="text"
                        value={editLang === 'en' ? (editForm.label || '') : (editForm[`label_${editLang}`] || '')}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          if (editLang === 'en') {
                            setEditForm({ ...editForm, label: nextValue });
                            return;
                          }
                          setEditForm({ ...editForm, [`label_${editLang}`]: nextValue });
                        }}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-zinc-400 text-sm mb-1">Page/URL (shared)</label>
                      <input
                        type="text"
                        value={editForm.url}
                        onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm"
                        placeholder="/url"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button onClick={saveEdit} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-sm text-sm flex items-center gap-2">
                      <Check className="w-4 h-4" /> Save
                    </button>
                    <button onClick={() => setEditIdx(null)} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-sm text-sm flex items-center gap-2">
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center gap-4">
                  <span className="text-white font-medium text-sm min-w-[100px]">{item.label}</span>
                  <span className="text-zinc-500 text-sm">{item.url}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleItem(idx)}
                  className={item.is_active ? 'text-green-400' : 'text-zinc-600'}
                  title={item.is_active ? 'Active' : 'Inactive'}
                  data-testid={`toggle-menu-${idx}`}
                >
                  {item.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                </button>
                {editIdx !== idx && (
                  <button onClick={() => startEdit(idx)} className="text-zinc-500 hover:text-white p-1"><Pencil className="w-3.5 h-3.5" /></button>
                )}
                <button onClick={() => removeItem(idx)} className="text-zinc-500 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6" data-testid="header-cta-settings">
        <h2 className="font-heading font-bold text-white text-lg mb-4">Call-to-Action Button</h2>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-sm text-zinc-400">Language</div>
          <LanguageTabs
            value={ctaLang}
            onValueChange={setCtaLang}
            statusByLang={CMS_LANGS.reduce((acc, l) => {
              const text = l.code === 'en' ? ctaText : (ctaTranslations?.[l.code]?.text || '');
              const url = l.code === 'en' ? ctaUrl : (ctaTranslations?.[l.code]?.url || '');
              acc[l.code] = isNonEmptyText(text) && isNonEmptyText(url) ? 'complete' : 'incomplete';
              return acc;
            }, {})}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Button Text</label>
            <input
              type="text"
              value={ctaLang === 'en' ? ctaText : (ctaTranslations?.[ctaLang]?.text || '')}
              onChange={(e) => {
                const nextValue = e.target.value;
                if (ctaLang === 'en') {
                  setCtaText(nextValue);
                  return;
                }
                setCtaTranslations({ ...ctaTranslations, [ctaLang]: { ...(ctaTranslations?.[ctaLang] || {}), text: nextValue } });
              }}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              data-testid="header-cta-text"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Button URL</label>
            <input
              type="text"
              value={ctaLang === 'en' ? ctaUrl : (ctaTranslations?.[ctaLang]?.url || '')}
              onChange={(e) => {
                const nextValue = e.target.value;
                if (ctaLang === 'en') {
                  setCtaUrl(nextValue);
                  return;
                }
                setCtaTranslations({ ...ctaTranslations, [ctaLang]: { ...(ctaTranslations?.[ctaLang] || {}), url: nextValue } });
              }}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              data-testid="header-cta-url"
            />
          </div>
        </div>
      </div>

      <button
        onClick={() => onSave({
          header_menu: menuItems,
          header_cta_text: ctaText,
          header_cta_url: ctaUrl,
          translations: {
            ar: { header_cta_text: ctaTranslations.ar.text, header_cta_url: ctaTranslations.ar.url },
            fr: { header_cta_text: ctaTranslations.fr.text, header_cta_url: ctaTranslations.fr.url },
            ru: { header_cta_text: ctaTranslations.ru.text, header_cta_url: ctaTranslations.ru.url },
          },
        })}
        disabled={saving}
        className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-6 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50"
        data-testid="save-header-btn"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Header Settings
      </button>
    </div>
  );
}

// Footer Settings Tab Component
function FooterSettingsTab({ settings, onSave, saving }) {
  const [footerLogo, setFooterLogo] = useState(settings?.footer_logo_url || '');
  const [footerDesc, setFooterDesc] = useState(settings?.footer_description || settings?.description || '');
  const [footerText, setFooterText] = useState(settings?.footer_text || '');
  const [quickLinksTitle, setQuickLinksTitle] = useState(settings?.footer_quick_links_title || 'Quick Links');
  const [contactTitle, setContactTitle] = useState(settings?.footer_contact_title || 'Contact Us');
  const [followTitle, setFollowTitle] = useState(settings?.footer_follow_title || 'Follow Us');
  const [privacyLabel, setPrivacyLabel] = useState(settings?.footer_privacy_label || 'Privacy Policy');
  const [termsLabel, setTermsLabel] = useState(settings?.footer_terms_label || 'Terms of Service');
  const [quickLinks, setQuickLinks] = useState(settings?.footer_quick_links || [
    { label: 'Home', url: '/' },
    { label: 'Disciplines', url: '/disciplines' },
    { label: 'Pricing', url: '/pricing' },
    { label: 'Contact', url: '/contact' },
  ]);
  const [contact, setContact] = useState(settings?.footer_contact || {
    phone: settings?.contact_phone || '',
    email: settings?.contact_email || '',
    address: settings?.contact_address || '',
    working_hours: '',
  });
  const [social, setSocial] = useState(settings?.social_links || {});
  const [editLinkIdx, setEditLinkIdx] = useState(null);
  const [editLinkLang, setEditLinkLang] = useState('en');
  const [editLinkForm, setEditLinkForm] = useState({ label: '', url: '', label_ar: '', label_fr: '', label_ru: '' });
  const [footerLang, setFooterLang] = useState('en');
  const [i18nForm, setI18nForm] = useState({
    ar: { footer_description: '', footer_text: '', footer_quick_links_title: '', footer_contact_title: '', footer_follow_title: '', footer_privacy_label: '', footer_terms_label: '' },
    fr: { footer_description: '', footer_text: '', footer_quick_links_title: '', footer_contact_title: '', footer_follow_title: '', footer_privacy_label: '', footer_terms_label: '' },
    ru: { footer_description: '', footer_text: '', footer_quick_links_title: '', footer_contact_title: '', footer_follow_title: '', footer_privacy_label: '', footer_terms_label: '' },
  });

  useEffect(() => {
    if (settings) {
      setFooterLogo(settings.footer_logo_url || '');
      setFooterDesc(settings.footer_description || settings.description || '');
      setFooterText(settings.footer_text || '');
      setQuickLinksTitle(settings.footer_quick_links_title || 'Quick Links');
      setContactTitle(settings.footer_contact_title || 'Contact Us');
      setFollowTitle(settings.footer_follow_title || 'Follow Us');
      setPrivacyLabel(settings.footer_privacy_label || 'Privacy Policy');
      setTermsLabel(settings.footer_terms_label || 'Terms of Service');
      setQuickLinks(settings.footer_quick_links || [
        { label: 'Home', url: '/' },
        { label: 'Disciplines', url: '/disciplines' },
        { label: 'Pricing', url: '/pricing' },
        { label: 'Contact', url: '/contact' },
      ]);
      setContact(settings.footer_contact || {
        phone: settings.contact_phone || '',
        email: settings.contact_email || '',
        address: settings.contact_address || '',
        working_hours: '',
      });
      setSocial(settings.social_links || {});
      const t = settings.translations || {};
      setI18nForm({
        ar: {
          footer_description: t.ar?.footer_description || '',
          footer_text: t.ar?.footer_text || '',
          footer_quick_links_title: t.ar?.footer_quick_links_title || '',
          footer_contact_title: t.ar?.footer_contact_title || '',
          footer_follow_title: t.ar?.footer_follow_title || '',
          footer_privacy_label: t.ar?.footer_privacy_label || '',
          footer_terms_label: t.ar?.footer_terms_label || '',
        },
        fr: {
          footer_description: t.fr?.footer_description || '',
          footer_text: t.fr?.footer_text || '',
          footer_quick_links_title: t.fr?.footer_quick_links_title || '',
          footer_contact_title: t.fr?.footer_contact_title || '',
          footer_follow_title: t.fr?.footer_follow_title || '',
          footer_privacy_label: t.fr?.footer_privacy_label || '',
          footer_terms_label: t.fr?.footer_terms_label || '',
        },
        ru: {
          footer_description: t.ru?.footer_description || '',
          footer_text: t.ru?.footer_text || '',
          footer_quick_links_title: t.ru?.footer_quick_links_title || '',
          footer_contact_title: t.ru?.footer_contact_title || '',
          footer_follow_title: t.ru?.footer_follow_title || '',
          footer_privacy_label: t.ru?.footer_privacy_label || '',
          footer_terms_label: t.ru?.footer_terms_label || '',
        },
      });
    }
  }, [settings]);

  const getT = (key) => {
    if (footerLang === 'en') {
      if (key === 'footer_description') return footerDesc || '';
      if (key === 'footer_text') return footerText || '';
      if (key === 'footer_quick_links_title') return quickLinksTitle || '';
      if (key === 'footer_contact_title') return contactTitle || '';
      if (key === 'footer_follow_title') return followTitle || '';
      if (key === 'footer_privacy_label') return privacyLabel || '';
      if (key === 'footer_terms_label') return termsLabel || '';
      return '';
    }
    return i18nForm?.[footerLang]?.[key] || '';
  };

  const setT = (key, value) => {
    if (footerLang === 'en') {
      if (key === 'footer_description') setFooterDesc(value);
      if (key === 'footer_text') setFooterText(value);
      if (key === 'footer_quick_links_title') setQuickLinksTitle(value);
      if (key === 'footer_contact_title') setContactTitle(value);
      if (key === 'footer_follow_title') setFollowTitle(value);
      if (key === 'footer_privacy_label') setPrivacyLabel(value);
      if (key === 'footer_terms_label') setTermsLabel(value);
      return;
    }
    setI18nForm({
      ...i18nForm,
      [footerLang]: { ...(i18nForm?.[footerLang] || {}), [key]: value },
    });
  };

  const footerRequiredKeys = [
    'footer_description',
    'footer_text',
    'footer_quick_links_title',
    'footer_contact_title',
    'footer_follow_title',
    'footer_privacy_label',
    'footer_terms_label',
  ];
  const footerStatusByLang = CMS_LANGS.reduce((acc, l) => {
    const isComplete = footerRequiredKeys.every((k) => isNonEmptyText(l.code === 'en' ? getT(k) : (i18nForm?.[l.code]?.[k] || '')));
    acc[l.code] = isComplete ? 'complete' : 'incomplete';
    return acc;
  }, {});

  const addLink = () => setQuickLinks([...quickLinks, { label: 'New Link', url: '/' }]);
  const removeLink = (idx) => setQuickLinks(quickLinks.filter((_, i) => i !== idx));

  const startEditLink = (idx) => {
    setEditLinkIdx(idx);
    setEditLinkLang('en');
    const t = quickLinks[idx]?.translations || {};
    setEditLinkForm({
      label: quickLinks[idx].label,
      url: quickLinks[idx].url,
      label_ar: t.ar?.label || '',
      label_fr: t.fr?.label || '',
      label_ru: t.ru?.label || '',
    });
  };
  const saveEditLink = () => {
    if (editLinkIdx === null) return;
    const updated = [...quickLinks];
    const nextTranslations = {
      ...(updated[editLinkIdx].translations || {}),
      ar: { ...(updated[editLinkIdx].translations?.ar || {}), label: editLinkForm.label_ar || '' },
      fr: { ...(updated[editLinkIdx].translations?.fr || {}), label: editLinkForm.label_fr || '' },
      ru: { ...(updated[editLinkIdx].translations?.ru || {}), label: editLinkForm.label_ru || '' },
    };
    updated[editLinkIdx] = { ...updated[editLinkIdx], label: editLinkForm.label, url: editLinkForm.url, translations: nextTranslations };
    setQuickLinks(updated);
    setEditLinkIdx(null);
  };

  const handleSave = () => {
    onSave({
      footer_logo_url: footerLogo || null,
      footer_description: footerDesc,
      footer_text: footerText,
      footer_quick_links_title: quickLinksTitle,
      footer_contact_title: contactTitle,
      footer_follow_title: followTitle,
      footer_privacy_label: privacyLabel,
      footer_terms_label: termsLabel,
      footer_quick_links: quickLinks,
      footer_contact: contact,
      social_links: social,
      translations: {
        ar: { ...i18nForm.ar },
        fr: { ...i18nForm.fr },
        ru: { ...i18nForm.ru },
      },
    });
  };

  const socialPlatforms = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'twitter', label: 'X (Twitter)' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'whatsapp', label: 'WhatsApp' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-zinc-400">Language</div>
        <LanguageTabs value={footerLang} onValueChange={setFooterLang} statusByLang={footerStatusByLang} />
      </div>
      {/* Footer Logo & Description */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6" data-testid="footer-brand-settings">
        <h2 className="font-heading font-bold text-white text-lg mb-4">Footer Branding</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Footer Logo</label>
            <FileUpload value={footerLogo} onChange={(url) => setFooterLogo(url)} />
            <p className="text-zinc-600 text-xs mt-1">Leave empty to use the main site logo</p>
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Footer Description</label>
            <textarea
              value={getT('footer_description')}
              onChange={(e) => setT('footer_description', e.target.value)}
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm resize-none"
              data-testid="footer-description"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-zinc-400 text-sm mb-2">Copyright Text</label>
            <input
              type="text"
              value={getT('footer_text')}
              onChange={(e) => setT('footer_text', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              data-testid="footer-copyright-text"
            />
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6" data-testid="footer-labels-settings">
        <h2 className="font-heading font-bold text-white text-lg mb-4">Footer Labels</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Quick Links Title</label>
            <input
              type="text"
              value={getT('footer_quick_links_title')}
              onChange={(e) => setT('footer_quick_links_title', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Contact Title</label>
            <input
              type="text"
              value={getT('footer_contact_title')}
              onChange={(e) => setT('footer_contact_title', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Follow Title</label>
            <input
              type="text"
              value={getT('footer_follow_title')}
              onChange={(e) => setT('footer_follow_title', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Privacy Label</label>
            <input
              type="text"
              value={getT('footer_privacy_label')}
              onChange={(e) => setT('footer_privacy_label', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Terms Label</label>
            <input
              type="text"
              value={getT('footer_terms_label')}
              onChange={(e) => setT('footer_terms_label', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
            />
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6" data-testid="footer-quick-links">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-bold text-white text-lg">Quick Links</h2>
          <button
            onClick={addLink}
            className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-3 py-1.5 rounded-sm text-xs flex items-center gap-1"
            data-testid="add-quick-link-btn"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {quickLinks.map((link, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-sm" data-testid={`quick-link-${idx}`}>
              {editLinkIdx === idx ? (
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-500">Quick Link #{idx + 1}</div>
                    <LanguageTabs
                      value={editLinkLang}
                      onValueChange={setEditLinkLang}
                      statusByLang={CMS_LANGS.reduce((acc, l) => {
                        const v =
                          l.code === 'en'
                            ? (editLinkForm.label || '')
                            : (editLinkForm[`label_${l.code}`] || '');
                        acc[l.code] = isNonEmptyText(v) ? 'complete' : 'incomplete';
                        return acc;
                      }, {})}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="md:col-span-1">
                      <label className="block text-zinc-400 text-sm mb-1">Label</label>
                      <input
                        type="text"
                        value={editLinkLang === 'en' ? (editLinkForm.label || '') : (editLinkForm[`label_${editLinkLang}`] || '')}
                        onChange={(e) => {
                          const nextValue = e.target.value;
                          if (editLinkLang === 'en') {
                            setEditLinkForm({ ...editLinkForm, label: nextValue });
                            return;
                          }
                          setEditLinkForm({ ...editLinkForm, [`label_${editLinkLang}`]: nextValue });
                        }}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-zinc-400 text-sm mb-1">Page/URL (shared)</label>
                      <input
                        type="text"
                        value={editLinkForm.url}
                        onChange={(e) => setEditLinkForm({ ...editLinkForm, url: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 text-white px-3 py-2 rounded-sm text-sm"
                        placeholder="/url"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button onClick={saveEditLink} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-sm text-sm flex items-center gap-2">
                      <Check className="w-4 h-4" /> Save
                    </button>
                    <button onClick={() => setEditLinkIdx(null)} className="bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-sm text-sm flex items-center gap-2">
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 flex items-center gap-4">
                    <span className="text-white font-medium text-sm min-w-[100px]">{link.label}</span>
                    <span className="text-zinc-500 text-sm">{link.url}</span>
                  </div>
                  <button onClick={() => startEditLink(idx)} className="text-zinc-500 hover:text-white p-1"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeLink(idx)} className="text-zinc-500 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6" data-testid="footer-contact-settings">
        <h2 className="font-heading font-bold text-white text-lg mb-4">Contact Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Phone</label>
            <input
              type="text"
              value={contact.phone}
              onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              data-testid="footer-contact-phone"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Email</label>
            <input
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              data-testid="footer-contact-email"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Address</label>
            <input
              type="text"
              value={contact.address}
              onChange={(e) => setContact({ ...contact, address: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              data-testid="footer-contact-address"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Working Hours</label>
            <input
              type="text"
              value={contact.working_hours || ''}
              onChange={(e) => setContact({ ...contact, working_hours: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              placeholder="e.g. Mon-Sat: 6AM-10PM"
              data-testid="footer-contact-hours"
            />
          </div>
        </div>
      </div>

      {/* Social Media Links */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6" data-testid="footer-social-settings">
        <h2 className="font-heading font-bold text-white text-lg mb-4">Follow Us / Social Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {socialPlatforms.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-zinc-400 text-sm mb-2">{label}</label>
              <input
                type="text"
                value={social[key] || ''}
                onChange={(e) => setSocial({ ...social, [key]: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                placeholder={`https://${key}.com/...`}
                data-testid={`social-${key}`}
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-6 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50"
        data-testid="save-footer-btn"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Footer Settings
      </button>
    </div>
  );
}

// Reviews Tab Component (Google Reviews Config)
function ReviewsTab({ settings, onSave, saving }) {
  const [placeId, setPlaceId] = useState(settings?.google_place_id || '');
  const [apiKey, setApiKey] = useState(settings?.google_reviews_api_key || '');

  useEffect(() => {
    if (settings) {
      setPlaceId(settings.google_place_id || '');
      setApiKey(settings.google_reviews_api_key || '');
    }
  }, [settings]);

  return (
    <div className="space-y-6" data-testid="reviews-settings">
      <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6">
        <h2 className="font-heading font-bold text-white text-lg mb-2">Google Reviews Integration</h2>
        <p className="text-zinc-500 text-sm mb-6">Connect your Google Business to display customer reviews on the landing page. Reviews are cached and refreshed every 6 hours.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-2">Google Place ID</label>
            <input
              type="text"
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              placeholder="ChIJ..."
              data-testid="google-place-id"
            />
            <p className="text-zinc-600 text-xs mt-1">
              Find your Place ID at{' '}
              <a href="https://developers.google.com/maps/documentation/places/web-service/place-id" target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">
                Google Place ID Finder
              </a>
            </p>
          </div>

          <div>
            <label className="block text-zinc-400 text-sm mb-2">Google Maps API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
              placeholder="AIza..."
              data-testid="google-api-key"
            />
            <p className="text-zinc-600 text-xs mt-1">
              Must have Places API enabled.{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">
                Google Cloud Console
              </a>
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() => onSave({ google_place_id: placeId || null, google_reviews_api_key: apiKey || null })}
        disabled={saving}
        className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-6 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50"
        data-testid="save-reviews-btn"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Reviews Settings
      </button>
    </div>
  );
}

// Blogs Tab Component
function BlogsTab() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState({ open: false, data: null });
  const [saving, setSaving] = useState(false);
  const [blogLang, setBlogLang] = useState('en');
  const [form, setForm] = useState({
    title: '', slug: '', content_html: '', excerpt: '', featured_image: '', tags: [],
    status: 'draft', seo_title: '', seo_description: '', seo_keywords: '', og_image: '',
    translations: {},
  });
  const [tagInput, setTagInput] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await blogsAPI.list();
        setBlogs(res.data.blogs || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const openCreate = () => {
    setBlogLang('en');
    setForm({ title: '', slug: '', content_html: '', excerpt: '', featured_image: '', tags: [], status: 'draft', is_featured: false, seo_title: '', seo_description: '', seo_keywords: '', og_image: '', translations: {} });
    setDialog({ open: true, data: null });
  };

  const openEdit = (b) => {
    setBlogLang('en');
    setForm({
      title: b.title, slug: b.slug, content_html: b.content_html || '', excerpt: b.excerpt || '',
      featured_image: b.featured_image || '', tags: b.tags || [], status: b.status || 'draft', is_featured: b.is_featured || false,
      seo_title: b.seo_title || '', seo_description: b.seo_description || '', seo_keywords: b.seo_keywords || '', og_image: b.og_image || '',
      translations: b.translations || {},
    });
    setDialog({ open: true, data: b });
  };

  const getBT = (key) => {
    if (blogLang === 'en') return form?.[key] || '';
    return form?.translations?.[blogLang]?.[key] || '';
  };

  const setBT = (key, value) => {
    if (blogLang === 'en') {
      setForm({ ...form, [key]: value });
      return;
    }
    setForm({
      ...form,
      translations: {
        ...(form.translations || {}),
        [blogLang]: { ...(form.translations?.[blogLang] || {}), [key]: value },
      },
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      if (dialog.data) {
        const res = await blogsAPI.update(dialog.data.blog_id, form);
        setBlogs(blogs.map(b => b.blog_id === dialog.data.blog_id ? res.data : b));
        toast.success('Blog updated');
      } else {
        const res = await blogsAPI.create(form);
        setBlogs([res.data, ...blogs]);
        toast.success('Blog created');
      }
      setDialog({ open: false, data: null });
    } catch { toast.error('Failed to save blog'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this blog post?')) return;
    try {
      await blogsAPI.delete(id);
      setBlogs(blogs.filter(b => b.blog_id !== id));
      toast.success('Blog deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const addTag = () => {
    if (tagInput.trim() && !form.tags.includes(tagInput.trim())) {
      setForm({ ...form, tags: [...form.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-red-500" /></div>;

  return (
    <div data-testid="blogs-tab">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading font-bold text-white text-lg">Blog Posts ({blogs.length})</h2>
        <button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm flex items-center gap-2" data-testid="add-blog-btn">
          <Plus className="w-4 h-4" /> New Blog Post
        </button>
      </div>

      {blogs.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-12 text-center">
          <Newspaper className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500">No blog posts yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {blogs.map(b => (
            <div key={b.blog_id} className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 flex items-center justify-between" data-testid={`blog-${b.blog_id}`}>
              <div className="flex items-center gap-4 flex-1 min-w-0">
                {b.featured_image && (
                  isVideoUrl(b.featured_image) ? (
                    <video
                      src={resolveMediaUrl(b.featured_image)}
                      className="w-16 h-12 rounded-sm object-cover flex-shrink-0"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img src={resolveMediaUrl(b.featured_image)} alt="" className="w-16 h-12 rounded-sm object-cover flex-shrink-0" />
                  )
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{b.title}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-sm ${b.status === 'published' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{b.status}</span>
                  </div>
                  <p className="text-zinc-500 text-sm truncate">/blog/{b.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(b)} className="text-zinc-400 hover:text-white p-1.5" data-testid={`edit-blog-${b.blog_id}`}><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(b.blog_id)} className="text-zinc-400 hover:text-red-500 p-1.5" data-testid={`delete-blog-${b.blog_id}`}><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Blog Create/Edit Dialog */}
      <Dialog open={dialog.open} onOpenChange={o => !o && setDialog({ open: false, data: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-white uppercase">{dialog.data ? 'Edit Blog Post' : 'New Blog Post'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm text-zinc-400">Language</div>
              <LanguageTabs
                value={blogLang}
                onValueChange={setBlogLang}
                statusByLang={CMS_LANGS.reduce((acc, l) => {
                  const titleVal = l.code === 'en' ? (form.title || '') : (form.translations?.[l.code]?.title || '');
                  acc[l.code] = isNonEmptyText(titleVal) ? 'complete' : 'incomplete';
                  return acc;
                }, {})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Title *</label>
                <input type="text" value={getBT('title')} onChange={e => setBT('title', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" data-testid="blog-title" />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Slug</label>
                <input type="text" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="auto-generated from title" data-testid="blog-slug" />
              </div>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Excerpt</label>
              <textarea value={getBT('excerpt')} onChange={e => setBT('excerpt', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm resize-none" rows={2} data-testid="blog-excerpt" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Featured Image</label>
                <FileUpload value={form.featured_image} onChange={url => setForm({...form, featured_image: url})} />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Status</label>
                <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" data-testid="blog-status">
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <div className="mt-3 flex items-center gap-2">
                  <input type="checkbox" id="blog-featured" checked={form.is_featured || false} onChange={e => setForm({...form, is_featured: e.target.checked})} className="w-4 h-4 rounded-sm bg-zinc-950 border-zinc-800 text-red-600 focus:ring-red-600" />
                  <label htmlFor="blog-featured" className="text-zinc-400 text-sm select-none cursor-pointer">Featured Post</label>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Tags</label>
              <div className="flex gap-2 flex-wrap mb-2">
                {form.tags.map((t, i) => (
                  <span key={i} className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded-sm text-xs flex items-center gap-1">
                    {t} <button onClick={() => setForm({...form, tags: form.tags.filter((_, j) => j !== i)})} className="text-zinc-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} className="flex-1 bg-zinc-950 border border-zinc-800 text-white px-3 py-1 rounded-sm text-sm" placeholder="Add tag..." />
                <button onClick={addTag} className="bg-zinc-800 text-white px-3 py-1 rounded-sm text-sm">Add</button>
              </div>
            </div>
            <div>
              <label className="block text-zinc-400 text-sm mb-1">Content</label>
              <div className="bg-white rounded-sm text-black" data-testid="blog-editor">
                <ReactQuill theme="snow" value={getBT('content_html')} onChange={v => setBT('content_html', v)} style={{ minHeight: '250px', color: 'black' }} />
              </div>
            </div>

            {/* SEO Fields */}
            <div className="border-t border-zinc-800 pt-4">
              <h4 className="text-zinc-300 font-heading text-sm uppercase tracking-wider mb-3">SEO Settings</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">SEO Title</label>
                  <input type="text" value={getBT('seo_title')} onChange={e => setBT('seo_title', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" data-testid="blog-seo-title" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">SEO Description</label>
                  <textarea value={getBT('seo_description')} onChange={e => setBT('seo_description', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm resize-none" rows={2} data-testid="blog-seo-description" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">SEO Keywords</label>
                  <input type="text" value={getBT('seo_keywords')} onChange={e => setBT('seo_keywords', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="keyword1, keyword2" data-testid="blog-seo-keywords" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">OG Image URL</label>
                  <FileUpload value={form.og_image} onChange={url => setForm({...form, og_image: url})} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setDialog({ open: false, data: null })} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-sm">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50" data-testid="save-blog-btn">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {dialog.data ? 'Update' : 'Create'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Edit Dialog Component
function EditDialog({ dialog, setDialog, onCreate, onUpdate, saving }) {
  const [form, setForm] = useState({});
  const [htmlMode, setHtmlMode] = useState(false);
  const [transLang, setTransLang] = useState('en');

  useEffect(() => {
    setHtmlMode(false);
    setTransLang('en');
    if (dialog.type === 'discipline') {
      setForm(dialog.data || {
        name: '', slug: '', short_description: '', full_description: '',
        image_url: '', icon: '🥋', benefits: [], suitable_for: '', sort_order: 0, translations: {}
      });
    } else if (dialog.type === 'pricing') {
      setForm(dialog.data || {
        name: '', price: 0, currency: 'AED', billing_period: 'monthly', billing_cycle: 'monthly',
        membership_type: '', description: '', features: [], is_popular: false, sort_order: 0, freeze_max_days: 0, freeze_max_uses: 0, translations: {}
      });
    } else if (dialog.type === 'faq') {
      setForm(dialog.data || {
        question: '', answer: '', category: 'General', sort_order: 0, is_featured: false, translations: {}
      });
    } else if (dialog.type === 'page') {
      setForm(dialog.data || {
        title: '', slug: '', content: '', meta_description: '', translations: {}
      });
    }
  }, [dialog]);

  const cleanHtmlContent = (html) => {
    if (!html) return '';
    let cleaned = html;
    if (cleaned.includes('<!DOCTYPE html>') || cleaned.includes('<html')) {
      const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch && bodyMatch[1]) {
        cleaned = bodyMatch[1].trim();
      } else {
        // Fallback: remove common tags if no body tag found
        cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/i, '');
        cleaned = cleaned.replace(/<html[^>]*>|<\/html>/gi, '');
        cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
      }
    }
    return cleaned;
  };

  const getTr = (key) => {
    if (transLang === 'en') return form?.[key] || '';
    return form?.translations?.[transLang]?.[key] || '';
  };

  const setTr = (key, value) => {
    if (transLang === 'en') {
      setForm({ ...form, [key]: value });
      return;
    }
    setForm({
      ...form,
      translations: {
        ...(form.translations || {}),
        [transLang]: { ...(form.translations?.[transLang] || {}), [key]: value },
      },
    });
  };

  const getTrArr = (key) => {
    if (transLang === 'en') return Array.isArray(form?.[key]) ? form[key] : [];
    const v = form?.translations?.[transLang]?.[key];
    return Array.isArray(v) ? v : [];
  };

  const setTrArr = (key, value) => {
    if (transLang === 'en') {
      setForm({ ...form, [key]: Array.isArray(value) ? value : [] });
      return;
    }
    setForm({
      ...form,
      translations: {
        ...(form.translations || {}),
        [transLang]: { ...(form.translations?.[transLang] || {}), [key]: Array.isArray(value) ? value : [] },
      },
    });
  };

  const handleSubmit = () => {
    let finalForm = { ...form };

    if (dialog.type === 'pricing') {
      if (!finalForm.membership_type) {
        toast.error('Membership Type is required');
        return;
      }
    }

    const cleanTranslationsHtmlField = (translations, field) => {
      if (!translations || typeof translations !== 'object') return translations;
      const out = { ...translations };
      Object.keys(out).forEach((lang) => {
        const t = out[lang];
        if (!t || typeof t !== 'object') return;
        if (typeof t[field] !== 'string' || !t[field]) return;
        out[lang] = { ...t, [field]: cleanHtmlContent(t[field]) };
      });
      return out;
    };
    
    // Clean HTML content for pages before saving
    if (dialog.type === 'page' && finalForm.content) {
      finalForm.content = cleanHtmlContent(finalForm.content);
      finalForm.translations = cleanTranslationsHtmlField(finalForm.translations, 'content');
    }
    
    // Clean full_description for disciplines as well just in case
    if (dialog.type === 'discipline' && finalForm.full_description) {
      finalForm.full_description = cleanHtmlContent(finalForm.full_description);
      finalForm.translations = cleanTranslationsHtmlField(finalForm.translations, 'full_description');
    }

    if (dialog.data) {
      const id = dialog.type === 'discipline' ? dialog.data.discipline_id :
                 dialog.type === 'pricing' ? dialog.data.plan_id :
                 dialog.type === 'faq' ? dialog.data.faq_id :
                 dialog.data.page_id;
      onUpdate(dialog.type, id, finalForm);
    } else {
      onCreate(dialog.type, finalForm);
    }
  };

  const title = dialog.data ? 'Edit' : 'Add';
  const typeLabel = dialog.type === 'discipline' ? 'Discipline' :
                    dialog.type === 'pricing' ? 'Pricing Plan' :
                    dialog.type === 'faq' ? 'FAQ' : 'Page';

  return (
    <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false, type: null, data: null })}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-white uppercase">{title} {typeLabel}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {dialog.type === 'discipline' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-zinc-400">Language</div>
                <LanguageTabs
                  value={transLang}
                  onValueChange={setTransLang}
                  statusByLang={CMS_LANGS.reduce((acc, l) => {
                    const nameVal = l.code === 'en' ? (form.name || '') : (form.translations?.[l.code]?.name || '');
                    const shortVal = l.code === 'en' ? (form.short_description || '') : (form.translations?.[l.code]?.short_description || '');
                    acc[l.code] = isNonEmptyText(nameVal) && isNonEmptyText(shortVal) ? 'complete' : 'incomplete';
                    return acc;
                  }, {})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Name</label>
                  <input
                    type="text"
                    value={getTr('name')}
                    onChange={(e) => setTr('name', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Icon (emoji)</label>
                  <input
                    type="text"
                    value={form.icon || ''}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-2">Short Description</label>
                <input
                  type="text"
                  value={getTr('short_description')}
                  onChange={(e) => setTr('short_description', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-2">Full Description (HTML)</label>
                <div className="bg-white rounded-sm text-black">
                  <ReactQuill
                    theme="snow"
                    value={getTr('full_description')}
                    onChange={(value) => setTr('full_description', value)}
                    style={{ color: 'black' }}
                  />
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-2">Image</label>
                <FileUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-2">Benefits (comma separated)</label>
                <input
                  type="text"
                  value={getTrArr('benefits').join(', ')}
                  onChange={(e) => setTrArr('benefits', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Suitable For</label>
                  <input
                    type="text"
                    value={getTr('suitable_for')}
                    onChange={(e) => setTr('suitable_for', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order || 0}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
              </div>
            </>
          )}

          {dialog.type === 'pricing' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-zinc-400">Language</div>
                <LanguageTabs
                  value={transLang}
                  onValueChange={setTransLang}
                  statusByLang={CMS_LANGS.reduce((acc, l) => {
                    const nameVal = l.code === 'en' ? (form.name || '') : (form.translations?.[l.code]?.name || '');
                    const descVal = l.code === 'en' ? (form.description || '') : (form.translations?.[l.code]?.description || '');
                    acc[l.code] = isNonEmptyText(nameVal) && isNonEmptyText(descVal) ? 'complete' : 'incomplete';
                    return acc;
                  }, {})}
                />
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Plan Name</label>
                  <input
                    type="text"
                    value={getTr('name')}
                    onChange={(e) => setTr('name', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Price</label>
                  <input
                    type="number"
                    value={form.price || 0}
                    onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Currency</label>
                  <input
                    type="text"
                    value={form.currency || 'AED'}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Billing Cycle</label>
                  <select
                    value={(() => {
                      const v = (form.billing_cycle?.toLowerCase() || form.billing_period?.toLowerCase() || 'monthly');
                      return v === 'quarterly' ? '3 months' : v;
                    })()}
                    onChange={(e) => setForm({ ...form, billing_period: e.target.value, billing_cycle: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  >
                    <option value="per class">Per Class</option>
                    <option value="monthly">Monthly</option>
                    <option value="3 months">3 Months</option>
                    <option value="4 months">4 Months</option>
                    <option value="6 months">6 Months</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Membership Type</label>
                  <select
                    value={form.membership_type || ''}
                    onChange={(e) => setForm({ ...form, membership_type: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  >
                    <option value="" disabled>Select membership type</option>
                    <option value="full_access">Full Access</option>
                    <option value="only_gym">Only Gym</option>
                    <option value="kids">Kids</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-2">Description</label>
                <input
                  type="text"
                  value={getTr('description')}
                  onChange={(e) => setTr('description', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-2">Features (comma separated)</label>
                <textarea
                  value={getTrArr('features').join(', ')}
                  onChange={(e) => setTrArr('features', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  rows={3}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Freeze Period (Days)</label>
                  <p className="text-[10px] text-zinc-500 mb-2">Total number of freeze days allowed for this plan</p>
                  <input
                    type="number"
                    min="0"
                    value={form.freeze_max_days || 0}
                    onChange={(e) => setForm({ ...form, freeze_max_days: parseInt(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Freeze Uses</label>
                  <p className="text-[10px] text-zinc-500 mb-2">Total number of separate freeze requests allowed</p>
                  <input
                    type="number"
                    min="0"
                    value={form.freeze_max_uses || 0}
                    onChange={(e) => setForm({ ...form, freeze_max_uses: parseInt(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-zinc-400">
                  <input
                    type="checkbox"
                    checked={form.is_popular || false}
                    onChange={(e) => setForm({ ...form, is_popular: e.target.checked })}
                    className="rounded border-zinc-700"
                  />
                  Mark as Popular
                </label>
                <div className="flex-1">
                  <label className="block text-zinc-400 text-sm mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order || 0}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-20 bg-zinc-950 border border-zinc-800 text-white px-3 py-1 rounded-sm"
                  />
                </div>
              </div>
            </>
          )}

          {dialog.type === 'faq' && (
            <>
              <div>
                <div className="flex items-center justify-between gap-4 mb-2">
                  <label className="block text-zinc-400 text-sm">Question</label>
                  <LanguageTabs
                    value={transLang}
                    onValueChange={setTransLang}
                    statusByLang={CMS_LANGS.reduce((acc, l) => {
                      const q = l.code === 'en' ? (form.question || '') : (form.translations?.[l.code]?.question || '');
                      const a = l.code === 'en' ? (form.answer || '') : (form.translations?.[l.code]?.answer || '');
                      acc[l.code] = isNonEmptyText(q) && isNonEmptyText(a) ? 'complete' : 'incomplete';
                      return acc;
                    }, {})}
                  />
                </div>
                <input
                  type="text"
                  value={getTr('question')}
                  onChange={(e) => setTr('question', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-2">Answer</label>
                <textarea
                  value={getTr('answer')}
                  onChange={(e) => setTr('answer', e.target.value)}
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Category</label>
                  <input
                    type="text"
                    value={form.category || 'General'}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order || 0}
                    onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="faq-featured"
                  checked={form.is_featured || false}
                  onChange={e => setForm({ ...form, is_featured: e.target.checked })}
                  className="w-4 h-4 rounded-sm bg-zinc-950 border-zinc-800 text-red-600 focus:ring-red-600"
                />
                <label htmlFor="faq-featured" className="text-zinc-400 text-sm select-none cursor-pointer">
                  Featured FAQ
                </label>
              </div>
            </>
          )}

          {dialog.type === 'page' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-zinc-400">Language</div>
                <LanguageTabs
                  value={transLang}
                  onValueChange={setTransLang}
                  statusByLang={CMS_LANGS.reduce((acc, l) => {
                    const titleVal = l.code === 'en' ? (form.title || '') : (form.translations?.[l.code]?.title || '');
                    const contentVal = l.code === 'en' ? (form.content || '') : (form.translations?.[l.code]?.content || '');
                    acc[l.code] = isNonEmptyText(titleVal) && isNonEmptyText(contentVal) ? 'complete' : 'incomplete';
                    return acc;
                  }, {})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Title</label>
                  <input
                    type="text"
                    value={getTr('title')}
                    onChange={(e) => setTr('title', e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-2">Slug (URL)</label>
                  <input
                    type="text"
                    value={form.slug || ''}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-2">Meta Description</label>
                <input
                  type="text"
                  value={getTr('meta_description')}
                  onChange={(e) => setTr('meta_description', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-zinc-400 text-sm">Content</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${!htmlMode ? 'text-white font-medium' : 'text-zinc-500'}`}>Rich Text</span>
                    <button
                      type="button"
                      onClick={() => setHtmlMode(!htmlMode)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${htmlMode ? 'bg-red-600' : 'bg-zinc-700'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${htmlMode ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                    <span className={`text-xs ${htmlMode ? 'text-white font-medium' : 'text-zinc-500'}`}>HTML Source</span>
                  </div>
                </div>
                <div className="bg-white rounded-sm text-black">
                  {htmlMode ? (
                    <textarea
                      value={getTr('content')}
                      onChange={(e) => setTr('content', e.target.value)}
                      className="w-full h-full min-h-[300px] p-4 text-black font-mono text-sm border-0 focus:ring-0 resize-y"
                      placeholder="<p>Enter your raw HTML here...</p>"
                    />
                  ) : (
                    <ReactQuill
                      theme="snow"
                      value={getTr('content')}
                      onChange={(value) => setTr('content', value)}
                      modules={{
                        clipboard: {
                          matchVisual: false // prevents Quill from stripping/modifying pasted HTML too aggressively
                        }
                      }}
                      style={{ minHeight: '300px', color: 'black' }}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => setDialog({ open: false, type: null, data: null })}
            className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {dialog.data ? 'Update' : 'Create'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
