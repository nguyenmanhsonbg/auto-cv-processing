import { Routes, Route, Navigate } from 'react-router-dom';
import { InterviewerLayout } from '@/app/layouts/InterviewerLayout';
import { CandidateLayout } from '@/app/layouts/CandidateLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { GoogleCallbackPage } from '@/pages/auth/GoogleCallbackPage';
import { DashboardPage } from '@/pages/interviewer/dashboard/DashboardPage';
import { CandidateListPage } from '@/pages/interviewer/candidates/CandidateListPage';
import { CandidateCreatePage } from '@/pages/interviewer/candidates/CandidateCreatePage';
import { CandidateDetailPage } from '@/pages/interviewer/candidates/CandidateDetailPage';
import { QuestionListPage } from '@/pages/interviewer/questions/QuestionListPage';
import { SessionListPage } from '@/pages/interviewer/sessions/SessionListPage';
import { SessionCreatePage } from '@/pages/interviewer/sessions/SessionCreatePage';
import { SessionDetailPage } from '@/pages/interviewer/sessions/SessionDetailPage';
import { SessionEvaluatePage } from '@/pages/interviewer/sessions/SessionEvaluatePage';
import { LiveSessionPage } from '@/pages/interviewer/sessions/LiveSessionPage';
import { SessionSurveyPage } from '@/pages/interviewer/sessions/SessionSurveyPage';
import {
  ManagementPage,
  SettingsPositionsPage,
  SettingsCategoriesPage,
  SettingsLevelsPage,
  SettingsUsersPage,
  SettingsPromptsPage,
  SettingsModelsPage,
} from '@/pages/interviewer/settings/ManagementPage';
import { CandidateSessionPage } from '@/pages/candidate/CandidateSessionPage';
import { RecruitmentRouteGuard } from '@/components/recruitment/RecruitmentRouteGuard';
import { InterviewEvaluationRouteGuard } from '@/components/recruitment/InterviewEvaluationRouteGuard';
import { HrRouteGuard } from '@/components/recruitment/HrRouteGuard';
import { PublicJobDetailPage } from '@/pages/public/PublicJobDetailPage';
import { PublicJobApplyPage } from '@/pages/public/PublicJobApplyPage';
import { PublicApplyResultPage } from '@/pages/public/PublicApplyResultPage';
import { CandidateFormPage } from '@/pages/public/CandidateFormPage';
import { JobDescriptionListPage } from '@/pages/recruitment/job-descriptions/JobDescriptionListPage';
import { JobDescriptionDetailPage } from '@/pages/recruitment/job-descriptions/JobDescriptionDetailPage';
import { JobPostingListPage } from '@/pages/recruitment/job-postings/JobPostingListPage';
import { JobPostingDetailPage } from '@/pages/recruitment/job-postings/JobPostingDetailPage';
import { ApplicationListPage } from '@/pages/recruitment/applications/ApplicationListPage';
import { ApplicationDetailPage } from '@/pages/recruitment/applications/ApplicationDetailPage';
import { InterviewEvaluationPage } from '@/pages/recruitment/applications/InterviewEvaluationPage';
import { InterviewEvaluationInboxPage } from '@/pages/recruitment/applications/InterviewEvaluationInboxPage';
import { FreelancerDetailPage } from '@/pages/interviewer/candidates/FreelancerDetailPage';
import { FreelancerLandingPage } from '@/pages/interviewer/candidates/FreelancerLandingPage';
import { InternalDetailPage } from '@/pages/interviewer/candidates/InternalDetailPage';
import { InternalListPage } from '@/pages/interviewer/candidates/InternalListPage';
import { FreelancerRouteGuard } from '@/components/recruitment/FreelancerRouteGuard';
import { CommitteeRouteGuard } from '@/components/recruitment/CommitteeRouteGuard';
import { CommitteesPage } from '@/pages/interviewer/settings/CommitteesPage';
import { Toaster } from '@/components/ui/toaster';
// NEW: Pipeline Dashboard
import { AnalystDashboard } from '@/pages/dashboard';

export function AppRoutes() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
        <Route path="/jobs/:slug" element={<PublicJobDetailPage />} />
        <Route path="/jobs/:slug/apply" element={<PublicJobApplyPage />} />
        <Route path="/apply/:applicationId/status" element={<PublicApplyResultPage />} />
        <Route path="/form/:token" element={<CandidateFormPage />} />
        <Route path="/" element={<InterviewerLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="candidates" element={<CandidateListPage />} />
          <Route path="candidates/freelancers" element={<FreelancerRouteGuard />}>
            <Route index element={<FreelancerLandingPage />} />
            <Route path=":freelancerId" element={<HrRouteGuard />}>
              <Route index element={<FreelancerDetailPage />} />
            </Route>
          </Route>
          <Route path="candidates/internals" element={<HrRouteGuard />}>
            <Route index element={<InternalListPage />} />
            <Route path=":internalId" element={<InternalDetailPage />} />
          </Route>
          <Route path="candidates/new" element={<CandidateCreatePage />} />
          <Route path="candidates/:slug" element={<CandidateDetailPage />} />
          <Route path="questions" element={<QuestionListPage />} />
          <Route path="sessions" element={<SessionListPage />} />
          <Route path="sessions/new" element={<SessionCreatePage />} />
          <Route path="sessions/:slug" element={<SessionDetailPage />} />
          <Route path="sessions/:slug/evaluate" element={<SessionEvaluatePage />} />
          <Route path="sessions/:slug/live" element={<LiveSessionPage />} />
          <Route path="sessions/:slug/survey" element={<SessionSurveyPage />} />
          <Route path="settings/management" element={<ManagementPage />} />
          <Route path="settings/positions" element={<SettingsPositionsPage />} />
          <Route path="settings/categories" element={<SettingsCategoriesPage />} />
          <Route path="settings/levels" element={<SettingsLevelsPage />} />
          <Route path="settings/users" element={<SettingsUsersPage />} />
          <Route path="settings/committees" element={<CommitteesPage />} />
          <Route path="settings/prompts" element={<SettingsPromptsPage />} />
          <Route path="settings/models" element={<SettingsModelsPage />} />
          <Route path="interview-evaluations" element={<InterviewEvaluationRouteGuard />}>
            <Route index element={<CommitteeRouteGuard><InterviewEvaluationInboxPage /></CommitteeRouteGuard>} />
            <Route path=":applicationId" element={<InterviewEvaluationPage />} />
          </Route>
          <Route path="recruitment" element={<RecruitmentRouteGuard />}>
            <Route index element={<Navigate to="/recruitment/applications" replace />} />
            <Route path="dashboard" element={<AnalystDashboard />} />
            <Route path="job-descriptions" element={<JobDescriptionListPage />} />
            <Route path="job-descriptions/:id" element={<JobDescriptionDetailPage />} />
            <Route path="job-postings" element={<JobPostingListPage />} />
            <Route path="job-postings/:id" element={<JobPostingDetailPage />} />
            <Route path="applications" element={<ApplicationListPage />} />
            <Route path="applications/:applicationId" element={<ApplicationDetailPage />} />
          </Route>
        </Route>
        <Route path="/session/:token" element={<CandidateLayout />}>
          <Route index element={<CandidateSessionPage />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  );
}
