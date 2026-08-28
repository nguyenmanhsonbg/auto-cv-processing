import { Outlet } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UserRole } from '@interview-assistant/shared';
import { useAuthContext } from '@/lib/auth-context';
import { checkAmisAndExtensionSession } from '@/lib/amis-session-bridge';

const SESSION_REQUIRED_MESSAGE = 'Vui lòng đăng nhập Amis hoặc Extension để tiếp tục thao tác!';
const SESSION_RECHECK_INTERVAL_MS = 30_000;

type EvaluationSessionState = 'checking' | 'valid' | 'invalid';

function SessionRequiredMessage() {
  return (
    <div className="flex min-h-[240px] items-center justify-center p-6 text-center" role="alert">
      <p className="text-base font-semibold text-foreground">{SESSION_REQUIRED_MESSAGE}</p>
    </div>
  );
}

export function InterviewEvaluationRouteGuard() {
  const { user, authState } = useAuthContext();
  const token = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');
  const hasHandoff = new URLSearchParams(window.location.search).has('handoff');
  const [sessionState, setSessionState] = useState<EvaluationSessionState>('checking');
  const validationRunRef = useRef(0);
  const userId = user?.id;

  const userRoles = new Set(user ? [user.role, ...(user.roles ?? [])] : []);
  const canAccess = Boolean(user && (
    userRoles.has(UserRole.ADMIN)
    || userRoles.has(UserRole.HR)
    || userRoles.has(UserRole.INTERVIEWER)
    || userRoles.has(UserRole.COMMITTEE)
  ));

  const validateSessions = useCallback(async (showCheckingState = false) => {
    const validationRun = ++validationRunRef.current;
    if (showCheckingState) setSessionState('checking');

    const authenticated = await checkAmisAndExtensionSession();
    if (validationRun !== validationRunRef.current) return;

    setSessionState(authenticated ? 'valid' : 'invalid');
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Phiếu đánh giá phỏng vấn';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'ready' || !user || !canAccess) {
      validationRunRef.current += 1;
      setSessionState('checking');
      return;
    }

    let isActive = true;
    const runVisibleCheck = () => {
      if (!isActive || document.visibilityState !== 'visible') return;
      void validateSessions();
    };

    void validateSessions(true);
    window.addEventListener('focus', runVisibleCheck);
    document.addEventListener('visibilitychange', runVisibleCheck);
    const intervalId = window.setInterval(runVisibleCheck, SESSION_RECHECK_INTERVAL_MS);

    return () => {
      isActive = false;
      validationRunRef.current += 1;
      window.removeEventListener('focus', runVisibleCheck);
      document.removeEventListener('visibilitychange', runVisibleCheck);
      window.clearInterval(intervalId);
    };
  }, [authState, canAccess, userId, validateSessions]);

  if ((!token && !refreshToken && !hasHandoff) || authState === 'unauthenticated') {
    return <SessionRequiredMessage />;
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
    return <SessionRequiredMessage />;
  }

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

  if (sessionState === 'checking') {
    return (
      <div className="flex min-h-[240px] items-center justify-center p-6 text-center" role="status">
        <p className="text-sm text-muted-foreground">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    );
  }

  if (sessionState === 'invalid') {
    return <SessionRequiredMessage />;
  }

  return <Outlet />;
}
