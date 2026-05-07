import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { seoAPI, authAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Code, Globe, FileText } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PAGES = [
  { path: '/', label: 'Home' },
  { path: '/disciplines', label: 'Disciplines' },
  { path: '/pricing', label: 'Pricing' },
  { path: '/branches', label: 'Locations' },
  { path: '/faqs', label: 'FAQs' },
  { path: '/contact', label: 'Contact' },
  { path: '/blog', label: 'Blog' },
];

export default function SEOSettingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [pages, setPages] = useState([]);
  const [globalSeo, setGlobalSeo] = useState({ head_code: '', body_code: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedPage, setSelectedPage] = useState('/');
  const [form, setForm] = useState({ page_title: '', meta_description: '', meta_keywords: '', head_code: '', body_code: '' });

  useEffect(() => {
    (async () => {
      try {
        const meRes = await authAPI.getMe();
        if (meRes.data.role !== 'OWNER') { navigate('/dashboard'); return; }
        setUser(meRes.data);
        const seoRes = await seoAPI.list();
        setPages(seoRes.data.pages || []);
        setGlobalSeo(seoRes.data.global_seo || { head_code: '', body_code: '' });
      } catch {
        navigate('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    const existing = pages.find(p => p.page_path === selectedPage);
    setForm({
      page_title: existing?.page_title || '',
      meta_description: existing?.meta_description || '',
      meta_keywords: existing?.meta_keywords || '',
      head_code: existing?.head_code || '',
      body_code: existing?.body_code || '',
    });
  }, [selectedPage, pages]);

  const handleSavePage = async () => {
    setSaving(true);
    try {
      const res = await seoAPI.updatePage({ page_path: selectedPage, ...form });
      setPages(prev => {
        const idx = prev.findIndex(p => p.page_path === selectedPage);
        if (idx >= 0) { const u = [...prev]; u[idx] = res.data; return u; }
        return [...prev, res.data];
      });
      toast.success(`SEO saved for ${selectedPage}`);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleSaveGlobal = async () => {
    setSaving(true);
    try {
      const res = await seoAPI.updateGlobal(globalSeo);
      setGlobalSeo(res.data);
      toast.success('Global code snippets saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-red-500" /></div>;

  return (
    <div className="min-h-screen bg-black">
      <TopNav user={user} />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/dashboard')} className="text-zinc-500 hover:text-white p-1" data-testid="back-btn"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-heading font-extrabold text-white text-2xl uppercase tracking-tight">SEO Settings</h1>
        </div>

        <Tabs defaultValue="pages">
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1 mb-6">
            <TabsTrigger value="pages" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="seo-tab-pages">
              <FileText className="w-4 h-4 mr-2" /> Per-Page SEO
            </TabsTrigger>
            <TabsTrigger value="global" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="seo-tab-global">
              <Code className="w-4 h-4 mr-2" /> Global Code Snippets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pages">
            <div className="flex gap-6">
              <div className="w-48 space-y-1 flex-shrink-0">
                {PAGES.map(p => (
                  <button
                    key={p.path}
                    onClick={() => setSelectedPage(p.path)}
                    className={`w-full text-left px-3 py-2 rounded-sm text-sm transition-colors ${selectedPage === p.path ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}
                    data-testid={`seo-page-${p.path.replace('/', '') || 'home'}`}
                  >
                    <Globe className="w-3.5 h-3.5 inline mr-2" />{p.label}
                    {pages.find(pg => pg.page_path === p.path) && <span className="ml-1 text-green-400 text-xs">*</span>}
                  </button>
                ))}
              </div>
              <div className="flex-1 space-y-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6 space-y-4">
                  <h3 className="font-heading text-white text-sm uppercase tracking-wider mb-4">Meta Tags for {PAGES.find(p => p.path === selectedPage)?.label}</h3>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Page Title</label>
                    <input type="text" value={form.page_title} onChange={e => setForm({...form, page_title: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="Page title for search engines" data-testid="seo-page-title" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Meta Description</label>
                    <textarea value={form.meta_description} onChange={e => setForm({...form, meta_description: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm resize-none" rows={3} placeholder="Brief page description for search results" data-testid="seo-meta-description" />
                    <p className="text-zinc-600 text-xs mt-1">{(form.meta_description || '').length}/160 characters</p>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Keywords</label>
                    <input type="text" value={form.meta_keywords} onChange={e => setForm({...form, meta_keywords: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="keyword1, keyword2, keyword3" data-testid="seo-keywords" />
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6 space-y-4">
                  <h3 className="font-heading text-white text-sm uppercase tracking-wider mb-4">Page-specific Code Snippets</h3>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Head Code (injected in &lt;head&gt;)</label>
                    <textarea value={form.head_code} onChange={e => setForm({...form, head_code: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm font-mono text-xs resize-none" rows={4} placeholder="<!-- Analytics, meta tags, etc. -->" data-testid="seo-head-code" />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-sm mb-1">Body Code (injected before &lt;/body&gt;)</label>
                    <textarea value={form.body_code} onChange={e => setForm({...form, body_code: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm font-mono text-xs resize-none" rows={4} placeholder="<!-- Scripts, widgets, etc. -->" data-testid="seo-body-code" />
                  </div>
                </div>
                <button onClick={handleSavePage} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-6 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50" data-testid="save-page-seo-btn">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Page SEO
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="global">
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6 space-y-4">
              <p className="text-zinc-500 text-sm mb-4">These code snippets are injected on every page. Use for Google Analytics, Facebook Pixel, etc.</p>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Global Head Code (all pages)</label>
                <textarea value={globalSeo.head_code || ''} onChange={e => setGlobalSeo({...globalSeo, head_code: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm font-mono text-xs resize-none" rows={8} placeholder="<!-- Google Analytics, etc. -->" data-testid="global-head-code" />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Global Body Code (all pages)</label>
                <textarea value={globalSeo.body_code || ''} onChange={e => setGlobalSeo({...globalSeo, body_code: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm font-mono text-xs resize-none" rows={8} placeholder="<!-- Chat widgets, scripts, etc. -->" data-testid="global-body-code" />
              </div>
              <button onClick={handleSaveGlobal} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-6 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50" data-testid="save-global-seo-btn">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Global Snippets
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
