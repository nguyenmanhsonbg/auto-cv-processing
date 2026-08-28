import { Navigate, Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import { UserRole } from '@interview-assistant/shared';
import { useAuthContext } from '@/lib/auth-context';

export function InterviewEvaluationRouteGuard() {
  const { user, authState } = useAuthContext();
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');
  const hasHandoff = new URLSearchParams(window.location.search).has('handoff');

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Phiếu đánh giá phỏng vấn';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  if ((!token && !refreshToken && !hasHandoff) || authState === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  if (authState === 'loading') {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Loading evaluation access...</h1>
        <p className="text-sm text-muted-foreground">Checking your account permissions.</p>
      </div>
    );
  }
  if (authState === 'error') {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Evaluation workspace unavailable</h1>
        <p className="text-sm text-muted-foreground">
          Unable to verify your account right now. Please try again in a moment.
        </p>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const userRoles = new Set([user.role, ...(user.roles ?? [])]);
  const canAccess = userRoles.has(UserRole.ADMIN)
    || userRoles.has(UserRole.HR)
    || userRoles.has(UserRole.INTERVIEWER)
    || userRoles.has(UserRole.COMMITTEE);
  if (!canAccess) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You are not assigned to this interview evaluation.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
