import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { apiErrorMsg } from '../apiErrors';
import { useStrings, fill, msg, type Msg } from '../i18n';
import { User, LogOut, ShieldCheck, Mail, Calendar, Key, Award, Lock } from 'lucide-react';

export default function Account() {
  const { user, logout } = useAuth();
  const t = useStrings();
  const [activeTab, setActiveTab] = useState<'general' | 'security'>('general');

  // Change-password form state. The error is a Msg and the success note a
  // flag, never translated text, so both follow a language switch.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState<Msg | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);

  const roleLabel = user?.role?.toLowerCase() === 'dewa' ? 'Developer' : (user?.role || t.fallbackRole);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);

    if (newPassword !== confirmPassword) {
      setPwError({ key: 'acctErrMismatch' });
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setPwError({ key: 'acctErrUpper' });
      return;
    }
    if (!/\d/.test(newPassword)) {
      setPwError({ key: 'acctErrNumber' });
      return;
    }
    if (!/[^A-Za-z0-9\s]/.test(newPassword)) {
      setPwError({ key: 'acctErrSymbol' });
      return;
    }

    setPwLoading(true);
    try {
      await api.post('/api/auth/change-password', {
        old_password: currentPassword,
        new_password: newPassword,
      });
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwError(apiErrorMsg(err, 'acctErrChange'));
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="view-container account-view overflow-y-auto">
      <div className="account-header">
        <h1>{t.acctTitle}</h1>
        <p>{t.acctIntro}</p>
      </div>

      <div className="account-layout">

        {/* Left Profile Card */}
        <div className="profile-card">
          <div className="profile-avatar">
            <User size={40} />
          </div>
          <h2>{user?.username || t.acctUserFallback}</h2>
          <p>{fill(t.acctIdLine, { id: user?.id?.split('-')[0] || t.acctIdUnknown })}</p>
          <div style={{ marginTop: '12px', padding: '4px 12px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            {roleLabel}
          </div>

          <div className="profile-divider" />

          <button onClick={logout} className="sign-out-btn">
            <LogOut size={16} />
            {t.acctSignOut}
          </button>
        </div>

        {/* Right General Info Tab */}
        <div>

          {/* Tabs Header */}
          <div className="account-tabs-header">
            <button
              className={`account-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <User size={16} />
              {t.acctTabGeneral}
            </button>
            <button
              className={`account-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <ShieldCheck size={16} />
              {t.acctTabSecurity}
            </button>
          </div>

          {/* Content Box */}
          {activeTab === 'general' ? (
          <div className="account-content-card">
            <h3>{t.acctProfile}</h3>

            <div className="info-grid">
              <div className="info-item">
                <label><User size={14} /> {t.acctUsername}</label>
                <div className="info-value">{user?.username}</div>
              </div>

              <div className="info-item">
                <label><Key size={14} /> {t.acctUniqueId}</label>
                <div className="info-value mono">{user?.id}</div>
              </div>

              <div className="info-item">
                <label><Award size={14} /> {t.acctAuthority}</label>
                <div className="info-value" style={{ textTransform: 'capitalize' }}>{roleLabel}</div>
              </div>

              <div className="info-item">
                <label><Mail size={14} /> {t.acctEmail}</label>
                <div className={`info-value ${!user?.email ? 'italic' : ''}`}>
                  {user?.email || t.acctNotConfigured}
                </div>
              </div>

              <div className="info-item">
                <label><Calendar size={14} /> {t.acctMemberSince}</label>
                <div className="info-value">{t.acctToday}</div>
              </div>
            </div>
          </div>
          ) : (
          <div className="account-content-card">
            <h3>{t.acctChangePw}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0 }}>
              {t.acctPwRule}
            </p>

            {pwError && (
              <div className="auth-error" style={{ marginBottom: '12px' }}>{msg(t, pwError)}</div>
            )}
            {pwSuccess && (
              <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.85rem' }}>
                {t.acctPwUpdated}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="auth-form" style={{ maxWidth: '420px' }}>
              <div className="input-group">
                <label>{t.acctCurrentPw}</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input
                    type="password"
                    required
                    className="auth-input"
                    placeholder={t.acctPhCurrent}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label>{t.acctNewPw}</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input
                    type="password"
                    required
                    className="auth-input"
                    placeholder={t.acctPhNew}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label>{t.acctConfirmPw}</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input
                    type="password"
                    required
                    className="auth-input"
                    placeholder={t.acctPhConfirm}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" disabled={pwLoading} className="auth-button btn-primary">
                <Key size={18} />
                {pwLoading ? t.acctUpdating : t.acctUpdate}
              </button>
            </form>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
