import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, X, Phone, Mail, MapPin, Clock, Instagram, Facebook, Youtube } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { isVideoUrl, resolveMediaUrl } from '@/lib/media';
import { cmsField, cmsLinkLabel } from '@/lib/cmsI18n';

// Social icon mapper
const SocialIcon = ({ platform, className }) => {
  switch (platform) {
    case 'instagram': return <Instagram className={className} />;
    case 'facebook': return <Facebook className={className} />;
    case 'youtube': return <Youtube className={className} />;
    case 'twitter': return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>;
    case 'tiktok': return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.88-2.89 2.89 2.89 0 012.88-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.33 6.34A6.34 6.34 0 009.49 21.6a6.34 6.34 0 006.33-6.34V8.56a8.24 8.24 0 003.77.92V6.04a4.85 4.85 0 01-.02.65h.02z"/></svg>;
    case 'linkedin': return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>;
    case 'whatsapp': return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
    default: return null;
  }
};

export default function PublicLayout({ children, siteSettings }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const lang = i18n?.language || 'en';

  // Default nav links (fallback if CMS header_menu is not configured)
  const defaultNavLinks = [
    { label: t('nav.home'), url: '/', is_active: true },
    { label: t('nav.locations'), url: '/branches', is_active: true },
    { label: t('nav.disciplines'), url: '/disciplines', is_active: true },
    { label: t('nav.pricing'), url: '/pricing', is_active: true },
    { label: t('nav.faq'), url: '/faqs', is_active: true },
    { label: t('nav.contact'), url: '/contact', is_active: true },
  ];

  // Use CMS header_menu if available, otherwise default
  const navLinks = (siteSettings?.header_menu && siteSettings.header_menu.length > 0)
    ? siteSettings.header_menu.filter(item => item.is_active)
    : defaultNavLinks;

  // CTA button
  const ctaText = cmsField(siteSettings, 'header_cta_text', lang, t('nav.getStarted'));
  const ctaUrl = cmsField(siteSettings, 'header_cta_url', lang, '/contact');

  // Footer data
  const footerLogoUrl = siteSettings?.footer_logo_url || siteSettings?.logo_url;
  const footerDescription = cmsField(siteSettings, 'footer_description', lang, siteSettings?.description || t('footer.aboutText'));
  const footerQuickLinks = (siteSettings?.footer_quick_links && siteSettings.footer_quick_links.length > 0)
    ? siteSettings.footer_quick_links
    : navLinks.slice(0, 4).map(l => ({ label: l.label, url: l.url }));
  const footerContact = siteSettings?.footer_contact || {
    phone: siteSettings?.contact_phone || '+971-50-000-0000',
    email: siteSettings?.contact_email || 'info@spartans.ae',
    address: siteSettings?.contact_address || '',
    working_hours: '',
  };
  const socialLinks = siteSettings?.social_links || {};

  const isActive = (path) => location.pathname === path;

  const resolveUrl = (url) => {
    if (!url) return '#';
    if (url.startsWith('/')) return url;
    return url;
  };

  const isExternalUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const u = url.trim().toLowerCase();
    return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('mailto:') || u.startsWith('tel:');
  };

  const resolveImage = (url) => {
    const resolved = resolveMediaUrl(url);
    if (!resolved) return null;
    return isVideoUrl(resolved) ? null : resolved;
  };
  const footerCopyright = cmsField(siteSettings, 'footer_text', lang, t('footer.copyright'));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-black/70 supports-[backdrop-filter]:bg-black/55 backdrop-blur-xl"
        />
        <div className="px-3 sm:px-4 lg:px-6">
          <div className="max-w-7xl mx-auto">
            <div className="relative bg-black/85 supports-[backdrop-filter]:bg-black/75 backdrop-blur-2xl border border-red-500/20 border-b-red-500/45 rounded-2xl rounded-t-none shadow-[0_10px_35px_rgba(0,0,0,0.45)] after:absolute after:inset-x-6 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-red-500/80 after:to-transparent after:shadow-[0_0_18px_rgba(239,68,68,0.55)]">
              <div className="flex items-center justify-between h-16 lg:h-20 px-4 sm:px-5 lg:px-6">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2" data-testid="public-logo">
                  {resolveImage(siteSettings?.logo_url) ? (
                    <img 
                      src={resolveImage(siteSettings.logo_url)} 
                      alt={siteSettings?.site_name || 'Logo'} 
                      className="h-11 lg:h-14 w-auto object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.08)]"
                      onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }}
                    />
                  ) : null}
                  <div className={`flex items-center gap-2 ${resolveImage(siteSettings?.logo_url) ? 'hidden' : ''}`}>
                    <img src={resolveImage(siteSettings?.favicon_url) || "/favicon.png"} alt="Spartans Logo" className="w-10 h-10 object-contain rounded-md drop-shadow-[0_0_10px_rgba(255,255,255,0.08)]" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }} />
                    <div className="w-10 h-10 bg-red-600 rounded-md flex items-center justify-center hidden">
                      <span className="text-white font-bold text-lg">S</span>
                    </div>
                    <span className="font-heading font-extrabold text-white text-lg uppercase tracking-tight hidden sm:block drop-shadow-[0_0_14px_rgba(239,68,68,0.2)]">
                      {siteSettings?.site_name || 'Spartans'}
                    </span>
                  </div>
                </Link>

                {/* Desktop Navigation */}
                <nav className="hidden lg:flex items-center gap-7" data-testid="desktop-nav">
                  {navLinks.map((link, idx) => (
                    (() => {
                      const href = resolveUrl(link.url);
                      const active = !isExternalUrl(href) && isActive(href);
                      const className = `relative text-xs font-semibold uppercase tracking-wider transition-colors after:absolute after:left-0 after:-bottom-2 after:h-[2px] after:w-full after:bg-red-500 after:opacity-0 after:transition-opacity after:duration-200 after:shadow-[0_0_14px_rgba(239,68,68,0.65)] hover:after:opacity-100 ${
                        active ? 'text-white after:opacity-100' : 'text-zinc-200 hover:text-white'
                      }`;
                      const label = cmsLinkLabel(link, lang, link.label);
                      const testId = `nav-${link.url?.replace('/', '') || 'home'}`;

                      if (isExternalUrl(href)) {
                        return (
                          <a key={link.url + idx} href={href} data-testid={testId} className={className}>
                            {label}
                          </a>
                        );
                      }

                      return (
                        <Link key={link.url + idx} to={href} data-testid={testId} className={className}>
                          {label}
                        </Link>
                      );
                    })()
                  ))}
                </nav>

                {/* CTA + Language Switcher */}
                <div className="hidden lg:flex items-center gap-3">
                  <LanguageSwitcher variant="dark" />
                  <Link
                    to="/login"
                    data-testid="member-login-btn"
                    className="text-xs font-semibold uppercase tracking-wider text-zinc-200 hover:text-white transition-colors"
                  >
                    {t('nav.memberLogin')}
                  </Link>
                  {(() => {
                    const href = resolveUrl(ctaUrl);
                    const className = "relative inline-flex items-center justify-center cursor-pointer select-none overflow-hidden rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-red-600 via-red-500 to-red-600 shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_0_22px_rgba(239,68,68,0.35)] transition-all duration-200 transform-gpu hover:from-red-500 hover:via-red-500 hover:to-red-600 hover:shadow-[0_0_0_1px_rgba(239,68,68,0.7),0_0_38px_rgba(239,68,68,0.75)] hover:scale-[1.04] hover:-translate-y-0.5 active:scale-[0.99]";
                    if (isExternalUrl(href)) {
                      return (
                        <a key="cta" href={href} data-testid="get-started-btn" className={className}>
                          {ctaText}
                        </a>
                      );
                    }
                    return (
                      <Link key="cta" to={href} data-testid="get-started-btn" className={className}>
                        {ctaText}
                      </Link>
                    );
                  })()}
                </div>

                {/* Mobile Menu Button */}
                <div className="lg:hidden flex items-center gap-2">
                  <LanguageSwitcher variant="dark" />
                  <button
                    data-testid="mobile-menu-btn"
                    className="p-2 rounded-md text-zinc-200 hover:text-white hover:bg-zinc-800/60 transition-colors"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  >
                    {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                  </button>
                </div>
              </div>

              {/* Mobile Menu */}
              {mobileMenuOpen && (
                <div className="lg:hidden border-t border-red-500/10 bg-zinc-950/85 supports-[backdrop-filter]:bg-zinc-950/70 backdrop-blur-xl rounded-b-2xl">
                  <div className="px-4 py-4 space-y-2">
                    {navLinks.map((link, idx) => (
                      (() => {
                        const href = resolveUrl(link.url);
                        const active = !isExternalUrl(href) && isActive(href);
                        const className = `block py-2.5 text-sm font-semibold uppercase tracking-wider ${
                          active ? 'text-white' : 'text-zinc-200 hover:text-white'
                        }`;
                        const underlineClassName = `inline-block relative after:absolute after:left-0 after:-bottom-1 after:h-[2px] after:w-full after:bg-red-500 after:shadow-[0_0_14px_rgba(239,68,68,0.65)] ${active ? 'after:opacity-100' : 'after:opacity-0'}`;
                        const label = cmsLinkLabel(link, lang, link.label);

                        if (isExternalUrl(href)) {
                          return (
                            <a
                              key={link.url + idx}
                              href={href}
                              className={className}
                              onClick={() => setMobileMenuOpen(false)}
                            >
                              <span className={underlineClassName}>{label}</span>
                            </a>
                          );
                        }

                        return (
                          <Link
                            key={link.url + idx}
                            to={href}
                            className={className}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <span className={underlineClassName}>{label}</span>
                          </Link>
                        );
                      })()
                    ))}
                    <div className="pt-4 mt-2 border-t border-red-500/10 space-y-3">
                      <Link
                        to="/login"
                        className="block py-2 text-sm font-semibold uppercase tracking-wider text-zinc-200 hover:text-white"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {t('nav.memberLogin')}
                      </Link>
                      {(() => {
                        const href = resolveUrl(ctaUrl);
                        const className = "block text-center cursor-pointer select-none rounded-full px-4 py-3 text-sm font-bold uppercase tracking-wider text-white bg-gradient-to-r from-red-600 via-red-500 to-red-600 shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_0_22px_rgba(239,68,68,0.35)] transition-all duration-200 transform-gpu hover:from-red-500 hover:via-red-500 hover:to-red-600 hover:shadow-[0_0_0_1px_rgba(239,68,68,0.7),0_0_38px_rgba(239,68,68,0.75)] hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.99]";
                        if (isExternalUrl(href)) {
                          return (
                            <a
                              key="cta-mobile"
                              href={href}
                              className={className}
                              onClick={() => setMobileMenuOpen(false)}
                            >
                              {ctaText}
                            </a>
                          );
                        }
                        return (
                          <Link
                            key="cta-mobile"
                            to={href}
                            className={className}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            {ctaText}
                          </Link>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-16 lg:pt-20 [&>*:first-child]:-mt-16 lg:[&>*:first-child]:-mt-20 [&>*:first-child]:pt-16 lg:[&>*:first-child]:pt-20">{children}</main>

      {/* Footer */}
      <footer className="bg-black text-white" data-testid="site-footer">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {/* Brand */}
            <div data-testid="footer-brand">
              <div className="flex items-center gap-2 mb-4">
                {resolveImage(footerLogoUrl) ? (
                  <img 
                    src={resolveImage(footerLogoUrl)} 
                    alt={siteSettings?.site_name || 'Logo'} 
                    className="h-24 w-auto object-contain"
                    onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }}
                  />
                ) : null}
                <div className={`flex items-center gap-2 ${resolveImage(footerLogoUrl) ? 'hidden' : ''}`}>
                  <img src={resolveImage(siteSettings?.favicon_url) || "/favicon.png"} alt="Spartans Logo" className="w-20 h-20 object-contain rounded-sm" onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.classList.remove('hidden'); }} />
                  <div className="w-20 h-20 bg-red-600 rounded-sm flex items-center justify-center hidden">
                    <span className="text-white font-bold text-3xl">S</span>
                  </div>
                  <span className="font-heading font-extrabold text-white text-2xl uppercase tracking-tight">
                    {siteSettings?.site_name?.split(' ')[0] || 'Spartans'}
                  </span>
                </div>
              </div>
              <p className="text-gray-400 text-sm">{footerDescription}</p>
            </div>

            {/* Quick Links */}
            <div data-testid="footer-quick-links">
              <h4 className="font-heading font-bold text-sm uppercase tracking-wider mb-4">{cmsField(siteSettings, 'footer_quick_links_title', lang, t('footer.quickLinks'))}</h4>
              <ul className="space-y-2">
                {footerQuickLinks.map((link, idx) => (
                  <li key={link.url + idx}>
                    {(() => {
                      const href = resolveUrl(link.url);
                      const label = cmsLinkLabel(link, lang, link.label);
                      const className = "text-gray-400 hover:text-white text-sm transition-colors";
                      if (isExternalUrl(href)) {
                        return (
                          <a href={href} className={className}>
                            {label}
                          </a>
                        );
                      }
                      return (
                        <Link to={href} className={className}>
                          {label}
                        </Link>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div data-testid="footer-contact">
              <h4 className="font-heading font-bold text-sm uppercase tracking-wider mb-4">{cmsField(siteSettings, 'footer_contact_title', lang, t('footer.contactUs'))}</h4>
              <ul className="space-y-3">
                {footerContact.phone && (
                  <li className="flex items-center gap-2 text-gray-400 text-sm">
                    <Phone className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <a href={`tel:${footerContact.phone}`} className="hover:text-white transition-colors">{footerContact.phone}</a>
                  </li>
                )}
                {footerContact.email && (
                  <li className="flex items-center gap-2 text-gray-400 text-sm">
                    <Mail className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <a href={`mailto:${footerContact.email}`} className="hover:text-white transition-colors">{footerContact.email}</a>
                  </li>
                )}
                {footerContact.address && (
                  <li className="flex items-start gap-2 text-gray-400 text-sm">
                    <MapPin className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <span>{footerContact.address}</span>
                  </li>
                )}
                {footerContact.working_hours && (
                  <li className="flex items-center gap-2 text-gray-400 text-sm">
                    <Clock className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span>{footerContact.working_hours}</span>
                  </li>
                )}
              </ul>
            </div>

            {/* Social */}
            <div data-testid="footer-social">
              <h4 className="font-heading font-bold text-sm uppercase tracking-wider mb-4">{cmsField(siteSettings, 'footer_follow_title', lang, t('footer.followUs'))}</h4>
              <div className="flex items-center gap-4 flex-wrap">
                {Object.entries(socialLinks)
                  .filter(([, url]) => url && url.trim())
                  .map(([platform, url]) => (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-white transition-colors"
                      title={platform.charAt(0).toUpperCase() + platform.slice(1)}
                      data-testid={`social-link-${platform}`}
                    >
                      <SocialIcon platform={platform} className="w-5 h-5" />
                    </a>
                  ))}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-gray-500 text-sm" data-testid="footer-copyright">
              <span dangerouslySetInnerHTML={{ __html: (footerCopyright || '').replace('{{year}}', new Date().getFullYear()) }} />
            </div>
            <div className="flex items-center gap-6">
              <Link to="/page/privacy" className="text-gray-500 hover:text-white text-sm transition-colors">
                {cmsField(siteSettings, 'footer_privacy_label', lang, t('footer.privacyPolicy'))}
              </Link>
              <Link to="/page/terms" className="text-gray-500 hover:text-white text-sm transition-colors">
                {cmsField(siteSettings, 'footer_terms_label', lang, t('footer.termsOfService'))}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
