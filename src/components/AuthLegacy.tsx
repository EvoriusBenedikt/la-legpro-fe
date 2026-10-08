// Frozen snapshot of the two-panel auth UI (Wise-style single-column redesign,
// 2026-10-09, plans/2026-10-09-login-wise-mobile-ui.md). Served at
// /login/legacy while LEGACY_LOGIN (VITE_LEGACY_LOGIN) is on. Delete this
// file, the flag, and the route together when the rollout window closes.
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Lock, User, LogIn, UserPlus, Mail, Scale, Eye, EyeOff, ShieldCheck, Brain, Check, Circle, AlertTriangle } from 'lucide-react';
import api, { isHttpError, isNetworkError } from '../services/api';
import { Link } from 'react-router-dom';
import { useStrings, useLocale, type StringKey } from '../i18n';
import LoadingOrb from './LoadingOrb';
import { setSetting } from '../settings';

type AuthField =
  | 'username'
  | 'email'
  | 'password'
  | 'confirmPassword'
  // Account-page change-password codes, so SERVER_FIELD_ERRORS below can
  // stay exhaustive against the backend's detail codes (auth.py).
  | 'old_password'
  | 'new_password';

// Known backend auth error details (la-legpro-be/api/auth.py) mapped to the
// form fields they refer to, used to highlight the offending inputs in red.
// Unrecognized messages (backend rewording) degrade to shake-only with no
// field highlight; requests that never reached the server get their own
// authErrNetwork banner. Keep in sync with the BE detail strings.
const SERVER_FIELD_ERRORS: Record<string, AuthField[]> = {
  'INVALID_CREDENTIALS': ['username', 'password'],
  'USERNAME_TAKEN': ['username'],
  'EMAIL_TAKEN': ['email'],
  'EMAIL_WHITESPACE': ['email'],
  'PASSWORD_NEEDS_UPPERCASE': ['password'],
  'PASSWORD_NEEDS_NUMBER': ['password'],
  'PASSWORD_NEEDS_SYMBOL': ['password'],
  'CURRENT_PASSWORD_INCORRECT': ['old_password'],
  'PASSWORD_SAME_AS_OLD': ['new_password'],
};

// The BE contract sends human-readable English sentences as `detail`
// (auth.py), never machine codes. Normalizing every detail — plain string or
// 422 validation array — through this map is the single coupling point; the
// UI then renders only localized copy (SERVER_MESSAGE_KEYS below), never raw
// server text. Unrecognized strings leave the code undefined and degrade to
// the generic authErrFailed banner. Keep in sync with the BE detail strings.
const MESSAGE_CODE_MAP: Record<string, string> = {
  'Incorrect username or password': 'INVALID_CREDENTIALS',
  'Username already registered': 'USERNAME_TAKEN',
  'Email already registered': 'EMAIL_TAKEN',
  'Email must not contain whitespace': 'EMAIL_WHITESPACE',
  'Password must contain at least one uppercase letter': 'PASSWORD_NEEDS_UPPERCASE',
  'Password must contain at least one number': 'PASSWORD_NEEDS_NUMBER',
  'Password must contain at least one symbol': 'PASSWORD_NEEDS_SYMBOL',
  'Current password is incorrect': 'CURRENT_PASSWORD_INCORRECT',
  'New password must be different from the current password': 'PASSWORD_SAME_AS_OLD',
  // Login gate for migration 007 (admin user management): inactive accounts
  // get a 403 with this exact sentence from auth.py login.
  'Account deactivated. Contact your administrator.': 'ACCOUNT_DEACTIVATED',
};

// Normalized code → localized banner message. Codes without an entry here
// (VALIDATION_ERROR from the 422 array path, the Account-page-only codes
// above, any future BE rewording) fall back to authErrFailed, so neither a
// bare code nor raw server text can ever surface.
const SERVER_MESSAGE_KEYS: Record<string, StringKey> = {
  INVALID_CREDENTIALS: 'authErrInvalidCredentials',
  USERNAME_TAKEN: 'authErrUsernameTaken',
  EMAIL_TAKEN: 'authErrEmailTaken',
  EMAIL_WHITESPACE: 'authErrEmailSpace',
  PASSWORD_NEEDS_UPPERCASE: 'authErrNeedUppercase',
  PASSWORD_NEEDS_NUMBER: 'authErrNeedNumber',
  PASSWORD_NEEDS_SYMBOL: 'authErrNeedSymbol',
  // Banner-only (no SERVER_FIELD_ERRORS entry): the credentials are not the
  // problem, so no input gets the red highlight.
  ACCOUNT_DEACTIVATED: 'authErrDeactivated',
};

export default function AuthLegacy() {
  const t = useStrings();
  const locale = useLocale();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Caps Lock hint (critique P3): tracks the modifier while a case-sensitive
  // field has focus — username (critique P2 2026-10-06) or either password;
  // the handlers live below with the other field helpers.
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AuthField, boolean>>>({});
  // Three-state so the card's entry fadeIn can never re-run: after the first
  // shake the card parks on 'settled' (auth-shake-settled = animation:none)
  // instead of dropping back to the base rule and restarting fadeIn.
  const [shake, setShake] = useState<'off' | 'on' | 'settled'>('off');
  const settleTimer = useRef<number | null>(null);
  const { login } = useAuth();

  // Live password requirements (the register checklist and the submit gate
  // share these definitions). A symbol is any non-alphanumeric, non-whitespace
  // character — spaces deliberately don't count (user decision 2026-10-05).
  const ruleUpper = /[A-Z]/.test(password);
  const ruleNumber = /\d/.test(password);
  const ruleSymbol = /[^A-Za-z0-9\s]/.test(password);

  const markFields = (fields: AuthField[]) => {
    const next: Partial<Record<AuthField, boolean>> = {};
    for (const f of fields) next[f] = true;
    setFieldErrors(next);
  };

  const clearField = (f: AuthField) =>
    setFieldErrors((prev) => (prev[f] ? { ...prev, [f]: false } : prev));

  // getModifierState on key events is the only reliable Caps Lock signal;
  // blur clears the hint so it never goes stale after leaving the field.
  const handleCapsLockKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };
  const clearCapsLock = () => setCapsLockOn(false);

  // Single error path (called from submit handlers): banner message + red
  // highlight on the offending fields + card shake. The timeout settles the
  // shake even when the animation is disabled (reduced motion never fires
  // animationend), so the next error retriggers.
  const raiseError = (message: string, fields?: AuthField[]) => {
    setError(message);
    if (fields) markFields(fields);
    setShake('on');
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(
      () => setShake((s) => (s === 'on' ? 'settled' : s)),
      500
    );
  };

  // Clear a pending settle timer if the component unmounts mid-shake.
  useEffect(() => () => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The submit button is aria-disabled (not disabled) while loading so
    // keyboard focus never falls to <body>; this guard replaces the
    // double-submit protection the disabled attribute used to provide.
    if (loading) return;
    setError('');
    setFieldErrors({});

    // Required-field gates: the form is noValidate because native bubbles
    // are English-only and unstyleable; empty fields raise localized errors
    // through the same banner + highlight + shake path as every other
    // failure.
    if (!username.trim()) {
      raiseError(t.authErrUsernameRequired, ['username']);
      return;
    }
    if (!isLogin && !email.trim()) {
      raiseError(t.authErrEmailRequired, ['email']);
      return;
    }
    if (!password) {
      raiseError(t.authErrPasswordRequired, ['password']);
      return;
    }
    if (!isLogin && !confirmPassword) {
      raiseError(t.authErrConfirmRequired, ['confirmPassword']);
      return;
    }

    if (!isLogin) {
      // Whitespace makes an email invalid — rejected, never auto-stripped, so
      // the user retypes it. The format check replaces the native validation
      // the input no longer runs (see the comment on the email field JSX).
      if (/\s/.test(email)) {
        raiseError(t.authErrEmailSpace, ['email']);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        raiseError(t.authErrEmailFormat, ['email']);
        return;
      }
    }

    if (!isLogin && password !== confirmPassword) {
      raiseError(t.authErrMismatch, ['password', 'confirmPassword']);
      return;
    }

    if (!isLogin) {
      if (!ruleUpper) {
        raiseError(t.authErrNeedUppercase, ['password']);
        return;
      }
      if (!ruleNumber) {
        raiseError(t.authErrNeedNumber, ['password']);
        return;
      }
      if (!ruleSymbol) {
        raiseError(t.authErrNeedSymbol, ['password']);
        return;
      }
    }

    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin ? { username, password } : { username, email, password };
    
    try {
      const response = await api.post(endpoint, payload);

      login(response.data.access_token, response.data.user);
    } catch (err) {
      // Critique P2 (2026-10-06): a request that never reached the server
      // (backend down, timeout, DNS) is an infrastructure failure, not a
      // credential problem — the old fallback told users to re-check a
      // password that was never wrong and sent them to IT mid-outage.
      // Banner only: no field highlight, the fields are not the problem.
      if (isNetworkError(err)) {
        raiseError(t.authErrNetwork);
        return;
      }
      const responseDetail = isHttpError(err) ? err.response.data?.detail : undefined;
      let errCode: string | undefined;
      let fieldErrs: AuthField[] | undefined;
      if (responseDetail) {
        if (Array.isArray(responseDetail) && responseDetail.length > 0) {
          // FastAPI validation errors arrive as [{ loc, msg, type }];
          // normalize the first message through the shared code map.
          const first = responseDetail[0] as { msg?: string } | string;
          const msg = typeof first === 'string' ? first : (first.msg ?? '');
          errCode = MESSAGE_CODE_MAP[msg] || 'VALIDATION_ERROR';
        } else if (typeof responseDetail === 'string') {
          // Auth endpoints send English sentences as detail (auth.py) —
          // normalize them through the same map so highlighting and
          // localized copy work for every failure, not just 422 arrays.
          errCode = MESSAGE_CODE_MAP[responseDetail];
        }
        if (errCode) {
          fieldErrs = SERVER_FIELD_ERRORS[errCode];
        }
      }
      // The banner renders localized copy only: known code → its message,
      // anything else (unknown sentence, VALIDATION_ERROR) → the generic
      // authErrFailed guidance. Network failures never reach this point —
      // the isNetworkError branch above gives them their own copy.
      const messageKey = errCode ? SERVER_MESSAGE_KEYS[errCode] : undefined;
      raiseError(messageKey ? t[messageKey] : t.authErrFailed, fieldErrs);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      {/* Left Branding Side */}
      <div className="auth-brand-side">
        <div className="brand-content">
          <div className="brand-logo-container">
            <img src="/LegalAnalyzerLogo.png" alt="" className="brand-logo-img" />
          </div>
          {/* Display brand per the owner decision of 2026-10-06: "Legal
              Analyzer" is THE product name — the former "LA LegPro" display
              name is retired by owner ruling (repo folders keep the legacy
              identifier); Lintasarta is the parent company, credited in the
              auth-credit line below. The "LA Legal-Analyzer" <title> and
              LandingPage variants were normalized to this. */}
          <h1>Legal Analyzer</h1>
          <p className="brand-tagline">
            {t.authTagline}
          </p>

          {/* Feature icons are uniformly white on the dark panel (2026-10-06
              polish): the former #38BDF8/#10B981 were hardcoded non-token
              hues and a decorative Verdict-Triad use. */}
          <div className="auth-features">
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <ShieldCheck size={24} color="#fff" />
              </div>
              <div>
                <h3>{t.authFeat1Title}</h3>
                <p>{t.authFeat1Desc}</p>
              </div>
            </div>

            <div className="auth-feature">
              <div className="auth-feature-icon">
                <Brain size={24} color="#fff" />
              </div>
              <div>
                <h3>{t.authFeat2Title}</h3>
                <p>{t.authFeat2Desc}</p>
              </div>
            </div>

            <div className="auth-feature">
              <div className="auth-feature-icon">
                <Scale size={24} color="#fff" />
              </div>
              <div>
                <h3>{t.authFeat3Title}</h3>
                <p>{t.authFeat3Desc}</p>
              </div>
            </div>
          </div>
          
          {/* Parent-company credit — KEPT per the owner decision of
              2026-10-06: Lintasarta is the mother company, Legal Analyzer
              the product. Static English in both locales, like the brand
              name itself (2026-09-30 convention). */}
          <div className="auth-credit">
            <div className="auth-credit-dot" />
            Powered by LA Lintasarta Core
          </div>
        </div>
      </div>

      {/* Right Form Side */}
      <div className="auth-form-side">
        <div
          className={`auth-card${shake === 'on' ? ' auth-shake' : shake === 'settled' ? ' auth-shake-settled' : ''}`}
          onAnimationEnd={(e) => { if (e.animationName === 'authShake') setShake('settled'); }}
        >
          <button
            type="button"
            className="auth-language-toggle"
            aria-label={t.authLangToggleAria}
            onClick={() => setSetting('locale', locale === 'id' ? 'en' : 'id')}
          >
            {locale === 'id' ? 'EN' : 'ID'}
          </button>
          <div className="auth-header">
            <h2>{isLogin ? t.authWelcome : t.authRegisterTitle}</h2>
            <p>{isLogin ? t.authWelcomeSub : t.authRegisterSub}</p>
            {/* On-premises trust line (2026-10-06, owner copy). The icon
                inherits the secondary text color — a green tint would be
                decorative Verdict-Triad use. */}
            <p className="auth-trust-note">
              <ShieldCheck size={14} aria-hidden="true" />
              {t.authTrustNote}
            </p>
          </div>

          {error && (
            <div id="auth-error-msg" className="auth-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form" noValidate>
            <div className="input-group">
              <label htmlFor="auth-username">{t.authUsername}</label>
              <div className={`input-wrapper${fieldErrors.username ? ' input-error' : ''}`}>
                <User size={18} />
                {/* autoFocus saves the first tap; capitalize/correct/spell
                    are off so mobile keyboards cannot mangle the
                    case-sensitive username (critique P2 Jordan). */}
                <input 
                  id="auth-username"
                  type="text" 
                  required
                  className="auth-input"
                  placeholder={t.authUsernamePh}
                  autoComplete="username"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-invalid={fieldErrors.username || undefined}
                  aria-describedby={fieldErrors.username ? 'auth-error-msg' : undefined}
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); clearField('username'); }}
                  onKeyDown={handleCapsLockKey}
                  onKeyUp={handleCapsLockKey}
                  onBlur={clearCapsLock}
                />
              </div>
              {/* The hint covers the username too (critique P2 2026-10-06):
                  it is case-sensitive exactly like the password, and an
                  accidental Caps Lock here failed login just as silently. */}
              {capsLockOn && (
                <p className="auth-caps-hint" role="status">
                  <AlertTriangle size={12} aria-hidden="true" />
                  {t.authCapsLockOn}
                </p>
              )}
            </div>

            {!isLogin && (
              <div className="input-group">
                <label htmlFor="auth-email">{t.authEmail}</label>
                <div className={`input-wrapper${fieldErrors.email ? ' input-error' : ''}`}>
                  <Mail size={18} />
                  {/* The input below is deliberately "text" + inputMode, not
                      "email": native email validation silently trims
                      leading/trailing spaces and blocks inner ones with a
                      generic browser bubble, which would bypass the custom
                      whitespace/format errors raised in handleSubmit. */}
                  <input 
                    id="auth-email"
                    type="text"
                    inputMode="email" 
                    required
                    className="auth-input"
                    placeholder={t.authEmailPh}
                    autoComplete="email"
                    aria-invalid={fieldErrors.email || undefined}
                    aria-describedby={fieldErrors.email ? 'auth-error-msg' : undefined}
                    value={email}
                    onChange={(e) => { setEmail(e.target.value.toLowerCase()); clearField('email'); }}
                  />
                </div>
              </div>
            )}

            <div className="input-group">
              <label htmlFor="auth-password">{t.authPassword}</label>
              <div className={`input-wrapper${fieldErrors.password ? ' input-error' : ''}`}>
                <Lock size={18} />
                <input 
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  required
                  className="auth-input"
                  placeholder={t.authPasswordPh}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  aria-invalid={fieldErrors.password || undefined}
                  aria-describedby={fieldErrors.password ? 'auth-error-msg' : undefined}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearField('password'); }}
                  onKeyDown={handleCapsLockKey}
                  onKeyUp={handleCapsLockKey}
                  onBlur={clearCapsLock}
                />
                <button 
                  type="button" 
                  className="auth-eye"
                  aria-label={showPassword ? t.authHidePassword : t.authShowPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {capsLockOn && (
                <p className="auth-caps-hint" role="status">
                  <AlertTriangle size={12} aria-hidden="true" />
                  {t.authCapsLockOn}
                </p>
              )}
              {!isLogin && (
                <ul className="auth-rules" aria-live="polite">
                  <li className={ruleUpper ? 'auth-rule auth-rule--met' : 'auth-rule'}>
                    {ruleUpper ? <Check size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                    <span>{t.authRuleUpper}</span>
                  </li>
                  <li className={ruleNumber ? 'auth-rule auth-rule--met' : 'auth-rule'}>
                    {ruleNumber ? <Check size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                    <span>{t.authRuleNumber}</span>
                  </li>
                  <li className={ruleSymbol ? 'auth-rule auth-rule--met' : 'auth-rule'}>
                    {ruleSymbol ? <Check size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                    <span>{t.authRuleSymbol}</span>
                  </li>
                </ul>
              )}
            </div>

            {!isLogin && (
              <div className="input-group">
                <label htmlFor="auth-confirm">{t.authConfirm}</label>
                <div className={`input-wrapper${fieldErrors.confirmPassword ? ' input-error' : ''}`}>
                  <Lock size={18} />
                  <input 
                    id="auth-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    className="auth-input"
                    placeholder={t.authConfirmPh}
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.confirmPassword || undefined}
                    aria-describedby={fieldErrors.confirmPassword ? 'auth-error-msg' : undefined}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); clearField('confirmPassword'); }}
                    onKeyDown={handleCapsLockKey}
                    onKeyUp={handleCapsLockKey}
                    onBlur={clearCapsLock}
                  />
                  <button 
                    type="button" 
                    className="auth-eye"
                    aria-label={showConfirmPassword ? t.authHidePassword : t.authShowPassword}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {capsLockOn && (
                  <p className="auth-caps-hint" role="status">
                    <AlertTriangle size={12} aria-hidden="true" />
                    {t.authCapsLockOn}
                  </p>
                )}
              </div>
            )}

            {/* aria-disabled instead of disabled (critique P2): a truly
                disabled button drops focus to <body> mid-submit; the
                handler guard keeps double-submit protection. The orb
                replaces the icon while loading — size 20, theme pinned
                dark because light-theme particles vanish on the blue face
                (KG-wash precedent). The hidden status region announces the
                transition; button-text swaps alone are not reliably read.
                Single-class auth-button (critique P2 2026-10-06): the extra
                btn-primary leaked its :hover lift+glow while this button is
                aria-disabled (its guard checks :disabled only); .auth-button
                carries the full primary treatment, resting glow included.
                Do not re-add it. */}
            <button 
              type="submit" 
              aria-disabled={loading}
              className="auth-button"
            >
              {loading ? (
                <LoadingOrb inline size={20} state="connecting" theme="dark" />
              ) : (
                isLogin ? <LogIn size={18} /> : <UserPlus size={18} />
              )}
              {loading ? t.authProcessing : (isLogin ? t.authSignIn : t.authSignUp)}
            </button>
            <span className="visually-hidden" role="status">
              {loading ? t.authProcessing : ''}
            </span>
          </form>

          <div className="auth-toggle">
            {isLogin ? t.authNoAccount : t.authHaveAccount}
            <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); setFieldErrors({}); }}>
              {isLogin ? t.authRegisterHere : t.authLoginHere}
            </button>
          </div>

          {/* Forgot password gets the same static treatment as the contact
              note (2026-10-06 user decision): login-mode only, no flow
              built — plans/2026-10-05-forgot-password.md stays parked. */}
          {isLogin && <p className="auth-contact-note">{t.authForgotNote}</p>}

          {/* Static guidance line, not a link (2026-10-06 decision): no
              SMTP or real administrator contact is configured yet, so the
              old personal-Gmail mailto is gone and a glowing dead-click
              button was rejected. Wire to a configured address when
              contacts land. */}
          <p className="auth-contact-note">{t.authContactNote}</p>

          <div className="auth-toggle auth-toggle--tight">
            <Link to="/" className="auth-back-link">
              {t.authBack}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
