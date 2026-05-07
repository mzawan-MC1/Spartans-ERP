import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authAPI, rolesAPI } from '@/lib/api';
import PermissionDenied from '@/components/PermissionDenied';

const ROLE_ROUTES = {
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

export default function ProtectedRoute({ children, allowedRoles, requiredPermissions = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(location.state?.user ? true : null);
  const [user, setUser] = useState(location.state?.user || null);
  const [permissions, setPermissions] = useState(location.state?.permissions || null);

  useEffect(() => {
    if (location.state?.user) {
      setUser(location.state.user);
      if (location.state?.permissions) {
        setPermissions(location.state.permissions);
      } else if (requiredPermissions && location.state.user?.role && location.state.user.role !== 'OWNER') {
        (async () => {
          try {
            const permsRes = await rolesAPI.getMyPermissions();
            setPermissions(permsRes.data?.permissions || []);
          } catch {
            setPermissions([]);
          }
        })();
      }
      setIsAuthenticated(true);
      return;
    }

    const checkAuth = async () => {
      try {
        const response = await authAPI.getMe();
        let perms = null;
        if (requiredPermissions && response.data?.role && response.data.role !== 'OWNER') {
          try {
            const permsRes = await rolesAPI.getMyPermissions();
            perms = permsRes.data?.permissions || [];
          } catch {
            perms = [];
          }
        }
        setUser(response.data);
        setPermissions(perms);
        setIsAuthenticated(true);
      } catch {
        setIsAuthenticated(false);
        localStorage.removeItem('auth_token');
        navigate('/login', { replace: true });
      }
    };
    checkAuth();
  }, [location.state, navigate, requiredPermissions]);

  const home = user?.role ? (ROLE_ROUTES[user.role] || '/dashboard') : '/dashboard';
  const shouldRedirectHome = isAuthenticated === true && user?.role === 'INSTRUCTOR' && location.pathname === '/dashboard';

  useEffect(() => {
    if (!shouldRedirectHome) return;
    navigate(home, { replace: true, state: { user, permissions } });
  }, [home, navigate, permissions, shouldRedirectHome, user]);

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (shouldRedirectHome) return null;

  if (allowedRoles && user?.role && !allowedRoles.includes(user.role)) {
    return <PermissionDenied fallback={home} />;
  }

  if (requiredPermissions && user?.role && user.role !== 'OWNER' && permissions == null) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (requiredPermissions && user?.role && user.role !== 'OWNER') {
    const perms = Array.isArray(permissions) ? permissions : [];
    const allowed = requiredPermissions.some((p) => perms.includes(p));
    if (!allowed) {
      return <PermissionDenied fallback={home} />;
    }
  }

  return typeof children === 'function' ? children({ user, permissions }) : children;
}
