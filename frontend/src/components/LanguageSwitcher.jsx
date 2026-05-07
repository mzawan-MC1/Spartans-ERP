import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const languages = [
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'ar', label: 'العربية', flag: 'AR' },
  { code: 'fr', label: 'Français', flag: 'FR' },
  { code: 'ru', label: 'Русский', flag: 'RU' },
];

export default function LanguageSwitcher({ variant = 'light' }) {
  const { i18n } = useTranslation();
  const current = languages.find((l) => l.code === i18n.language) || languages[0];

  const handleChange = (code) => {
    i18n.changeLanguage(code);
    document.documentElement.lang = code;
    document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
  };

  const isDark = variant === 'dark';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="language-switcher"
        className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors outline-none ${
          isDark
            ? 'text-zinc-200 hover:text-white bg-zinc-900/30 hover:bg-zinc-900/55 border border-red-500/10'
            : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
        }`}
      >
        <Globe className="w-4 h-4" strokeWidth={1.5} />
        <span>{current.flag}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-60" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={`${isDark ? 'w-44 p-1 rounded-xl bg-zinc-950/80 supports-[backdrop-filter]:bg-zinc-950/60 backdrop-blur-xl border border-red-500/20 shadow-[0_18px_50px_rgba(0,0,0,0.55)] text-zinc-100' : 'w-40 bg-white border-gray-200'}`}
      >
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            data-testid={`lang-${lang.code}`}
            onClick={() => handleChange(lang.code)}
            className={`cursor-pointer text-sm rounded-lg ${
              isDark
                ? (lang.code === i18n.language
                  ? 'bg-red-500/12 text-white'
                  : 'text-zinc-200 hover:bg-red-500/10 hover:text-white focus:bg-red-500/10 focus:text-white')
                : (lang.code === i18n.language ? 'text-red-600 font-semibold' : 'text-gray-700')
            }`}
          >
            <span className={`w-7 font-mono text-xs ${isDark ? 'text-zinc-400' : 'text-gray-400'}`}>{lang.flag}</span>
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
