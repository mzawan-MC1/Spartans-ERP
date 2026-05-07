import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { emailAPI, authAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Save, Plus, Pencil, Trash2, Eye, Mail, Server, FileText, Copy } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

export default function EmailSettingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // SMTP
  const [smtp, setSmtp] = useState({ host: '', port: 587, username: '', password: '', use_tls: true, from_email: '', from_name: '' });
  // Templates
  const [templates, setTemplates] = useState([]);
  const [variables, setVariables] = useState([]);
  const [dialog, setDialog] = useState({ open: false, data: null });
  const [preview, setPreview] = useState({ open: false, data: null });
  const [form, setForm] = useState({ name: '', subject: '', body_html: '', variables: [], category: 'custom', is_active: true });

  useEffect(() => {
    (async () => {
      try {
        const meRes = await authAPI.getMe();
        if (meRes.data.role !== 'OWNER') { navigate('/dashboard'); return; }
        setUser(meRes.data);
        const [smtpRes, tmplRes, varsRes] = await Promise.all([
          emailAPI.getSMTP().catch(() => ({ data: {} })),
          emailAPI.listTemplates().catch(() => ({ data: { templates: [] } })),
          emailAPI.getVariables().catch(() => ({ data: { variables: [] } })),
        ]);
        setSmtp({ host: '', port: 587, username: '', password: '', use_tls: true, from_email: '', from_name: '', ...smtpRes.data });
        setTemplates(tmplRes.data.templates || []);
        setVariables(varsRes.data.variables || []);
      } catch { navigate('/login'); }
      finally { setLoading(false); }
    })();
  }, [navigate]);

  const handleSaveSMTP = async () => {
    setSaving(true);
    try {
      const res = await emailAPI.updateSMTP(smtp);
      setSmtp(res.data);
      toast.success('SMTP configuration saved');
    } catch { toast.error('Failed to save SMTP'); }
    finally { setSaving(false); }
  };

  const handleTestSMTP = async () => {
    try {
      const res = await emailAPI.testSMTP();
      toast.success(res.data.message);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'SMTP test failed');
    }
  };

  const openCreate = () => {
    setForm({ name: '', subject: '', body_html: '', variables: [], category: 'custom', is_active: true });
    setDialog({ open: true, data: null });
  };

  const openEdit = (t) => {
    setForm({ name: t.name, subject: t.subject, body_html: t.body_html || '', variables: t.variables || [], category: t.category || 'custom', is_active: t.is_active !== false });
    setDialog({ open: true, data: t });
  };

  const handleSaveTemplate = async () => {
    if (!form.name.trim() || !form.subject.trim()) { toast.error('Name and subject required'); return; }
    setSaving(true);
    try {
      if (dialog.data) {
        const res = await emailAPI.updateTemplate(dialog.data.template_id, form);
        setTemplates(templates.map(t => t.template_id === dialog.data.template_id ? res.data : t));
        toast.success('Template updated');
      } else {
        const res = await emailAPI.createTemplate(form);
        setTemplates([res.data, ...templates]);
        toast.success('Template created');
      }
      setDialog({ open: false, data: null });
    } catch { toast.error('Failed to save template'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await emailAPI.deleteTemplate(id);
      setTemplates(templates.filter(t => t.template_id !== id));
      toast.success('Template deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const copyVar = (key) => {
    navigator.clipboard.writeText(key);
    toast.success(`Copied ${key}`);
  };

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-red-500" /></div>;

  return (
    <div className="min-h-screen bg-black">
      <TopNav user={user} />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/dashboard')} className="text-zinc-500 hover:text-white p-1" data-testid="back-btn"><ArrowLeft className="w-5 h-5" /></button>
          <h1 className="font-heading font-extrabold text-white text-2xl uppercase tracking-tight">Email Settings</h1>
        </div>

        <Tabs defaultValue="smtp">
          <TabsList className="bg-zinc-900 border border-zinc-800 p-1 mb-6">
            <TabsTrigger value="smtp" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="email-tab-smtp">
              <Server className="w-4 h-4 mr-2" /> SMTP Configuration
            </TabsTrigger>
            <TabsTrigger value="templates" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="email-tab-templates">
              <FileText className="w-4 h-4 mr-2" /> Templates
            </TabsTrigger>
            <TabsTrigger value="variables" className="data-[state=active]:bg-red-600 data-[state=active]:text-white" data-testid="email-tab-variables">
              <Copy className="w-4 h-4 mr-2" /> Variable Registry
            </TabsTrigger>
          </TabsList>

          {/* SMTP Tab */}
          <TabsContent value="smtp">
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6 space-y-4">
              <h3 className="font-heading text-white text-sm uppercase tracking-wider mb-4">SMTP Server</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">SMTP Host</label>
                  <input type="text" value={smtp.host} onChange={e => setSmtp({...smtp, host: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="smtp.gmail.com" data-testid="smtp-host" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Port</label>
                  <input type="number" value={smtp.port} onChange={e => setSmtp({...smtp, port: parseInt(e.target.value) || 587})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" data-testid="smtp-port" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Username</label>
                  <input type="text" value={smtp.username} onChange={e => setSmtp({...smtp, username: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" data-testid="smtp-username" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Password</label>
                  <input type="password" value={smtp.password} onChange={e => setSmtp({...smtp, password: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" data-testid="smtp-password" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">From Email</label>
                  <input type="email" value={smtp.from_email} onChange={e => setSmtp({...smtp, from_email: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="noreply@yourgym.com" data-testid="smtp-from-email" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">From Name</label>
                  <input type="text" value={smtp.from_name} onChange={e => setSmtp({...smtp, from_name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="Spartans Gym" data-testid="smtp-from-name" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-zinc-400 text-sm cursor-pointer mt-2">
                <input type="checkbox" checked={smtp.use_tls} onChange={e => setSmtp({...smtp, use_tls: e.target.checked})} className="rounded-sm" data-testid="smtp-tls" />
                Use TLS encryption
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveSMTP} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-6 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50" data-testid="save-smtp-btn">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save SMTP
                </button>
                <button onClick={handleTestSMTP} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-sm flex items-center gap-2" data-testid="test-smtp-btn">
                  <Mail className="w-4 h-4" /> Send Test Email
                </button>
              </div>
            </div>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-white text-lg uppercase">Email Templates</h3>
              <button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white font-heading uppercase tracking-wide px-4 py-2 rounded-sm text-sm flex items-center gap-2" data-testid="add-template-btn">
                <Plus className="w-4 h-4" /> New Template
              </button>
            </div>
            <div className="space-y-3">
              {templates.length === 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-12 text-center">
                  <Mail className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500">No email templates yet</p>
                </div>
              )}
              {templates.map(t => (
                <div key={t.template_id} className="bg-zinc-900 border border-zinc-800 rounded-sm p-4 flex items-center justify-between" data-testid={`template-${t.template_id}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{t.name}</span>
                      <Badge className={t.category === 'custom' ? 'bg-zinc-800 text-zinc-400' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}>{t.category}</Badge>
                      {!t.is_active && <Badge className="bg-zinc-800 text-zinc-500">Inactive</Badge>}
                    </div>
                    <p className="text-zinc-500 text-sm mt-1">Subject: {t.subject}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPreview({ open: true, data: t })} className="text-zinc-400 hover:text-white p-1.5"><Eye className="w-4 h-4" /></button>
                    <button onClick={() => openEdit(t)} className="text-zinc-400 hover:text-white p-1.5" data-testid={`edit-template-${t.template_id}`}><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(t.template_id)} className="text-zinc-400 hover:text-red-500 p-1.5" data-testid={`delete-template-${t.template_id}`}><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* Variables Tab */}
          <TabsContent value="variables">
            <div className="bg-zinc-900 border border-zinc-800 rounded-sm p-6">
              <h3 className="font-heading text-white text-sm uppercase tracking-wider mb-4">Available Template Variables</h3>
              <p className="text-zinc-500 text-sm mb-6">Click to copy. Use these variables in your email templates — they will be replaced with actual data when sending.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {variables.map(v => (
                  <button key={v.key} onClick={() => copyVar(v.key)} className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors text-left group" data-testid={`var-${v.key}`}>
                    <div>
                      <code className="text-red-400 text-sm">{v.key}</code>
                      <p className="text-zinc-500 text-xs mt-0.5">{v.description}</p>
                    </div>
                    <Copy className="w-3.5 h-3.5 text-zinc-600 group-hover:text-white" />
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Template Dialog */}
        <Dialog open={dialog.open} onOpenChange={o => !o && setDialog({ open: false, data: null })}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-white uppercase">{dialog.data ? 'Edit Template' : 'New Template'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Template Name *</label>
                  <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="Welcome Email" data-testid="template-name" />
                </div>
                <div>
                  <label className="block text-zinc-400 text-sm mb-1">Category</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" data-testid="template-category">
                    <option value="custom">Custom</option>
                    <option value="welcome">Welcome</option>
                    <option value="membership">Membership</option>
                    <option value="payment">Payment</option>
                    <option value="reminder">Reminder</option>
                    <option value="notification">Notification</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Subject Line *</label>
                <input type="text" value={form.subject} onChange={e => setForm({...form, subject: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 text-white px-4 py-2 rounded-sm" placeholder="Welcome to {{gym_name}}" data-testid="template-subject" />
              </div>
              <div>
                <label className="block text-zinc-400 text-sm mb-1">Email Body</label>
                <div className="bg-white rounded-sm text-black" data-testid="template-editor">
                  <ReactQuill theme="snow" value={form.body_html} onChange={v => setForm({...form, body_html: v})} style={{ minHeight: '200px', color: 'black' }} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <button onClick={() => setDialog({ open: false, data: null })} className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-sm">Cancel</button>
              <button onClick={handleSaveTemplate} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-sm flex items-center gap-2 disabled:opacity-50" data-testid="save-template-btn">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {dialog.data ? 'Update' : 'Create'}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog open={preview.open} onOpenChange={o => !o && setPreview({ open: false, data: null })}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-heading text-white uppercase">{preview.data?.name}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="text-zinc-400 text-sm mb-4">Subject: <span className="text-white">{preview.data?.subject}</span></p>
              <div className="prose prose-sm prose-invert max-w-none text-zinc-300" dangerouslySetInnerHTML={{ __html: preview.data?.body_html || '<em>No content</em>' }} />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
