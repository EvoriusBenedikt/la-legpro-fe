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
            Jakarta Pusat Menara Thamrin 12th Floor Jl. M.H.<br />
            Thamrin Kav.3 Jakarta 10250
          </p>
          <div className="footer-contact-grid">
            <div className="footer-contact-item">
              <Phone size={18} />
              <div>
                <strong>Telepon (Hunting)</strong>
                <span>+6221 230 2345</span>
              </div>
            </div>
            <div className="footer-contact-item">
              <Phone size={18} />
              <div>
                <strong>Informasi Produk</strong>
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
                <strong>Layanan Pelanggan</strong>
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
              <div className="footer-section" key={section.title}>
                <h3>{section.title}</h3>
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
