import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PublicLayout from '@/components/PublicLayout';
import { publicAPI } from '@/lib/api';
import { ChevronRight } from 'lucide-react';
import DOMPurify from 'dompurify';

export default function StaticPage() {
  const { slug } = useParams();
  const { i18n } = useTranslation();
  const [siteSettings, setSiteSettings] = useState(null);
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [settingsRes, pageRes] = await Promise.all([
          publicAPI.getSiteSettings().catch(() => ({ data: null })),
          publicAPI.getPage(slug),
        ]);
        setSiteSettings(settingsRes.data);
        setPage(pageRes.data);
      } catch (err) {
        setError('Page not found');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, i18n.language]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <PublicLayout siteSettings={siteSettings}>
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-heading font-extrabold text-4xl text-black">Page Not Found</h1>
            <p className="text-gray-600 mt-4">The page you're looking for doesn't exist.</p>
            <Link to="/" className="inline-block mt-6 text-red-600 hover:text-red-700 font-medium">
              Go to Homepage
            </Link>
          </div>
        </section>
      </PublicLayout>
    );
  }

  const formatContent = (content) => {
    if (!content) return '';
    
    // Sanitize config to prevent layout-breaking styles
    const purifyConfig = {
      FORBID_ATTR: ['style'], // Strip inline styles that might break layout (width, white-space, etc)
      ADD_TAGS: ['iframe'], // Allow iframes if needed (e.g. maps)
      ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling']
    };

    // If it contains HTML tags, sanitize and return
    if (/<[a-z][\s\S]*>/i.test(content)) {
      return DOMPurify.sanitize(content, purifyConfig);
    }
    // Otherwise, treat as plain text: convert double newlines to paragraphs and single newlines to <br>
    const sanitized = DOMPurify.sanitize(content, purifyConfig);
    const paragraphs = sanitized
      .split(/\n\s*\n/)
      .map(p => `<p>${p.replace(/\n/g, '<br />')}</p>`)
      .join('');
    return paragraphs;
  };

  return (
    <PublicLayout siteSettings={siteSettings}>
      {/* Hero */}
      <section className="bg-black text-white py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
            <Link to="/" className="hover:text-white">Home</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{page.title}</span>
          </nav>
          <h1 className="font-heading font-extrabold text-3xl lg:text-5xl uppercase tracking-tight">
            {page.title}
          </h1>
        </div>
      </section>

      {/* Content */}
      <section data-testid="static-page-content" className="py-16 lg:py-24 overflow-hidden bg-white">
        <div className="w-[85%] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div 
            className="prose prose-lg max-w-none prose-headings:font-heading prose-headings:text-black prose-p:text-black prose-li:text-black prose-strong:text-black prose-a:text-red-600 text-black break-words whitespace-normal public-richtext static-page-content"
            dangerouslySetInnerHTML={{ __html: formatContent(page.content) }}
          />
        </div>
      </section>
    </PublicLayout>
  );
}
