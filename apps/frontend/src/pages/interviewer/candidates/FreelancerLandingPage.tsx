import { UserRole } from '@interview-assistant/shared';
import { useAuthContext } from '@/lib/auth-context';
import { FreelancerListPage } from '@/pages/interviewer/candidates/FreelancerListPage';
import { FreelancerWorkspacePage } from '@/pages/interviewer/candidates/FreelancerWorkspacePage';

export function FreelancerLandingPage() {
  const { user } = useAuthContext();

  return user?.role === UserRole.FREELANCER
    ? <FreelancerWorkspacePage />
    : <FreelancerListPage />;
}
