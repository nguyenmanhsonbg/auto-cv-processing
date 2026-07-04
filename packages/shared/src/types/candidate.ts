export enum CandidateLevel {
  ENTRY = 'ENTRY',
  EXPERIENCED = 'EXPERIENCED',
  SENIOR = 'SENIOR',
  SPECIALIST = 'SPECIALIST',
}

export interface ProfileSectionScore {
  section: 'education' | 'workExperience' | 'skills' | 'projects' | 'seniority';
  score: number;
  label: 'Strong' | 'Good' | 'Fair' | 'Weak';
  note?: string;
}

export interface AiValidation {
  completenessScore: number;
  highlights: string[];
  concerns: string[];
  summary: string;
  sectionScores?: ProfileSectionScore[];
}

export interface VcsSignals {
  university: {
    ok: boolean;
    name?: string | null;
    topMatch?: 'HUST' | 'UET' | 'PTIT' | null;
    evidence: string;
  };
  companyType: {
    ok: boolean;
    companies?: string[];
    evidence: string;
  };
  advancedSkills: {
    ok: boolean;
    items?: Array<{ skill: string; evidence: string }>;
    evidence?: string;
  };
  technicalChallenges: {
    ok: boolean;
    items?: Array<{ challenge: string; projectSize?: string | null; evidence: string }>;
    evidence?: string;
  };
  seniorRoles: {
    ok: boolean;
    items?: Array<{ role: string; projectSize?: string | null; evidence: string }>;
    evidence?: string;
  };
}

export interface WorkExperience {
  company: string;
  companyType?: 'PRODUCT' | 'OUTSOURCE' | 'STARTUP' | 'ENTERPRISE';
  startYear?: number | null;
  endYear?: number | null;
  role?: string;
  summary?: string;
  responsibilities?: string[];
  achievements?: string[];
  rawDescription?: string;
  technologies?: string[];
  projects?: ParsedProject[];
}

export interface ParsedProfile {
  name?: string;
  email?: string;
  phone?: string;
  birthYear?: number;
  education?: string;
  totalYearsExperience?: number;
  experienceByLanguage?: Record<string, number>;
  skills?: string[];
  groupedSkills?: Record<string, string[]>;
  techstack?: string[];
  certifications?: string[];
  projects?: ParsedProject[];
  workExperience?: WorkExperience[];
  level?: CandidateLevel;
  aiValidation?: AiValidation;
  vcsSignals?: VcsSignals;
  anomalyDetection?: ProfileAnomalyDetection;
}

export type AnomalyType =
  | 'career_transition'      // Unusual role changes or seniority reversals
  | 'skill_mismatch'         // Skills don't align with experience/education
  | 'geographic_pattern'     // Atypical location or industry patterns
  | 'timeline_inconsistency'; // Career narrative or timeline issues

export type AnomalySeverity = 'low' | 'medium' | 'high';
export type RiskLevel = 'minimal' | 'low' | 'moderate' | 'elevated' | 'high';

export interface ProfileAnomalyResult {
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;           // Human-readable explanation
  affectedFields: string[];      // JSONPath notation, e.g., ["workExperience[0].role"]
  evidence: string;              // Direct quote or specific data from CV
}

export interface ProfileAnomalyDetection {
  overallRiskScore: number;      // 0-100 composite risk score
  riskLevel: RiskLevel;          // Categorical risk assessment
  anomalies: ProfileAnomalyResult[];
  summary: string;               // 1-2 sentence overview in English
  analyzedAt: string;            // ISO timestamp
}

export interface ParsedProject {
  name: string;
  startYear?: number | null;
  endYear?: number | null;
  businessDescription?: string;
  customerType?: string;
  projectType?: 'PRODUCT' | 'OUTSOURCE';
  infrastructure?: string;
  platform?: string;
  scale?: string;
  teamSize?: number;
  techstack?: string[];
  architecture?: string;
  deployment?: string;
  role?: string;
  description?: string;
  responsibilities?: string[];
  achievements?: string[];
  rawDescription?: string;
}

export interface Candidate {
  id: string;
  slug?: string;
  name: string;
  email?: string;
  phone?: string;
  birthYear?: number;
  position: string;
  level: CandidateLevel;
  resumeUrl?: string;
  profileXlsxUrl?: string;
  parsedProfile?: ParsedProfile;
  analyzeStatus: 'idle' | 'analyzing';
  createdById?: string | null;
  createdBy?: { id: string; name: string; email: string } | null;
  assignees?: { id: string; name: string; email: string }[];
  createdAt: string;
  updatedAt: string;
}
