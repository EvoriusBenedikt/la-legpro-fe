import { useEffect, useRef, useState } from 'react';
import { Phone, Printer, Mail, Headphones } from 'lucide-react';
import { useStrings } from '../i18n';

/* Corporate-style footer modeled on lintasarta.co.id. Section titles and
   contact labels are the real ones; every value/link is a placeholder until
   the product team supplies the final content. Corporate labels localize
   through the dictionary; addresses, numbers, emails, and brand names stay
   untouched in both locales. */

interface FooterSection {
  key: 'footProducts' | 'footSolutions' | 'footAbout' | 'footMedia';
  items: number;
}

const linkColumns: FooterSection[][] = [
  [
    { key: 'footProducts', items: 2 },
    { key: 'footSolutions', items: 4 },
  ],
  [
    { key: 'footAbout', items: 2 },
    { key: 'footMedia', items: 2 },
  ],
];

const standaloneKeys = [
  null, // GPU Marketplace — proper noun, both locales
  null, // CSR — proper noun, both locales
  'footCoverage',
  null, // Whistleblowing — proper noun, both locales
  'footCareers',
  null, // Privacy Notice — proper noun, both locales
  null, // RFC-2350 — proper noun, both locales
  'footResponsibleAi',
] as const;

const standaloneFallback = [
  'GPU Marketplace',
  'CSR',
  '',
  'Whistleblowing',
  '',
  'Privacy Notice',
  'RFC-2350',
  '',
];

export default function Footer() {
  const t = useStrings();
  const footerRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);

  /* Scroll-reveal grammar (2026-10-01): the footer rests collapsed to its
     copyright bar; reaching the bottom edge of the route scroller
     (.tab-panel--active — the footer's parent) opens the link grid, and it
     closes again only once the footer has fully left the scroller viewport.
     The two triggers are hysteresis-safe by construction: expanding adds
     height below the bottom edge (scrollTop never moves), and collapsing
     only fires when the viewport has already scrolled past every pixel the
     transition removes (scrollTop can never clamp) — so neither state flip
     can retrigger the other, and there is no jump or flicker loop. */
  useEffect(() => {
    const el = footerRef.current;
    const scroller = el?.parentElement;
    if (!el || !scroller) return;
    const update = () => {
      const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      const inView =
        el.getBoundingClientRect().top < scroller.getBoundingClientRect().bottom;
      setExpanded(prev => (prev ? inView : gap <= 4));
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      scroller.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  return (
    <footer
      ref={footerRef}
      className={expanded ? 'app-footer app-footer--expanded' : 'app-footer'}
    >
      <div className="footer-copyright-bar">
        <span className="app-footer-copyright">
          Copyright &copy; {new Date().getFullYear()} PT Aplikanusa Lintasarta
        </span>
      </div>
      <div className="footer-reveal">
        <div className="footer-reveal-inner">
          <div className="footer-grid">
            <div className="footer-brand-col">
              <img src="/LegalAnalyzerLogo.png" alt="Legal Analyzer" className="footer-brand-logo" />
              <p className="footer-address">
                Jakarta Pusat Menara Thamrin 12th Floor Jl. M.H.<br />
                Thamrin Kav.3 Jakarta 10250
              </p>
              <div className="footer-contact-grid">
                <div className="footer-contact-item">
                  <Phone size={18} />
                  <div>
                    <strong>{t.footPhone}</strong>
                    <span>+6221 230 2345</span>
                  </div>
                </div>
                <div className="footer-contact-item">
                  <Phone size={18} />
                  <div>
                    <strong>{t.footProductInfo}</strong>
                    <span>14052</span>
                  </div>
                </div>
                <div className="footer-contact-item">
                  <Printer size={18} />
                  <div>
                    <strong>Fax</strong>
                    <span>+6221 230 3567</span>
                  </div>
                </div>
                <div className="footer-contact-item">
                  <Mail size={18} />
                  <div>
                    <strong>Email</strong>
                    <span>info@lintasarta.co.id</span>
                  </div>
                </div>
                <div className="footer-contact-item">
                  <Headphones size={18} />
                  <div>
                    <strong>{t.footCustomer}</strong>
                    <span>14052 / +6221 80669499</span>
                    <span>Email: support@lintasarta.co.id</span>
                    <span>Whatsapp: 08561114052</span>
                    <span>Customer Portal: Ultima by Lintasarta</span>
                  </div>
                </div>
              </div>
            </div>

            {linkColumns.map((column, i) => (
              <div className="footer-col" key={i}>
                {column.map(section => (
                  <div className="footer-section" key={section.key}>
                    <h3>{t[section.key]}</h3>
                    {Array.from({ length: section.items }, (_, j) => (
                      <a key={j} href="#" className="footer-link">Placeholder</a>
                    ))}
                  </div>
                ))}
              </div>
            ))}

            <div className="footer-col">
              {standaloneKeys.map((key, i) => {
                const title = key ? t[key] : standaloneFallback[i];
                return <a key={title} href="#" className="footer-title-link">{title}</a>;
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
