/**
 * ApplicationStage - The actual recruitment pipeline stage of an application.
 * 
 * This represents the real-world hiring funnel stages:
 * - APPLIED: New application, not started any process yet
 * - SCREEN_CV: AI analysis and HR/TA review of the CV and CV-JD mapping
 * - PRE_TEST_1: Candidate taking the pre-first-interview test
 * - INTERVIEW_1: Passed pre-first-interview test, scheduled for first interview round
 * - PRE_TEST_2: Passed INTERVIEW_1, doing pre-interview 2 test
 * - INTERVIEW_2: Passed test, scheduled for second interview round
 * - OFFER_PENDING: Passed INTERVIEW_2, waiting to send offer
 * - OFFER_SENT: Offer sent to candidate
 * - OFFER_REVISED: Offer revised (negotiation)
 * - ONBOARDING: Candidate accepted the offer and is waiting for onboarding
 * - HIRED: Candidate successfully onboarded
 * - REJECTED: Application rejected at any stage
 * - TALENT_POOL: Moved to talent pool for future consideration
 */
export enum ApplicationStage {
  // Initial stages
  APPLIED = 'APPLIED',
  SCREEN_CV = 'SCREEN_CV',
  PRE_TEST_1 = 'PRE_TEST_1',
  
  // Interview stages
  INTERVIEW_1 = 'INTERVIEW_1',
  PRE_TEST_2 = 'PRE_TEST_2',
  INTERVIEW_2 = 'INTERVIEW_2',
  
  // Offer stages
  OFFER_PENDING = 'OFFER_PENDING',
  OFFER_SENT = 'OFFER_SENT',
  OFFER_REVISED = 'OFFER_REVISED',
  ONBOARDING = 'ONBOARDING',
  
  // Terminal stages
  HIRED = 'HIRED',
  REJECTED = 'REJECTED',
  TALENT_POOL = 'TALENT_POOL',
}

/**
 * Interview round types
 */
export enum InterviewRoundType {
  INTERVIEW_1 = 'INTERVIEW_1',
  INTERVIEW_2 = 'INTERVIEW_2',
}

/**
 * Interview round result
 */
export enum InterviewResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NO_SHOW = 'NO_SHOW',
  PENDING = 'PENDING',
}

/**
 * Interview grade levels
 */
export enum InterviewGrade {
  EXCELLENT = 'EXCELLENT',
  GOOD = 'GOOD',
  AVERAGE = 'AVERAGE',
  POOR = 'POOR',
}

/**
 * Test round types
 */
export enum TestRoundType {
  PRE_TEST_1 = 'PRE_TEST_1',
  PRE_TEST_2 = 'PRE_TEST_2',
}

/**
 * Test result
 */
export enum TestResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NO_SUBMIT = 'NO_SUBMIT',
  PENDING = 'PENDING',
}

/**
 * Offer status
 */
export enum OfferStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  REVISED = 'REVISED',
  ACCEPTED = 'ACCEPTED',
  REJECTED_BY_CANDIDATE = 'REJECTED_BY_CANDIDATE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/**
 * Contract types for offers
 */
export enum ContractType {
  PROBATION = 'PROBATION',
  INDEFINITE = 'INDEFINITE',
  FIXED_TERM = 'FIXED_TERM',
}
