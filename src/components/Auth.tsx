import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, User, LogIn, UserPlus, Mail, Scale, Eye, EyeOff, ShieldCheck, Brain } from 'lucide-react';
import { API_BASE } from '../config';
import { Link } from 'react-router-dom';

export default function Auth() {
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
      setError("Passwords do not match");
      return;
    }

    if (!isLogin) {
      if (!/\d/.test(password)) {
        setError("Password must contain at least one number");
        return;
      }
      if (!/[^A-Za-z0-9]/.test(password)) {
        setError("Password must contain at least one symbol");
        return;
      }
    }

    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin ? { username, password } : { username, email, password };
    
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Authentication failed');
      }

      login(data.access_token, data.user);
    } catch (err: any) {
      setError(err.message);
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
            <Scale size={64} />
          </div>
          <h1>Legal Analyzer</h1>
          <p>
            Elevate your compliance workflow. The intelligent legal repository and opinion generator for enterprise regulatory alignment.
          </p>

          <div className="auth-features" style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }}>
                <ShieldCheck size={24} color="var(--accent-color)" />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--text-primary)' }}>Hybrid RAG Retrieval</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Combines exact keyword search (BM25) with semantic vector search for 99% recall precision.</p>
              </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }}>
                <Brain size={24} color="#38BDF8" />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--text-primary)' }}>Cross-Encoder Reranking</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Neural-network based second-pass filtering ensures only highly relevant clauses reach the LLM.</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ padding: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }}>
                <Scale size={24} color="#10B981" />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: 'var(--text-primary)' }}>Contextual Legal Analysis</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Pre-computed document summaries eliminate isolated chunks and hallucination.</p>
              </div>
            </div>
          </div>
          
          <div style={{ marginTop: 'auto', paddingTop: '40px', opacity: 0.5, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }} />
            Powered by LA Lintasarta Core
          </div>
        </div>
      </div>

      {/* Right Form Side */}
      <div className="auth-form-side">
        <div className="auth-card">
          <div className="auth-header">
            <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
            <p>{isLogin ? 'Sign in to access your dashboard' : 'Register to get started'}</p>
          </div>

          {error && (
            <div className="auth-error animate-pulse">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="input-group">
              <label>Username</label>
              <div className="input-wrapper">
                <User size={18} />
                <input 
                  type="text" 
                  required
                  className="auth-input"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            {!isLogin && (
              <div className="input-group">
                <label>Email</label>
                <div className="input-wrapper">
                  <Mail size={18} />
                  <input 
                    type="email" 
                    required
                    className="auth-input"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="input-group">
              <label>Password</label>
              <div className="input-wrapper">
                <Lock size={18} />
                <input 
                  type={showPassword ? "text" : "password"}
                  required
                  className="auth-input"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {!isLogin && (
                <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  Password must contain at least one number and one symbol.
                </small>
              )}
            </div>

            {!isLogin && (
              <div className="input-group">
                <label>Confirm Password</label>
                <div className="input-wrapper">
                  <Lock size={18} />
                  <input 
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    className="auth-input"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
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
              {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
            </button>
          </form>

          <div className="auth-toggle">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
              {isLogin ? 'Register here' : 'Login here'}
            </button>
          </div>

          <div className="auth-toggle" style={{ marginTop: '8px' }}>
            <Link to="/" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              ← Back to overview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
