import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, User, LogIn, UserPlus, Mail, Scale, Eye, EyeOff, ShieldCheck, Brain } from 'lucide-react';
import api, { isHttpError } from '../services/api';
import { Link } from 'react-router-dom';
import { useStrings } from '../i18n';

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
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isLogin && password !== confirmPassword) {
      setError(t.authErrMismatch);
      return;
    }

    if (!isLogin) {
      if (!/\d/.test(password)) {
        setError(t.authErrNeedNumber);
        return;
      }
      if (!/[^A-Za-z0-9]/.test(password)) {
        setError(t.authErrNeedSymbol);
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
      setError(detail ? String(detail) : t.authErrFailed);
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
        <div className="auth-card">
          <div className="auth-header">
            <h2>{isLogin ? t.authWelcome : t.authRegisterTitle}</h2>
            <p>{isLogin ? t.authWelcomeSub : t.authRegisterSub}</p>
          </div>

          {error && (
            <div className="auth-error animate-pulse" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="input-group">
              <label htmlFor="auth-username">{t.authUsername}</label>
              <div className="input-wrapper">
                <User size={18} />
                <input 
                  id="auth-username"
                  type="text" 
                  required
                  className="auth-input"
                  placeholder={t.authUsernamePh}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            {!isLogin && (
              <div className="input-group">
                <label htmlFor="auth-email">{t.authEmail}</label>
                <div className="input-wrapper">
                  <Mail size={18} />
                  <input 
                    id="auth-email"
                    type="email" 
                    required
                    className="auth-input"
                    placeholder={t.authEmailPh}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="input-group">
              <label htmlFor="auth-password">{t.authPassword}</label>
              <div className="input-wrapper">
                <Lock size={18} />
                <input 
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  required
                  className="auth-input"
                  placeholder={t.authPasswordPh}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input 
                    id="auth-confirm"
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    className="auth-input"
                    placeholder={t.authConfirmPh}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
            <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
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
