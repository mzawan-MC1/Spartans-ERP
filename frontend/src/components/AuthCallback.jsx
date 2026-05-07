import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '@/lib/api';

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processSession = async () => {
      try {
        const hash = window.location.hash;
        const params = new URLSearchParams(hash.substring(1));
        const sessionId = params.get('session_id');

        if (!sessionId) {
          navigate('/login', { replace: true });
          return;
        }

        const response = await authAPI.processGoogleSession(sessionId);
        const { token, user } = response.data;
        localStorage.setItem('auth_token', token);
        
        // Clear hash and navigate
        window.history.replaceState(null, '', window.location.pathname);
        const roleRoutes = {
          OWNER: '/dashboard',
          OWNER_FULL: '/dashboard',
          LOCATION_MANAGER: '/manager',
          MANAGER_FULL: '/manager',
          MANAGER_OPS: '/manager',
          MANAGER_FRONTDESK: '/manager',
          INSTRUCTOR: '/coach',
          RECEPTIONIST: '/manager',
          RECEPTIONIST_FULL: '/manager',
          CUSTOMER: '/customer',
          MEMBER: '/member',
          MEMBER_STANDARD: '/member',
        };
        navigate(roleRoutes[user?.role] || '/dashboard', { replace: true, state: { user } });
      } catch (err) {
        console.error('Auth callback error:', err);
        navigate('/login', { replace: true });
      }
    };

    processSession();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-zinc-400 font-body text-sm tracking-wide">Authenticating...</p>
      </div>
    </div>
  );
}
