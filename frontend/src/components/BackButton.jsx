import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ fallback = '/dashboard', label = 'Back', className = '', testId = 'back-btn' }) {
  const navigate = useNavigate();

  const handleBack = () => {
    const idx = typeof window !== 'undefined' && window.history?.state && typeof window.history.state.idx === 'number'
      ? window.history.state.idx
      : 0;
    if (idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };

  return (
    <button
      data-testid={testId}
      onClick={handleBack}
      className={`flex items-center gap-2 text-zinc-500 hover:text-white font-heading uppercase tracking-wider text-sm transition-colors ${className}`}
    >
      <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
      {label}
    </button>
  );
}
