import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, User, LogIn, UserPlus, Mail, Scale, Eye, EyeOff, ShieldCheck, Brain } from 'lucide-react';
import api, { isHttpError } from '../services/api';
import { Link } from 'react-router-dom';
import { useStrings } from '../i18n';

type AuthField = 'username' | 'email' | 'password' | 'confirmPassword';

// Known backend auth error details (la-legpro-be/api/auth.py) mapped to the
// form fields they refer to, used to highlight the offending inputs in red.
// Unrecognized messages (network failures, backend rewording) degrade to
// shake-only with no field highlight. Keep in sync with the BE detail strings.
const SERVER_FIELD_ERRORS: Record<string, AuthField[]> = {
  'Incorrect username or password': ['username', 'password'],
  'Username already registered': ['username'],
  'Email already registered': ['email'],
};

export default function Auth() {
  const t = useStrings();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AuthField, boolean>>>({});
  // Three-state so the card's entry fadeIn can never re-run: after the first
  // shake the card parks on 'settled' (auth-shake-settled = animation:none)
  // instead of dropping back to the base rule and restarting fadeIn.
  const [shake, setShake] = useState<'off' | 'on' | 'settled'>('off');
  const settleTimer = useRef<number | null>(null);
  const { login } = useAuth();

  const markFields = (fields: AuthField[]) => {
    const next: Partial<Record<AuthField, boolean>> = {};
    for (const f of fields) next[f] = true;
    setFieldErrors(next);
  };

  const clearField = (f: AuthField) =>
    setFieldErrors((prev) => (prev[f] ? { ...prev, [f]: false } : prev));

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
    setError('');
    setFieldErrors({});

    if (!isLogin && password !== confirmPassword) {
      raiseError(t.authErrMismatch, ['password', 'confirmPassword']);
      return;
    }

    if (!isLogin) {
      if (!/\d/.test(password)) {
        raiseError(t.authErrNeedNumber, ['password']);
        return;
      }
      if (!/[^A-Za-z0-9]/.test(password)) {
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
      const detail = isHttpError(err) ? err.response.data?.detail : undefined;
      raiseError(
        detail ? String(detail) : t.authErrFailed,
        detail ? SERVER_FIELD_ERRORS[String(detail)] : undefined
      );
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
          <h1>Legal Analyzer</h1>
          <p className="brand-tagline">
            {t.authTagline}
          </p>

          <div className="auth-features">
            <div className="auth-feature">
              <div className="auth-feature-icon">
                <ShieldCheck size={24} color="var(--accent-color)" />
              </div>
              <div>
                <h3>{t.authFeat1Title}</h3>
                <p>{t.authFeat1Desc}</p>
              </div>
            </div>

            <div className="auth-feature">
              <div className="auth-feature-icon">
                <Brain size={24} color="#38BDF8" />
              </div>
              <div>
                <h3>{t.authFeat2Title}</h3>
                <p>{t.authFeat2Desc}</p>
              </div>
            </div>

            <div className="auth-feature">
              <div className="auth-feature-icon">
                <Scale size={24} color="#10B981" />
              </div>
              <div>
                <h3>{t.authFeat3Title}</h3>
                <p>{t.authFeat3Desc}</p>
              </div>
            </div>
          </div>
          
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
          <div className="auth-header">
            <h2>{isLogin ? t.authWelcome : t.authRegisterTitle}</h2>
            <p>{isLogin ? t.authWelcomeSub : t.authRegisterSub}</p>
          </div>

          {error && (
            <div id="auth-error-msg" className="auth-error animate-pulse" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="input-group">
              <label htmlFor="auth-username">{t.authUsername}</label>
              <div className={`input-wrapper${fieldErrors.username ? ' input-error' : ''}`}>
                <User size={18} />
                <input 
                  id="auth-username"
                  type="text" 
                  required
                  className="auth-input"
                  placeholder={t.authUsernamePh}
                  autoComplete="username"
                  aria-invalid={fieldErrors.username || undefined}
                  aria-describedby={fieldErrors.username ? 'auth-error-msg' : undefined}
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); clearField('username'); }}
                />
              </div>
            </div>

            {!isLogin && (
              <div className="input-group">
                <label htmlFor="auth-email">{t.authEmail}</label>
                <div className={`input-wrapper${fieldErrors.email ? ' input-error' : ''}`}>
                  <Mail size={18} />
                  <input 
                    id="auth-email"
                    type="email" 
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
              {!isLogin && (
                <small className="auth-hint">
                  {t.authPasswordRules}
                </small>
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
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="auth-button btn-primary"
            >
              {isLogin ? <LogIn size={18} /> : <UserPlus size={18} />}
              {loading ? t.authProcessing : (isLogin ? t.authSignIn : t.authSignUp)}
            </button>
          </form>

          <div className="auth-toggle">
            {isLogin ? t.authNoAccount : t.authHaveAccount}
            <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); setFieldErrors({}); }}>
              {isLogin ? t.authRegisterHere : t.authLoginHere}
            </button>
          </div>

          <div className="auth-toggle" style={{ marginTop: '8px' }}>
            <Link to="/" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {t.authBack}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
