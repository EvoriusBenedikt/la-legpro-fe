import { createContext, useContext } from 'react';

/* Context object, types and consumer hook split out of context/AuthContext.tsx
   (2026-10-06): react-refresh/only-export-components requires component files
   to export only components, so AuthContext.tsx now keeps just AuthProvider
   and imports the context from here. This module is the single source of
   truth for the auth types. */

export interface User {
  id: string;
  username: string;
  role?: string;
  email?: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
