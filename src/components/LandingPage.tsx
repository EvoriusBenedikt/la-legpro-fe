import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Scale, ShieldCheck, FileText, AlertTriangle, Upload, Search,
  Eye, Download, Lock, Users, CheckCircle2, ArrowRight, Building2, Award,
} from 'lucide-react';
import './LandingPage.css';

const TEAM_SIZES = ['1–10', '11–50', '51–200', '200+'];

export default function LandingPage() {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [teamSize, setTeamSize] = useState(TEAM_SIZES[1]);
  const [formError, setFormError] = useState('');
  const [requested, setRequested] = useState(false);

  const handleDemoSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim() || !company.trim()) {
      setFormError('Please fill in your name and company.');
      return;
    }
    // TODO: POST to a demo-request endpoint when available, e.g.
    // fetch(`${API_BASE}/api/demo-requests`, { method: 'POST', ... })
    setRequested(true);
  };

  return (
    <div className="lp">
      {/* ---------- nav ---------- */}
      <header className="lp-nav">
        <div className="lp-inner lp-nav-row">
          <Link to="/" className="lp-brand">
            <span className="lp-brand-mark"><Scale size={18} /></span>
            LA Legal-Analyzer
          </Link>
          <nav className="lp-links">
            <a href="#capabilities">Capabilities</a>
            <a href="#how">How it works</a>
            <a href="#results">Results</a>
            <a href="#security">Security</a>
          </nav>
          <Link to="/login" className="lp-btn lp-btn-ghost lp-btn-sm">Sign in</Link>
          <a href="#demo" className="lp-btn lp-btn-primary lp-btn-sm">Request a demo</a>
        </div>
      </header>

      {/* ---------- 1. hero ---------- */}
      <section className="lp-hero">
        <div className="lp-inner lp-hero-grid">
          <div>
            <span className="lp-eyebrow">IN-HOUSE LEGAL COMPLIANCE</span>
            <h1>Compliance, verified before you sign.</h1>
            <p className="lp-lede">
              LA Legal-Analyzer scans contracts and internal documents against
              applicable laws and regulations — mapping every clause to its source
              text and flagging gaps before they become liabilities.
            </p>
            <div className="lp-cta-row">
              <a href="#demo" className="lp-btn lp-btn-primary">
                Request a demo <ArrowRight size={16} />
              </a>
              <Link to="/login" className="lp-btn lp-btn-ghost">Sign in to the app</Link>
            </div>
            <div className="lp-stats">
              <div className="lp-stat"><b>53,000+</b><span>regulatory clauses indexed</span></div>
              <div className="lp-stat"><b>12+</b><span>regulatory bodies covered</span></div>
              <div className="lp-stat"><b>1,000+</b><span>regulations catalogued</span></div>
              <div className="lp-stat"><b>80%</b><span>review-time reduction target</span></div>
            </div>
          </div>

          {/* live analyzer preview (illustrative mock) */}
          <div className="lp-mock" aria-hidden="true">
            <div className="lp-mock-bar">
              <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
              <span className="lp-mock-title">PKS_Telekomunikasi_2026.pdf — Compliance Check</span>
              <span className="lp-mock-score">Score 87 · Needs review</span>
            </div>
            <div className="lp-mock-body">
              <div className="lp-clauses">
                <div className="lp-clause lp-ok">
                  <b><span className="lp-pill">SESUAI</span> Pasal 4 — Data protection</b>
                  Processing of customer data follows <mark>explicit consent</mark> procedures.
                </div>
                <div className="lp-clause lp-warn">
                  <b><span className="lp-pill">BERESIKO</span> Pasal 9 — Liability cap</b>
                  Cap set at <mark>1× annual fees</mark>; sector practice suggests review.
                </div>
                <div className="lp-clause lp-bad">
                  <b><span className="lp-pill">FATAL</span> Pasal 12 — Termination</b>
                  <mark>Missing mandatory 30-day cure period</mark> required by regulation.
                </div>
              </div>
              <div className="lp-regpanel">
                <h4>REGULATION REFERENCE</h4>
                <div className="lp-reg"><b>POJK 10/POJK.05/2022</b><br />Pasal 31 — consumer protection obligations…</div>
                <div className="lp-reg"><b>UU PDP No. 27/2022</b><br />Pasal 20 — consent requirements…</div>
                <div className="lp-reg"><b>POJK 25/POJK.07/2024</b><br /> cure-period provisions…</div>
              </div>
            </div>
            <div className="lp-mock-foot">
              <span className="lp-count"><i style={{ background: '#10b981' }} /> 12 Sesuai</span>
              <span className="lp-count"><i style={{ background: '#f59e0b' }} /> 3 Berisiko</span>
              <span className="lp-count"><i style={{ background: '#ef4444' }} /> 1 Fatal</span>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 2. capabilities ---------- */}
      <section className="lp-section" id="capabilities">
        <div className="lp-inner">
          <div className="lp-kicker">CAPABILITIES</div>
          <h2>Built for the way in-house teams work</h2>
          <p className="lp-sub">Three goals, one analyzer — every finding traceable to the exact article it came from.</p>
          <div className="lp-grid-3">
            <div className="lp-card">
              <span className="lp-icon"><Scale size={20} /></span>
              <h3>Regulatory Compliance Check</h3>
              <p>Map each clause to the laws and regulations that govern it — no more manual cross-referencing across fragmented PDFs.</p>
              <ul>
                <li>Clause-to-article mapping with exact citations</li>
                <li>OJK, banking, ITE, PDP, and sectoral coverage</li>
                <li>Per-clause verdicts: compliant, at-risk, non-compliant</li>
              </ul>
            </div>
            <div className="lp-card">
              <span className="lp-icon"><AlertTriangle size={20} /></span>
              <h3>Risk &amp; Gap Detection</h3>
              <p>Surface what the draft is missing — outdated references, conflicting clauses, and absent protections — before counterparties do.</p>
              <ul>
                <li>Missing-clause detection against regulatory baselines</li>
                <li>Outdated or revoked reference flagging</li>
                <li>Actionable amendment recommendations</li>
              </ul>
            </div>
            <div className="lp-card">
              <span className="lp-icon"><FileText size={20} /></span>
              <h3>Audit Trail &amp; Reporting</h3>
              <p>Export findings your auditors can actually follow — every flag linked back to source text, versioned and attributable.</p>
              <ul>
                <li>Exportable compliance reports per document</li>
                <li>Full lifecycle history: upload, review, decision</li>
                <li>Knowledge graph of regulation relationships</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 3. how it works ---------- */}
      <section className="lp-section alt" id="how">
        <div className="lp-inner">
          <div className="lp-kicker">HOW IT WORKS</div>
          <h2>From upload to signed-off in four steps</h2>
          <p className="lp-sub">No new workflow to learn — the analyzer slots into the review you already do.</p>
          <div className="lp-steps">
            <div className="lp-step">
              <span className="lp-step-num">1</span>
              <h3><Upload size={15} style={{ verticalAlign: -2 }} /> Upload</h3>
              <p>Drop in contracts or policies — PDF, Word, Excel, even scanned images with OCR fallback.</p>
            </div>
            <div className="lp-step">
              <span className="lp-step-num">2</span>
              <h3><Search size={15} style={{ verticalAlign: -2 }} /> Scan</h3>
              <p>Each clause is extracted and checked against the live regulatory knowledge base.</p>
            </div>
            <div className="lp-step">
              <span className="lp-step-num">3</span>
              <h3><Eye size={15} style={{ verticalAlign: -2 }} /> Review findings</h3>
              <p>Work the flagged list: green passes, amber needs judgment, red needs action — all cited.</p>
            </div>
            <div className="lp-step">
              <span className="lp-step-num">4</span>
              <h3><Download size={15} style={{ verticalAlign: -2 }} /> Export report</h3>
              <p>Generate the audit-ready report and archive the decision trail for the file.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 4. team ---------- */}
      <section className="lp-section" id="team">
        <div className="lp-inner">
          <div className="lp-kicker">TEAM &amp; CREDENTIALS</div>
          <h2>Built with legal rigor, engineered for scale</h2>
          <p className="lp-sub">A combined bench of legal practitioners and platform engineers — organized by what each group is accountable for.</p>
          <div className="lp-grid-3">
            <div className="lp-card">
              <span className="lp-avatar"><Scale size={20} /></span>
              <h3>Legal &amp; Compliance Advisors</h3>
              <p>Practitioners who define what "correct" means: review methodology, regulatory coverage priorities, and citation standards.</p>
              <div className="lp-tagrow">
                <span className="lp-tag">OJK / POJK practice</span>
                <span className="lp-tag">Contract drafting &amp; review</span>
                <span className="lp-tag">GCG &amp; corporate secretarial</span>
              </div>
            </div>
            <div className="lp-card">
              <span className="lp-avatar"><Users size={20} /></span>
              <h3>Product &amp; Engineering</h3>
              <p>Platform engineers behind the retrieval pipeline, document understanding, and the review interfaces your team touches daily.</p>
              <div className="lp-tagrow">
                <span className="lp-tag">Applied NLP / RAG systems</span>
                <span className="lp-tag">Secure SaaS architecture</span>
                <span className="lp-tag">Enterprise integrations</span>
              </div>
            </div>
            <div className="lp-card">
              <span className="lp-avatar"><Award size={20} /></span>
              <h3>Data &amp; Security</h3>
              <p>Custodians of the knowledge base and access controls — currency of regulations, integrity of evidence, confidentiality of your documents.</p>
              <div className="lp-tagrow">
                <span className="lp-tag">Regulatory data curation</span>
                <span className="lp-tag">Access control &amp; auditability</span>
                <span className="lp-tag">Secure deployment practices</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 5. use cases ---------- */}
      <section className="lp-section alt" id="results">
        <div className="lp-inner">
          <div className="lp-kicker">USE CASES</div>
          <h2>Where in-house teams feel it first</h2>
          <p className="lp-sub">Typical engagements and the shape of the improvement — measured per pilot, reported with evidence.</p>
          <div className="lp-grid-3">
            <div className="lp-card">
              <span className="lp-icon"><Building2 size={20} /></span>
              <h3>Vendor agreement review</h3>
              <div className="lp-beforeafter">
                <div className="lp-ba lp-ba-before"><b>BEFORE</b><span>Multi-day manual read-through; issues surface during negotiation or after signing.</span></div>
                <div className="lp-ba lp-ba-after"><b>AFTER</b><span>Same-day flagged draft with cited risks; negotiation starts from evidence.</span></div>
              </div>
            </div>
            <div className="lp-card">
              <span className="lp-icon"><ShieldCheck size={20} /></span>
              <h3>Policy harmonization</h3>
              <div className="lp-beforeafter">
                <div className="lp-ba lp-ba-before"><b>BEFORE</b><span>New regulation lands; nobody knows which internal policies it invalidates.</span></div>
                <div className="lp-ba lp-ba-after"><b>AFTER</b><span>Knowledge graph shows affected policies the day the rule changes.</span></div>
              </div>
            </div>
            <div className="lp-card">
              <span className="lp-icon"><CheckCircle2 size={20} /></span>
              <h3>Audit readiness</h3>
              <div className="lp-beforeafter">
                <div className="lp-ba lp-ba-before"><b>BEFORE</b><span>Weeks assembling scattered files and reconstructing decisions.</span></div>
                <div className="lp-ba lp-ba-after"><b>AFTER</b><span>One export per document: findings, sources, and decision history.</span></div>
              </div>
            </div>
          </div>
          <p className="lp-fineprint">Illustrative scenarios based on common engagements — request a pilot for measured, team-specific results.</p>
        </div>
      </section>

      {/* ---------- 6. security ---------- */}
      <section className="lp-section" id="security">
        <div className="lp-inner">
          <div className="lp-kicker">SECURITY &amp; TRUST</div>
          <h2>Confidential by architecture, not by promise</h2>
          <p className="lp-sub">In-house teams entrust us with their most sensitive documents. Here is how that trust is enforced technically.</p>
          <div className="lp-sec-grid">
            <div className="lp-card" style={{ gap: 14 }}>
              <div className="lp-check"><Lock size={16} /><span><b>Need-to-know access.</b> Role-based controls gate every module; classified documents are filtered per user clearance.</span></div>
              <div className="lp-check"><ShieldCheck size={16} /><span><b>Short-lived sessions.</b> Signed tokens expire within 24 hours; registration can never self-grant elevated roles.</span></div>
              <div className="lp-check"><Eye size={16} /><span><b>Full auditability.</b> Uploads, reviews, approvals, and exports are logged with actor and timestamp.</span></div>
              <div className="lp-check"><Upload size={16} /><span><b>Upload guardrails.</b> Strict file-type and size limits protect the pipeline from malformed or hostile inputs.</span></div>
              <div className="lp-check"><FileText size={16} /><span><b>Your data stays yours.</b> Documents are processed for your matters only — never used to train shared models.</span></div>
            </div>
            <div className="lp-perimeter">
              <h3>Deploys inside your perimeter</h3>
              <p>Containerized services run in your infrastructure or approved cloud — data, vectors, and audit logs never need to leave your boundary. Detailed architecture and data-flow documentation available under NDA during evaluation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 7. demo ---------- */}
      <section className="lp-section alt" id="demo">
        <div className="lp-inner lp-demo-grid">
          <div>
            <div className="lp-kicker">REQUEST A DEMO</div>
            <h2>See your own contract, analyzed live</h2>
            <p className="lp-sub">A 30-minute working session: we run one of your agreements through the analyzer and walk the findings together. No slideware.</p>
            <div className="lp-tagrow">
              <span className="lp-tag">Live clause walkthrough</span>
              <span className="lp-tag">Coverage Q&A</span>
              <span className="lp-tag">Security review pack</span>
            </div>
          </div>
          <div className="lp-form">
            {requested ? (
              <div className="lp-form-ok">
                <b>Request received.</b><br />
                Thank you, {name.trim()} — our team will contact {company.trim()} shortly to schedule your session.
              </div>
            ) : (
              <form onSubmit={handleDemoSubmit} style={{ display: 'contents' }}>
                <div className="lp-field">
                  <label htmlFor="lp-name">Full name</label>
                  <input id="lp-name" type="text" placeholder="e.g. Andini Pratiwi" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="lp-field">
                  <label htmlFor="lp-company">Company</label>
                  <input id="lp-company" type="text" placeholder="e.g. PT Contoh Finansial" value={company} onChange={(e) => setCompany(e.target.value)} />
                </div>
                <div className="lp-field">
                  <label htmlFor="lp-size">Legal team size</label>
                  <select id="lp-size" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
                    {TEAM_SIZES.map((s) => <option key={s} value={s}>{s} people</option>)}
                  </select>
                </div>
                {formError && <div className="lp-form-err">{formError}</div>}
                <button type="submit" className="lp-btn lp-btn-primary" style={{ justifyContent: 'center' }}>
                  Request a demo <ArrowRight size={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-inner lp-footer-row">
          <Link to="/" className="lp-brand" style={{ fontSize: '0.9rem' }}>
            <span className="lp-brand-mark" style={{ width: 26, height: 26 }}><Scale size={14} /></span>
            LA Legal-Analyzer
          </Link>
          <span>Compliance, verified before you sign.</span>
          <nav>
            <a href="#capabilities">Capabilities</a>
            <a href="#security">Security</a>
            <a href="#demo">Demo</a>
            <Link to="/login">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
