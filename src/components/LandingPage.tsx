import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Scale, ShieldCheck, FileText, AlertTriangle, Upload, Search, Eye,
  Download, Lock, CheckCircle2, ArrowRight, Building2,
} from 'lucide-react';
import { setSetting } from '../settings';
import { useLocale, useStrings } from '../i18n';
import { FlagId, FlagUs } from './LangFlags';
import './LandingPage.css';

const TEAM_SIZES = ['1–10', '11–50', '51–200', '200+'];

export default function LandingPage() {
  const t = useStrings();
  const locale = useLocale();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [teamSize, setTeamSize] = useState(TEAM_SIZES[1]);
  const [formError, setFormError] = useState<'lpFormRequired' | ''>('');
  const [requested, setRequested] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add('lp-js');
    const els = Array.from(root.querySelectorAll('.lp-reveal'));
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const handleDemoSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (!name.trim() || !company.trim()) {
      setFormError('lpFormRequired');
      return;
    }
    setRequested(true);
  };

  const nav = (key: 'lpCapabilities' | 'lpHow' | 'lpResults' | 'lpSecurity') => t[key];
  const section = (tag: string, title: string, body: string) => (
    <><div className="lp-rule" aria-hidden="true"><span className="lp-rule-tag">{tag}</span></div><h2>{title}</h2><p className="lp-sub">{body}</p></>
  );

  return (
    <div className="lp" ref={rootRef}>
      <header className="lp-nav"><div className="lp-inner lp-nav-row">
        <Link to="/" className="lp-brand"><span className="lp-brand-mark"><Scale size={18} /></span>Legal Analyzer</Link>
        <nav className="lp-links"><a href="#capabilities">{nav('lpCapabilities')}</a><a href="#how">{nav('lpHow')}</a><a href="#results">{nav('lpResults')}</a><a href="#security">{nav('lpSecurity')}</a></nav>
        <div className="auths-lang lp-lang" role="group" aria-label={t.secLanguage}>
          <button type="button" className={`auths-lang-btn${locale === 'id' ? ' is-active' : ''}`} aria-pressed={locale === 'id'} aria-label={t.langIndonesian} onClick={() => setSetting('locale', 'id')}><FlagId /></button>
          <button type="button" className={`auths-lang-btn${locale === 'en' ? ' is-active' : ''}`} aria-pressed={locale === 'en'} aria-label={t.langEnglish} onClick={() => setSetting('locale', 'en')}><FlagUs /></button>
        </div>
        <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-sm">{t.lpSignIn}</Link>
        <a href="#demo" className="lp-btn lp-btn-primary lp-btn-sm">{t.lpRequestDemo}</a>
      </div></header>

      <section className="lp-hero"><div className="lp-inner lp-hero-grid"><div>
        <span className="lp-eyebrow">{t.lpEyebrow}</span><h1>{t.lpHeroTitle} <span className="lp-accent">{t.lpHeroAccent}</span>.</h1><p className="lp-lede">{t.lpHeroBody}</p>
        <div className="lp-cta-row"><a href="#demo" className="lp-btn lp-btn-primary">{t.lpRequestDemo} <ArrowRight size={16} /></a><Link to="/login" className="lp-btn lp-btn-ghost">{t.lpSignInApp}</Link></div>
        <div className="lp-trustline" aria-hidden="true"><span>{t.lpTrusted}</span></div>
        <div className="lp-stats">{[['53,000+', 'lpStatClauses'], ['12+', 'lpStatBodies'], ['1,000+', 'lpStatRegulations'], ['80%', 'lpStatReduction']].map(([value, key], index) => <div className="lp-stat lp-reveal" style={{ '--i': index } as React.CSSProperties} key={key}><b>{value}</b><span>{t[key as keyof typeof t] as string}</span></div>)}</div>
      </div><div className="lp-mock lp-brackets lp-reveal" aria-hidden="true"><div className="lp-mock-bar"><span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" /><span className="lp-mock-title">PKS_Telekomunikasi_2026.pdf — {t.lpComplianceCheck}</span><span className="lp-mock-score">{t.lpScore}</span></div><div className="lp-mock-body"><div className="lp-clauses"><div className="lp-clause lp-ok"><b><span className="lp-pill">{t.lpCompliant}</span> {t.lpClauseDataProtection}</b>{t.lpClauseOk}</div><div className="lp-clause lp-warn"><b><span className="lp-pill">{t.lpAtRisk}</span> {t.lpClauseLiabilityCap}</b>{t.lpClauseRisk}</div><div className="lp-clause lp-bad"><b><span className="lp-pill">{t.lpFatal}</span> {t.lpClauseTermination}</b>{t.lpClauseFatal}</div></div><div className="lp-regpanel"><h4>{t.lpRegReference}</h4><div className="lp-reg"><b>POJK 10/POJK.05/2022</b><br />{t.lpArticle} 31 — {t.lpRegConsumerProtection}</div><div className="lp-reg"><b>UU PDP No. 27/2022</b><br />{t.lpArticle} 20 — {t.lpRegConsent}</div></div></div><div className="lp-mock-foot"><span className="lp-count"><i style={{ background: '#10b981' }} /> 12 {t.lpCompliant}</span><span className="lp-count"><i style={{ background: '#f59e0b' }} /> 3 {t.lpAtRisk}</span><span className="lp-count"><i style={{ background: '#ef4444' }} /> 1 {t.lpFatal}</span></div></div></div></section>

      <section className="lp-section" id="capabilities"><div className="lp-inner">{section(t.lpCapabilities, t.lpBuiltFor, t.lpCapabilitiesBody)}<div className="lp-bento">{[[Scale, t.lpComplianceTitle, t.lpComplianceBody, t.lpComplianceItems], [AlertTriangle, t.lpRiskTitle, t.lpRiskBody, t.lpRiskItems], [FileText, t.lpAuditTitle, t.lpAuditBody, t.lpAuditItems]].map(([Icon, title, body, items], index) => <div className="lp-card lp-brackets lp-reveal" style={{ '--i': index } as React.CSSProperties} key={title as string}><span className="lp-icon"><Icon size={20} /></span><h3>{title as string}</h3><p>{body as string}</p><ul>{(items as string).split('|').map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div></div></section>

      <section className="lp-section alt" id="how"><div className="lp-inner">{section(t.lpHow, t.lpStepsTitle, t.lpStepsBody)}<div className="lp-steps">{[[Upload, t.lpStepUploadTitle, t.lpStepUploadBody], [Search, t.lpStepScanTitle, t.lpStepScanBody], [Eye, t.lpStepReviewTitle, t.lpStepReviewBody], [Download, t.lpStepExportTitle, t.lpStepExportBody]].map(([Icon, title, body], index) => <div className="lp-step lp-reveal" style={{ '--i': index } as React.CSSProperties} key={index}><span className="lp-step-num">{index + 1}</span><h3><Icon size={15} style={{ verticalAlign: -2 }} /> {title as string}</h3><p>{body as string}</p></div>)}</div></div></section>

      <section className="lp-section" id="results"><div className="lp-inner">{section(t.lpResults, t.lpResultsTitle, t.lpResultsBody)}<div className="lp-grid-3">{[[Building2, t.lpVendorTitle, t.lpVendorBody], [ShieldCheck, t.lpPolicyTitle, t.lpPolicyBody], [CheckCircle2, t.lpAuditReadyTitle, t.lpAuditReadyBody]].map(([Icon, title, body], index) => <div className="lp-card lp-brackets lp-reveal" style={{ '--i': index } as React.CSSProperties} key={title as string}><span className="lp-icon"><Icon size={20} /></span><h3>{title as string}</h3><p>{body as string}</p></div>)}</div><p className="lp-fineprint">{t.lpFineprint}</p></div></section>

      <section className="lp-section" id="security"><div className="lp-inner">{section(t.lpSecurity, t.lpSecurityTitle, t.lpSecurityBody)}<div className="lp-sec-grid"><div className="lp-card lp-brackets lp-reveal" style={{ gap: 14 }}>{[[Lock, t.lpNeedToKnow], [ShieldCheck, t.lpShortSessions], [Eye, t.lpAuditability], [Upload, t.lpGuardrails], [FileText, t.lpDataOwnership]].map(([Icon, copy]) => <div className="lp-check" key={copy as string}><Icon size={16} /><span>{copy as string}</span></div>)}</div><div className="lp-perimeter lp-brackets lp-reveal"><h3>{t.lpPerimeterTitle}</h3><p>{t.lpPerimeterBody}</p></div></div></div></section>

      <section className="lp-section alt" id="demo"><div className="lp-inner lp-demo-grid"><div>{section(t.lpDemo, t.lpDemoTitle, t.lpDemoBody)}<div className="lp-tagrow"><span className="lp-tag">{t.lpDemoTagLive}</span><span className="lp-tag">{t.lpDemoTagCoverage}</span><span className="lp-tag">{t.lpDemoTagSecurity}</span></div></div><div className="lp-form lp-brackets lp-reveal">{requested ? <div className="lp-form-ok"><b>{t.lpRequestReceived}</b><br />{t.lpThankYou.replace('{name}', name.trim()).replace('{company}', company.trim())}</div> : <form onSubmit={handleDemoSubmit} style={{ display: 'contents' }}><div className="lp-field"><label htmlFor="lp-name">{t.lpFullName}</label><input id="lp-name" type="text" placeholder={t.lpNamePlaceholder} value={name} onChange={(event) => setName(event.target.value)} /></div><div className="lp-field"><label htmlFor="lp-company">{t.lpCompany}</label><input id="lp-company" type="text" placeholder={t.lpCompanyPlaceholder} value={company} onChange={(event) => setCompany(event.target.value)} /></div><div className="lp-field"><label htmlFor="lp-size">{t.lpTeamSize}</label><select id="lp-size" value={teamSize} onChange={(event) => setTeamSize(event.target.value)}>{TEAM_SIZES.map((size) => <option key={size} value={size}>{size} {t.lpPeople}</option>)}</select></div>{formError && <div className="lp-form-err">{t[formError]}</div>}<button type="submit" className="lp-btn lp-btn-primary" style={{ justifyContent: 'center' }}>{t.lpRequestDemo} <ArrowRight size={16} /></button></form>}</div></div></section>

      <footer className="lp-footer"><div className="lp-inner lp-footer-row"><Link to="/" className="lp-brand" style={{ fontSize: '0.9rem' }}><span className="lp-brand-mark" style={{ width: 26, height: 26 }}><Scale size={14} /></span>Legal Analyzer</Link><span>{t.lpFooterTagline}</span><nav><a href="#capabilities">{t.lpCapabilities}</a><a href="#security">{t.lpSecurity}</a><a href="#demo">{t.lpDemo}</a><Link to="/login">{t.lpSignIn}</Link></nav></div></footer>
    </div>
  );
}
