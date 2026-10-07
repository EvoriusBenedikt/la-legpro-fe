import React, { useState } from 'react';
/* User, the context object and the useAuth hook moved to hooks/useAuth.ts
   (2026-10-06) so this file exports only the AuthProvider component
   (react-refresh/only-export-components). */
import { AuthContext, type User } from '../hooks/useAuth';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('la_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('la_token');
    } catch { return null; }
  });

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('la_token', newToken);
    localStorage.setItem('la_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('la_token');
    localStorage.removeItem('la_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};
