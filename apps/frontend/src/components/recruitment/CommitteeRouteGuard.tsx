import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { UserRole } from '@interview-assistant/shared';
import { useAuthContext } from '@/lib/auth-context';

export function CommitteeRouteGuard({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuthContext();
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');

  if (!token && !refreshToken) return <Navigate to="/login" replace />;
  if (!user) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Đang kiểm tra quyền HĐCM...</h1>
        <p className="text-sm text-muted-foreground">Vui lòng chờ trong giây lát.</p>
      </div>
    );
  }
  if (user.role !== UserRole.COMMITTEE) return <Navigate to="/dashboard" replace />;

  return children;
}
