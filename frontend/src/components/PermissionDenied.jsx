import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BackButton from '@/components/BackButton';

export default function PermissionDenied({
  message = 'Permission not granted to this functionality.',
  fallback = '/dashboard',
  title,
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-zinc-900/40 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <BackButton fallback={fallback} />
          <button
            type="button"
            onClick={() => navigate(fallback, { replace: true })}
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {t('errors.goHome')}
          </button>
        </div>

        <div className="mt-6 text-white font-heading text-xl">{title || t('errors.unauthorized')}</div>
        <div className="mt-2 text-zinc-300">{message}</div>
      </div>
    </div>
  );
}
