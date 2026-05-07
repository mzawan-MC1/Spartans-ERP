import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Save, ShieldCheck, CheckCircle2, CreditCard, Link as LinkIcon, Power, PowerOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import api, { authAPI } from '@/lib/api';
import TopNav from '@/components/TopNav';

export default function PaymentGatewaysPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [gateways, setGateways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    const loadUserAndGateways = async () => {
      try {
        const meRes = await authAPI.getMe();
        if (meRes.data.role !== 'OWNER' && meRes.data.role !== 'OWNER_FULL') {
          navigate('/dashboard');
          return;
        }
        setUser(meRes.data);
        
        const res = await api.get('/admin/payment-gateways');
        setGateways(res.data);
      } catch (err) {
        toast.error('Failed to load payment gateways');
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    
    loadUserAndGateways();
  }, [navigate]);

  const updateGateway = (provider, field, value) => {
    setGateways(prev => prev.map(g => 
      g.provider === provider ? { ...g, [field]: value } : g
    ));
  };

  const toggleExpand = (provider) => {
    setExpanded(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const handleSave = async (gateway) => {
    try {
      setSaving(true);
      await api.patch(`/admin/payment-gateways/${gateway.provider}`, gateway);
      toast.success(`${gateway.display_name} settings saved successfully`);
      
      // Reload list to ensure UI matches DB exactly
      const res = await api.get('/admin/payment-gateways');
      setGateways(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || `Failed to save ${gateway.display_name}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-red-500/30">
        <TopNav user={user} />
        <div className="p-8 text-center text-zinc-500">Loading gateway settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-red-500/30">
      <TopNav user={user} />
      <div className="p-6 sm:p-8 lg:p-10 max-w-[1200px] mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-zinc-400 hover:text-white">
            ← Back to Dashboard
          </Button>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white font-heading tracking-tight uppercase">Payment Gateways</h1>
          <p className="text-zinc-400 text-sm mt-1">Configure active payment methods and API keys for the system.</p>
        </div>

        <div className="grid gap-6">
          {gateways.map((gw) => {
            const isExpanded = expanded[gw.provider] || false;
            return (
              <Card key={gw.provider} className={`bg-zinc-900 border-zinc-800 transition-all ${!gw.is_active ? 'opacity-75' : ''}`}>
                <CardHeader 
                  className={`pb-4 flex flex-row items-start justify-between cursor-pointer hover:bg-zinc-800/30 transition-colors ${isExpanded ? 'border-b border-zinc-800/50' : ''}`}
                  onClick={() => toggleExpand(gw.provider)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${gw.is_active ? 'bg-red-500/20 text-red-500' : 'bg-zinc-800 text-zinc-500'}`}>
                      <CreditCard className="h-6 w-6" />
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {gw.display_name}
                        {gw.is_active && <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] h-5 px-1.5">Active</Badge>}
                        {gw.is_sandbox && gw.is_active && <Badge variant="outline" className="text-yellow-500 border-yellow-500/30 text-[10px] h-5 px-1.5">Sandbox</Badge>}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <CardDescription className="text-xs text-zinc-500 font-mono">
                          Webhook: /api/payments/webhook/{gw.provider}
                        </CardDescription>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-5 px-2 text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            const backendUrl = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '')
                              || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');
                            const origin = backendUrl || window.location.origin;
                            const url = `${origin}/api/payments/webhook/${gw.provider}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Webhook URL copied to clipboard');
                          }}
                        >
                          Copy URL
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="text-sm font-medium text-zinc-400">{gw.is_active ? 'Enabled' : 'Disabled'}</span>
                      <Switch 
                        checked={gw.is_active} 
                        onCheckedChange={(val) => updateGateway(gw.provider, 'is_active', val)} 
                      />
                    </div>
                    {isExpanded ? <ChevronUp className="h-5 w-5 text-zinc-500" /> : <ChevronDown className="h-5 w-5 text-zinc-500" />}
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-zinc-400">Display Name</label>
                    <Input 
                      value={gw.display_name || ''} 
                      onChange={(e) => updateGateway(gw.provider, 'display_name', e.target.value)}
                      className="bg-zinc-950 border-zinc-800"
                    />
                  </div>
                  <div className="space-y-2 flex flex-col justify-end">
                    <div className="flex items-center gap-2 h-10 px-3 bg-zinc-950 border border-zinc-800 rounded-md w-fit">
                      <Switch 
                        checked={gw.is_sandbox} 
                        onCheckedChange={(val) => updateGateway(gw.provider, 'is_sandbox', val)} 
                      />
                      <span className="text-sm text-zinc-300">Sandbox Mode</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-zinc-400">Sort Order</label>
                  <Input 
                    type="number"
                    value={gw.sort_order || 0} 
                    onChange={(e) => updateGateway(gw.provider, 'sort_order', parseInt(e.target.value))}
                    className="bg-zinc-950 border-zinc-800 w-32"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1"><LinkIcon className="h-3 w-3"/> Public Key</label>
                    <Input 
                      value={gw.public_key || ''} 
                      onChange={(e) => updateGateway(gw.provider, 'public_key', e.target.value)}
                      className="bg-zinc-950 border-zinc-800 font-mono text-sm"
                      placeholder="pk_test_..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3"/> Secret Key</label>
                    <Input 
                      type="password"
                      value={gw.secret_key || ''} 
                      onChange={(e) => updateGateway(gw.provider, 'secret_key', e.target.value)}
                      className="bg-zinc-950 border-zinc-800 font-mono text-sm"
                      placeholder="sk_test_..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3"/> Webhook Secret</label>
                    <Input 
                      type="password"
                      value={gw.webhook_secret || ''} 
                      onChange={(e) => updateGateway(gw.provider, 'webhook_secret', e.target.value)}
                      className="bg-zinc-950 border-zinc-800 font-mono text-sm"
                      placeholder="whsec_..."
                    />
                  </div>
                  {(gw.provider === 'network_international' || gw.provider === 'custom') && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400 flex items-center gap-1"><ShieldCheck className="h-3 w-3"/> Merchant ID</label>
                      <Input 
                        value={gw.merchant_id || ''} 
                        onChange={(e) => updateGateway(gw.provider, 'merchant_id', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 font-mono text-sm"
                        placeholder="Merchant ID..."
                      />
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-zinc-800/50">
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Advanced Routing & Endpoints</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Gateway Base URL</label>
                      <Input 
                        value={gw.gateway_base_url || ''} 
                        onChange={(e) => updateGateway(gw.provider, 'gateway_base_url', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm"
                        placeholder="e.g. https://api.gateway.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">API Version</label>
                      <Input 
                        value={gw.api_version || ''} 
                        onChange={(e) => updateGateway(gw.provider, 'api_version', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm"
                        placeholder="e.g. v1"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Success Return URL</label>
                      <Input 
                        value={gw.success_return_url || ''} 
                        onChange={(e) => updateGateway(gw.provider, 'success_return_url', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm"
                        placeholder="Leave blank for auto-routing"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Cancel / Timeout Return URL</label>
                      <Input 
                        value={gw.cancel_return_url || ''} 
                        onChange={(e) => updateGateway(gw.provider, 'cancel_return_url', e.target.value)}
                        className="bg-zinc-950 border-zinc-800 text-sm"
                        placeholder="Leave blank for auto-routing"
                      />
                    </div>
                  </div>
                </div>

                {gw.provider === 'custom' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-zinc-950 rounded-lg border border-zinc-800 mt-4">
                    <div className="space-y-2 md:col-span-3">
                      <label className="text-xs font-medium text-zinc-400">API Base URL</label>
                      <Input 
                        value={gw.api_base_url || ''} 
                        onChange={(e) => updateGateway(gw.provider, 'api_base_url', e.target.value)}
                        className="bg-zinc-900 border-zinc-700"
                        placeholder="https://api.custom-gateway.com/v1"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Success Status Value</label>
                      <Input 
                        value={gw.success_status_mapping || ''} 
                        onChange={(e) => updateGateway(gw.provider, 'success_status_mapping', e.target.value)}
                        className="bg-zinc-900 border-zinc-700"
                        placeholder="e.g. SUCCESS"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Failure Status Value</label>
                      <Input 
                        value={gw.failure_status_mapping || ''} 
                        onChange={(e) => updateGateway(gw.provider, 'failure_status_mapping', e.target.value)}
                        className="bg-zinc-900 border-zinc-700"
                        placeholder="e.g. FAILED"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={() => handleSave(gw)} 
                    disabled={saving}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save {gw.display_name}
                  </Button>
                </div>
              </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
