import { Phone, Printer, Mail, Headphones } from 'lucide-react';

/* Corporate-style footer modeled on lintasarta.co.id. Section titles and
   contact labels are the real ones; every value/link is a placeholder until
   the product team supplies the final content. */

interface FooterSection {
  title: string;
  items: number;
}

const linkColumns: FooterSection[][] = [
  [
    { title: 'Produk & Layanan', items: 2 },
    { title: 'Solusi', items: 4 },
  ],
  [
    { title: 'Tentang Kami', items: 2 },
    { title: 'Media & Informasi', items: 2 },
  ],
];

const standaloneTitles = [
  'GPU Marketplace',
  'CSR',
  'Jangkauan Layanan',
  'Whistleblowing',
  'Karir',
  'Privacy Notice',
  'RFC-2350',
  'AI Bertanggung Jawab',
];

export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-copyright-bar">
        <span className="app-footer-copyright">
          Copyright &copy; {new Date().getFullYear()} PT Aplikanusa Lintasarta
        </span>
      </div>
      <div className="footer-grid">
        <div className="footer-brand-col">
          <img src="/LegalAnalyzerLogo.png" alt="Legal Analyzer" className="footer-brand-logo" />
          <p className="footer-address">
            Placeholder address line 1<br />
            Placeholder address line 2
          </p>
          <div className="footer-contact-grid">
            <div className="footer-contact-item">
              <Phone size={18} />
              <div>
                <strong>Telepon (Hunting)</strong>
                <span>Placeholder</span>
              </div>
            </div>
            <div className="footer-contact-item">
              <Phone size={18} />
              <div>
                <strong>Informasi Produk</strong>
                <span>Placeholder</span>
              </div>
            </div>
            <div className="footer-contact-item">
              <Printer size={18} />
              <div>
                <strong>Fax</strong>
                <span>Placeholder</span>
              </div>
            </div>
            <div className="footer-contact-item">
              <Mail size={18} />
              <div>
                <strong>Email</strong>
                <span>Placeholder</span>
              </div>
            </div>
            <div className="footer-contact-item">
              <Headphones size={18} />
              <div>
                <strong>Layanan Pelanggan</strong>
                <span>Placeholder</span>
                <span>Placeholder</span>
              </div>
            </div>
          </div>
        </div>

        {linkColumns.map((column, i) => (
          <div className="footer-col" key={i}>
            {column.map(section => (
              <div className="footer-section" key={section.title}>
                <h4>{section.title}</h4>
                {Array.from({ length: section.items }, (_, j) => (
                  <a key={j} href="#" className="footer-link">Placeholder</a>
                ))}
              </div>
            ))}
          </div>
        ))}

        <div className="footer-col">
          {standaloneTitles.map(title => (
            <a key={title} href="#" className="footer-title-link">{title}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}
