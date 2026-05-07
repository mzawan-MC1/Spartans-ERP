import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authAPI, seedAPI, publicAPI } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react';
import PublicLayout from '@/components/PublicLayout';

const resolveImage = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  const backendUrl = (process.env.REACT_APP_BACKEND_URL || '').trim().replace(/\/$/, '')
    || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000');
  return `${backendUrl}${url}`;
};

export default function LoginPage() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [siteSettings, setSiteSettings] = useState(null);

  // Load saved email if rememberMe was previously checked
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setForm(prev => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    const emailFromRedirect = routeLocation.state?.email;
    if (emailFromRedirect && typeof emailFromRedirect === 'string') {
      setForm(prev => ({ ...prev, email: emailFromRedirect }));
      setIsLogin(true);
    }
  }, [routeLocation.state]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await publicAPI.getSiteSettings();
        setSiteSettings(data);
      } catch (err) {
        console.error('Failed to load site settings', err);
      }
    };
    fetchSettings();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      let response;
      if (isLogin) {
        response = await authAPI.login({ email: form.email, password: form.password });
      } else {
        response = await authAPI.register(form);
      }
      const { token, user } = response.data;
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));

      // Handle remember me logic
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', form.email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      toast.success(`Welcome, ${user.name}`);
      const roleRoutes = {
        'OWNER': '/dashboard',
        'OWNER_FULL': '/dashboard',
        'LOCATION_MANAGER': '/manager',
        'ADMIN': '/manager',
        'MANAGER': '/manager',
        'MANAGER_ASSISTANT': '/manager',
        'MANAGER_FULL': '/manager',
        'MANAGER_OPS': '/manager',
        'MANAGER_FRONTDESK': '/manager',
        'INSTRUCTOR': '/coach',
        'RECEPTIONIST': '/manager',
        'RECEPTIONIST_FULL': '/manager',
        'RECEPTIONIST_POS': '/manager',
        'STAFF': '/manager',
        'EXTERNAL': '/manager',
        'CUSTOMER': '/customer',
        'MEMBER': '/member',
        'MEMBER_STANDARD': '/member',
      };
      const dest = roleRoutes[user.role] || '/dashboard';
      navigate(dest, { replace: true, state: { user } });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const googleOAuthEnabled = process.env.REACT_APP_GOOGLE_OAUTH_ENABLED === 'true';
    if (!googleOAuthEnabled) {
      toast.error('Google OAuth is disabled. Use email/password login.');
      return;
    }
    const redirectUrl = window.location.origin + '/dashboard';
    const oauthUrl = process.env.REACT_APP_GOOGLE_OAUTH_URL || '';
    if (!oauthUrl) {
      toast.error('Google OAuth URL is not configured. Set REACT_APP_GOOGLE_OAUTH_URL in .env');
      return;
    }
    window.location.href = `${oauthUrl}?redirect=${encodeURIComponent(redirectUrl)}`;
  };
  
  const isGoogleOAuthEnabled = process.env.REACT_APP_GOOGLE_OAUTH_ENABLED === 'true';

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedAPI.seed();
      await seedAPI.seedPrograms().catch(() => {});
      await seedAPI.seedBookings().catch(() => {});
      await seedAPI.seedHR().catch(() => {});
      toast.success('Demo data loaded');
      setForm({ email: 'owner@spartans.com', password: 'Spartans2024!', name: '' });
      setIsLogin(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <PublicLayout siteSettings={siteSettings}>
      <div className="min-h-[calc(100vh-80px)] bg-gray-50 flex items-center justify-center py-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm border border-gray-100">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              {siteSettings?.logo_url ? (
                <img 
                  src={resolveImage(siteSettings.logo_url)} 
                  alt={siteSettings?.site_name || 'Logo'} 
                  className="h-16 w-auto object-contain"
                  onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }}
                />
              ) : null}
              <div className={`flex justify-center ${siteSettings?.logo_url ? 'hidden' : ''}`}>
                <img src={siteSettings?.favicon_url ? resolveImage(siteSettings.favicon_url) : "/favicon.png"} alt="Spartans Logo" className="w-16 h-16 object-contain rounded-sm" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }} />
                <div className="w-16 h-16 bg-red-600 rounded-sm flex items-center justify-center hidden">
                  <span className="font-heading font-extrabold text-white text-3xl leading-none">S</span>
                </div>
              </div>
            </div>
            <h2 className="font-heading font-extrabold text-gray-900 text-3xl uppercase tracking-tight mb-2">
              {isLogin ? 'Sign In' : 'Create Account'}
            </h2>
            <p className="text-gray-500 font-body text-sm">
              {isLogin ? 'Access your gym management dashboard' : 'Register as a new gym owner'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="space-y-2">
                <Label className="text-gray-700 font-heading uppercase tracking-wider text-xs">
                  Full Name
                </Label>
                <Input
                  data-testid="register-name-input"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Your full name"
                  required={!isLogin}
                  className="bg-white border-gray-300 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-gray-900 placeholder:text-gray-400 h-11"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-gray-700 font-heading uppercase tracking-wider text-xs">
                Email
              </Label>
              <Input
                data-testid="login-email-input"
                name="email"
                autoComplete="username"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="your@email.com"
                required
                className="bg-white border-gray-300 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-gray-900 placeholder:text-gray-400 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 font-heading uppercase tracking-wider text-xs">
                Password
              </Label>
              <div className="relative">
                <Input
                  data-testid="login-password-input"
                  name="password"
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Enter password"
                  required
                  className="bg-white border-gray-300 focus:border-red-600 focus:ring-1 focus:ring-red-600 rounded-sm text-gray-900 placeholder:text-gray-400 h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" strokeWidth={1.5} /> : <Eye className="w-4 h-4" strokeWidth={1.5} />}
                </button>
              </div>
            </div>

            {isLogin && (
              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded-sm border-gray-300 text-red-600 focus:ring-red-600 transition-colors"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                    Remember me
                  </span>
                </label>
              </div>
            )}

            <button
              data-testid="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-heading font-bold uppercase tracking-wider px-6 py-3 rounded-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 h-12"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          {/* Google Login - Only show if enabled */}
          {isGoogleOAuthEnabled && (
            <>
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-gray-500 text-xs font-heading uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              <button
                data-testid="google-login-btn"
                onClick={handleGoogleLogin}
                className="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-heading uppercase tracking-wide px-6 py-3 rounded-sm transition-all duration-200 flex items-center justify-center gap-3 h-12"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}

          {/* Toggle Login/Register */}
          <div className="mt-6 text-center">
            <button
              data-testid="toggle-auth-mode-btn"
              onClick={() => setIsLogin(!isLogin)}
              className="text-gray-500 text-sm font-body hover:text-gray-900 transition-colors"
            >
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <span className="text-red-600 font-semibold">
                {isLogin ? 'Register' : 'Sign In'}
              </span>
            </button>
          </div>

          {/* Seed Data Button */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <button
              data-testid="seed-data-btn"
              onClick={handleSeed}
              disabled={seeding}
              className="w-full text-gray-500 hover:text-gray-700 text-xs font-heading uppercase tracking-wider flex items-center justify-center gap-2 transition-colors py-2"
            >
              <Shield className="w-3.5 h-3.5" strokeWidth={1.5} />
              {seeding ? 'Creating demo data...' : 'Load Demo Data'}
            </button>
            <p className="text-gray-400 text-[10px] text-center mt-1 font-body">
              Admin: owner@spartans.com / Spartans2024! | Customer: customer.sharjah1.1@spartans.ae / Customer2024!
            </p>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
