import { Navigate, Outlet } from 'react-router-dom';
import { UserRole } from '@interview-assistant/shared';
import { useAuthContext } from '@/lib/auth-context';

export function HrRouteGuard() {
  const { user } = useAuthContext();
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');

  if (!token && !refreshToken) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Loading HR access...</h1>
        <p className="text-sm text-muted-foreground">
          Checking your account permissions.
        </p>
      </div>
    );
  }

  const canAccessHrWorkspace = user.role === UserRole.ADMIN || user.role === UserRole.HR;

  if (!canAccessHrWorkspace) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          Freelancer management is available to HR and Admin users.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
