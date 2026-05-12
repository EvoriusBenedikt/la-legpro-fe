import React from 'react';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  minRole: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const ROLE_LEVELS: Record<string, number> = {
  "pengguna": 1,
  "manajer": 2,
  "direktur": 3,
  "admin": 4,
  "sekretaris perusahaan": 5
};

export default function ProtectedRoute({ minRole, children, fallback = null }: ProtectedRouteProps) {
  const { user } = useAuth();
  
  const userRole = (user?.role || 'pengguna').toLowerCase();
  const minLevel = ROLE_LEVELS[minRole.toLowerCase()] || 1;
  const userLevel = ROLE_LEVELS[userRole] || 1;

  if (userLevel < minLevel) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
