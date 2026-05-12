import React from 'react';
import { useAuth } from '../context/AuthContext';
import { User, LogOut, ShieldCheck, Mail, Calendar, Key, Award } from 'lucide-react';

export default function Account() {
  const { user, logout } = useAuth();

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
            <button className="account-tab-btn active">
              <User size={16} />
              General Information
            </button>
            <button className="account-tab-btn disabled">
              <ShieldCheck size={16} />
              Security Settings
            </button>
          </div>

          {/* Content Box */}
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

        </div>
      </div>
    </div>
  );
}
