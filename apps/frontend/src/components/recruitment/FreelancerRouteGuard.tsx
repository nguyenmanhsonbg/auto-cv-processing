import { Navigate, Outlet } from 'react-router-dom';
import { UserRole } from '@interview-assistant/shared';
import { useAuthContext } from '@/lib/auth-context';

export function FreelancerRouteGuard() {
  const { user } = useAuthContext();
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');

  if (!token && !refreshToken) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Loading freelancer access...</h1>
        <p className="text-sm text-muted-foreground">Checking your account permissions.</p>
      </div>
    );
  }

  const canAccessFreelancerWorkspace = (
    user.role === UserRole.ADMIN
    || user.role === UserRole.HR
    || user.role === UserRole.FREELANCER
  );

  if (!canAccessFreelancerWorkspace) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          Freelancer workspace is available to Freelancer, HR, and Admin users.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
