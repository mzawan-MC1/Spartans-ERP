import { Check } from 'lucide-react';
import { CMS_LANGS } from '@/lib/cmsLanguages';

export default function LanguageTabs({ value, onValueChange, statusByLang = {}, className = '' }) {
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

