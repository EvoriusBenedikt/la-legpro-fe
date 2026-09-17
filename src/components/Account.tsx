import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import { User, LogOut, ShieldCheck, Mail, Calendar, Key, Award, Lock } from 'lucide-react';

export default function Account() {
  const { user, token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'general' | 'security'>('general');

  // Change-password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (!/\d/.test(newPassword)) {
      setPwError('Password must contain at least one number');
      return;
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setPwError('Password must contain at least one symbol');
      return;
    }

    setPwLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ old_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.detail === 'string' ? data.detail : 'Failed to change password');
      }
      setPwSuccess('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPwError(err.message);
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="view-container account-view overflow-y-auto">
      <div className="account-header">
        <h1>Account Settings</h1>
        <p>Manage your personal information, security preferences, and core identity settings from one central hub.</p>
      </div>

      <div className="account-layout">

        {/* Left Profile Card */}
        <div className="profile-card">
          <div className="profile-avatar">
            <User size={40} />
          </div>
          <h2>{user?.username || 'User'}</h2>
          <p>ID: {user?.id?.split('-')[0] || 'Unknown'}</p>
          <div style={{ marginTop: '12px', padding: '4px 12px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            {user?.role || 'Pengguna'}
          </div>

          <div className="profile-divider" />

          <button onClick={logout} className="sign-out-btn">
            <LogOut size={16} />
            Sign Out
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
              General Information
            </button>
            <button
              className={`account-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
              onClick={() => setActiveTab('security')}
            >
              <ShieldCheck size={16} />
              Security Settings
            </button>
          </div>

          {/* Content Box */}
          {activeTab === 'general' ? (
          <div className="account-content-card">
            <h3>Profile Details</h3>

            <div className="info-grid">
              <div className="info-item">
                <label><User size={14} /> Username</label>
                <div className="info-value">{user?.username}</div>
              </div>

              <div className="info-item">
                <label><Key size={14} /> Unique ID</label>
                <div className="info-value mono">{user?.id}</div>
              </div>

              <div className="info-item">
                <label><Award size={14} /> Authority Level</label>
                <div className="info-value" style={{ textTransform: 'capitalize' }}>{user?.role || 'Pengguna'}</div>
              </div>

              <div className="info-item">
                <label><Mail size={14} /> Email</label>
                <div className={`info-value ${!user?.email ? 'italic' : ''}`}>
                  {user?.email || 'Not configured'}
                </div>
              </div>

              <div className="info-item">
                <label><Calendar size={14} /> Member Since</label>
                <div className="info-value">Today</div>
              </div>
            </div>
          </div>
          ) : (
          <div className="account-content-card">
            <h3>Change Password</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 0 }}>
              Password must contain at least one number and one symbol.
            </p>

            {pwError && (
              <div className="auth-error" style={{ marginBottom: '12px' }}>{pwError}</div>
            )}
            {pwSuccess && (
              <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.85rem' }}>
                {pwSuccess}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="auth-form" style={{ maxWidth: '420px' }}>
              <div className="input-group">
                <label>Current Password</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input
                    type="password"
                    required
                    className="auth-input"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label>New Password</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input
                    type="password"
                    required
                    className="auth-input"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Confirm New Password</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input
                    type="password"
                    required
                    className="auth-input"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" disabled={pwLoading} className="auth-button btn-primary">
                <Key size={18} />
                {pwLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
