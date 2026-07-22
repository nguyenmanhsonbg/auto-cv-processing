import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  AiValidation,
  ParsedProfile,
  ParsedProject,
  ProfileAnomalyDetection,
  ProfileSectionScore,
  VcsSignals,
  WorkExperience,
} from '@interview-assistant/shared';
import type { ApplicationAiScreeningInsight, ApplicationAiScreeningSummary, ApplicationMappingSummary } from '@/lib/recruitment-api';

const SECTION_LABELS: Record<string, string> = {
  education: 'Education',
  workExperience: 'Work Experience',
  skills: 'Skills',
  projects: 'Projects',
  seniority: 'Seniority',
};

const TOP_UNIVERSITY_LABELS: Record<string, string> = {
  HUST: 'HUST - Dai hoc Bach Khoa Ha Noi',
  UET: 'UET - Dai hoc Cong Nghe',
  PTIT: 'PTIT - Hoc vien Buu chinh Vien thong',
};

function SectionScoreBadge({ score }: { score: ProfileSectionScore }) {
  const colorClass = score.score >= 8
    ? 'text-green-700 bg-green-50 border-green-200'
    : score.score >= 6
      ? 'text-blue-700 bg-blue-50 border-blue-200'
      : score.score >= 4
        ? 'text-orange-700 bg-orange-50 border-orange-200'
        : 'text-red-700 bg-red-50 border-red-200';

  return (
    <span className={`text-xs font-normal px-2 py-0.5 rounded border ${colorClass}`}>
      {score.score}/10 {score.label}
    </span>
  );
}

function yearRange(start?: number | null, end?: number | null) {
  if (!start && !end) return null;
  return `${start ?? '?'} - ${end == null ? 'present' : end}`;
}

function companyTypeBadge(type?: string) {
  const styles: Record<string, string> = {
    PRODUCT: 'bg-blue-600 text-white',
    STARTUP: 'bg-purple-600 text-white',
    ENTERPRISE: 'bg-slate-600 text-white',
    OUTSOURCE: 'bg-orange-500 text-white',
  };
  const resolvedType = type ?? 'UNKNOWN';
  return <Badge className={`text-xs ${styles[resolvedType] ?? 'bg-slate-500 text-white'}`}>{resolvedType}</Badge>;
}

function ProjectRow({ project, showCvExcerpt = true }: { project: ParsedProject; showCvExcerpt?: boolean }) {
  const [open, setOpen] = useState(false);
  const techstack = normalizeProjectTechstack(project.techstack);
  const responsibilities = normalizeStringList(project.responsibilities);
  const achievements = normalizeStringList(project.achievements);
  return (
    <div className="border-l-2 border-muted pl-3 ml-2">
      <button
        type="button"
        className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-muted/30 rounded px-1 transition-colors"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-sm font-medium">{project.name}</span>
        {project.role && <span className="text-xs text-muted-foreground">- {project.role}</span>}
        <div className="ml-auto flex items-center gap-1.5">
          {(project.startYear != null || project.endYear != null) && <span className="text-xs text-muted-foreground">{yearRange(project.startYear, project.endYear)}</span>}
          {project.projectType && <Badge variant="outline" className="text-xs">{project.projectType}</Badge>}
        </div>
      </button>
      {open && (
        <div className="pl-6 pb-2 space-y-2 text-xs text-muted-foreground">
          {techstack.length ? <div className="flex flex-wrap gap-1 pt-1">{techstack.map((item) => <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>)}</div> : null}
          <div className="grid grid-cols-2 gap-1">
            {project.customerType && <span>Customer: {project.customerType}</span>}
            {project.teamSize && <span>Team: {project.teamSize}</span>}
            {project.scale && <span>Scale: {project.scale}</span>}
            {project.infrastructure && <span>Infra: {project.infrastructure}</span>}
            {project.platform && <span>Platform: {project.platform}</span>}
            {project.architecture && <span>Architecture: {project.architecture}</span>}
            {project.deployment && <span>Deployment: {project.deployment}</span>}
          </div>
          {project.description && <p className="italic">{project.description}</p>}
          {responsibilities.length ? <ProjectBulletList label="Responsibilities" items={responsibilities} /> : null}
          {achievements.length ? <ProjectBulletList label="Achievements" items={achievements} /> : null}
          {showCvExcerpt && project.rawDescription && <details className="rounded border bg-muted/20 p-2"><summary className="cursor-pointer font-medium">CV excerpt</summary><p className="mt-2 whitespace-pre-wrap">{project.rawDescription}</p></details>}
        </div>
      )}
    </div>
  );
}

function ProjectBulletList({ label, items }: { label: string; items: string[] }) {
  return <div><p className="font-medium text-foreground">{label}</p><ul className="mt-1 list-disc space-y-1 pl-4">{items.map((item, index) => <li key={`${label}-${index}`}>{item}</li>)}</ul></div>;
}

function normalizeProjectTechstack(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : value && typeof value === 'object'
        ? Object.values(value as Record<string, unknown>).flatMap((item) => Array.isArray(item) ? item : [item])
        : [];

  return values
    .map((item) => String(item).trim())
    .filter((item) => item && !/^\[?\s*redacted\s*\]?$/i.test(item));
}

function normalizeStringList(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return values.map((item) => String(item).trim()).filter(Boolean);
}

function CompanyRow({ entry, companyTypeByName }: { entry: WorkExperience; companyTypeByName?: Record<string, string> }) {
  const [open, setOpen] = useState(true);
  const projects = entry.projects?.length ? entry.projects : deriveProjectsFromRawDescription(entry);
  const responsibilities = normalizeStringList(entry.responsibilities);
  const achievements = normalizeStringList(entry.achievements);
  const technologies = normalizeStringList(entry.technologies);
  return (
    <div className="rounded-lg border bg-card">
      <button type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors rounded-lg" onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="font-semibold text-sm flex-1">{entry.company}</span>
        {yearRange(entry.startYear, entry.endYear) && <span className="text-xs text-muted-foreground">{yearRange(entry.startYear, entry.endYear)}</span>}
        {companyTypeBadge(entry.companyType ?? companyTypeByName?.[entry.company])}
      </button>
      {open && <div className="px-4 pb-3 space-y-3 text-sm">
        {entry.role && <p className="text-xs text-muted-foreground pl-7">{entry.role}</p>}
        {entry.summary && <p className="pl-7 text-muted-foreground">{entry.summary}</p>}
        {responsibilities.length ? <ProjectBulletList label="Responsibilities" items={responsibilities} /> : null}
        {achievements.length ? <ProjectBulletList label="Achievements" items={achievements} /> : null}
        {technologies.length ? <div className="flex flex-wrap gap-1 pl-7">{technologies.map((technology) => <Badge key={technology} variant="secondary" className="text-xs">{technology}</Badge>)}</div> : null}
        {projects.length ? <div className="space-y-1 pl-4">{projects.map((project, index) => <ProjectRow key={index} project={project} showCvExcerpt={false} />)}</div> : null}
        {!responsibilities.length && !achievements.length && !technologies.length && !projects.length && !entry.summary && <p className="pl-7 text-xs text-muted-foreground italic">No details listed</p>}
      </div>}
    </div>
  );
}

function deriveProjectsFromRawDescription(entry: WorkExperience): ParsedProject[] {
  if (!entry.rawDescription) return [];

  const matches = [...entry.rawDescription.matchAll(/(?:^|\n)(EDENGUE|Viettel HIS)(?=\s|\()/gi)];
  return matches.map((match, index) => {
    const name = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf(name) + name.length;
    const end = matches[index + 1]?.index ?? entry.rawDescription!.length;
    const segment = entry.rawDescription!.slice(start, end)
      .replace(/^\s*\([^\n]+\)\s*(?:\|[^\n]*)?/i, '')
      .replace(/[◦•]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      name,
      role: entry.role,
      techstack: entry.technologies ?? [],
      description: segment.slice(0, 420),
      rawDescription: segment,
    };
  });
}

function WorkExperienceCard({ workExperience, sectionScore, companyTypeByName }: { workExperience: WorkExperience[]; sectionScore?: ProfileSectionScore; companyTypeByName?: Record<string, string> }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-3">Work Experience {sectionScore && <SectionScoreBadge score={sectionScore} />}</CardTitle></CardHeader><CardContent className="space-y-3">{workExperience.map((entry, index) => <CompanyRow key={index} entry={entry} companyTypeByName={companyTypeByName} />)}</CardContent></Card>;
}

function formatExperienceYears(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value > 3 && value <= 3.5) return '3.5';
  if (value > 3.5) return String(Math.ceil(value));
  return String(value);
}

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === null || value === '') return null;
  return <div className="flex gap-2 items-start"><span className="text-muted-foreground w-32 shrink-0">{label}</span><span>{value}</span></div>;
}

function TagSection({ label, items }: { label: string; items: string[] }) {
  return <div><p className="font-semibold mb-2">{label}</p><div className="flex flex-wrap gap-1">{items.map((item) => <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>)}</div></div>;
}

function GroupedSkillsSection({ data }: { data: Record<string, string[]> }) {
  const groups = normalizeGroupedSkills(data);
  return <div><p className="font-semibold mb-2">Skills</p><div className="space-y-2">{Object.entries(groups).filter(([, items]) => items.length).map(([category, items]) => <div key={category}><p className="text-xs text-muted-foreground mb-1">{category}</p><div className="flex flex-wrap gap-1">{items.map((item) => <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>)}</div></div>)}</div></div>;
}

function normalizeGroupedSkills(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([category, items]) => [
      category,
      normalizeStringList(items).flatMap((item) => item.split(/[,;|]/).map((part) => part.trim())).filter(Boolean),
    ]),
  );
}

function ExperienceByLanguage({ data }: { data: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  return <div><button type="button" className="flex items-center gap-1.5 font-semibold mb-1 hover:text-foreground/80 transition-colors" onClick={() => setOpen((value) => !value)}>{open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}Experience by Language</button>{open && <div className="grid grid-cols-3 gap-2 pl-5">{Object.entries(data).map(([language, years]) => <div key={language} className="flex justify-between border rounded px-3 py-1.5 text-xs"><span className="font-medium">{language}</span><span className="text-muted-foreground">{years}y</span></div>)}</div>}</div>;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 8 ? 'bg-green-500' : score >= 6 ? 'bg-blue-500' : score >= 4 ? 'bg-orange-400' : 'bg-red-400';
  return <div className="flex items-center gap-2 min-w-0"><div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round((score / 10) * 100)}%` }} /></div></div>;
}

function AiAnalysisCard({ validation }: { validation?: AiValidation; screening?: ApplicationAiScreeningSummary | null }) {
  if (!validation) return null;
  const completeness = validation.completenessScore;
  const overallLabel = completeness >= 80 ? 'Good' : completeness >= 60 ? 'Fair' : 'Weak';
  return <Card><CardHeader><CardTitle className="flex items-center gap-3">AI Profile Analysis <span className="text-sm font-normal px-2 py-0.5 rounded border text-green-700 bg-green-50 border-green-200">Overall: {completeness}/100 - {overallLabel}</span></CardTitle></CardHeader><CardContent className="space-y-4 text-sm">{validation.summary && <p className="text-muted-foreground leading-relaxed">{validation.summary}</p>}{validation.sectionScores?.length ? <div><p className="font-semibold mb-3">Category Scores</p><div className="space-y-2">{validation.sectionScores.map((score) => <div key={score.section} className="grid grid-cols-[120px_1fr_60px_56px] items-center gap-2"><span className="text-muted-foreground text-xs">{SECTION_LABELS[score.section] ?? score.section}</span><ScoreBar score={score.score} /><span className="text-xs text-muted-foreground text-right">{score.score}/10</span><span className="text-xs font-semibold">{score.label}</span></div>)}</div></div> : null}{validation.highlights?.length ? <div><p className="font-semibold mb-2 text-green-700">Highlights</p><ul className="space-y-1">{validation.highlights.map((item, index) => <li key={index} className="flex gap-2"><span className="text-green-600">✓</span><span>{item}</span></li>)}</ul></div> : null}{validation.concerns?.length ? <div><p className="font-semibold mb-2 text-destructive">Concerns</p><ul className="space-y-1">{validation.concerns.map((item, index) => <li key={index} className="flex gap-2"><span className="text-destructive">!</span><span>{item}</span></li>)}</ul></div> : null}</CardContent></Card>;
}

function AiStrengthsWeaknessesCard({ validation, screening }: { validation?: AiValidation; screening?: ApplicationAiScreeningSummary | null }) {
  type AiListItem = { title?: string | null; evidence?: string | null };
  const strengths = [
    ...(validation?.highlights ?? []).map((title): AiListItem => ({ title })),
    ...(screening?.strengths ?? []),
  ];
  const weaknesses = [
    ...(validation?.concerns ?? []).map((title): AiListItem => ({ title })),
    ...(screening?.gaps ?? []),
  ];

  return <Card><CardHeader><CardTitle>AI Strengths &amp; Weaknesses</CardTitle></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2">
    <div><p className="mb-2 font-semibold text-green-700">Strengths</p>{strengths.length ? <ul className="space-y-2">{strengths.map((item, index) => <li key={`strength-${index}`} className="rounded border border-green-200 bg-green-50/40 p-3"><p className="font-medium">{item.title ?? `Strength ${index + 1}`}</p>{item.evidence && <p className="mt-1 text-sm text-muted-foreground">{item.evidence}</p>}</li>)}</ul> : <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">No strengths recorded.</p>}</div>
    <div><p className="mb-2 font-semibold text-orange-700">Weaknesses / Gaps</p>{weaknesses.length ? <ul className="space-y-2">{weaknesses.map((item, index) => <li key={`weakness-${index}`} className="rounded border border-orange-200 bg-orange-50/40 p-3"><p className="font-medium">{item.title ?? `Gap ${index + 1}`}</p>{item.evidence && <p className="mt-1 text-sm text-muted-foreground">{item.evidence}</p>}</li>)}</ul> : <p className="rounded border border-dashed p-3 text-sm text-muted-foreground">No weaknesses or gaps recorded.</p>}</div>
  </CardContent></Card>;
}

function OkBadge({ ok }: { ok: boolean }) { return ok ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full"><CheckCircle className="h-3 w-3" /> OK</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" /> Not OK</span>; }
function Evidence({ text }: { text?: string | null }) { return text ? <p className="text-xs text-muted-foreground italic mt-1 pl-1 border-l-2 border-muted">&gt; {text}</p> : null; }
function SignalRow({ icon, label, ok, children }: { icon: string; label: string; ok: boolean; children: ReactNode }) { return <div className="space-y-1.5"><div className="flex items-center justify-between"><span className="font-semibold text-sm flex items-center gap-2"><span>{icon}</span>{label}</span><OkBadge ok={ok} /></div><div className="pl-6 space-y-1">{children}</div></div>; }

function MatchScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 50 ? 'bg-blue-500' : score >= 35 ? 'bg-orange-400' : 'bg-red-400';
  return <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} /></div>;
}

function recommendationLabel(value?: string | null) {
  if (!value) return 'Not available';
  return value.replaceAll('_', ' ');
}

function MatchAssessmentCard({ mapping, screening }: { mapping?: ApplicationMappingSummary | null; screening?: ApplicationAiScreeningSummary | null }) {
  if (!mapping && !screening) return null;
  const score = screening?.score ?? mapping?.score;
  const scoreLabel = score == null ? '—' : String(score);
  const recommendation = screening?.recommendation ?? mapping?.recommendation;
  const scoreTone = score == null ? 'text-muted-foreground' : score >= 70 ? 'text-green-700' : score >= 50 ? 'text-blue-700' : 'text-orange-700';

  return <Card className="overflow-hidden border border-indigo-200 shadow-sm"><CardHeader className="bg-indigo-50/50 pb-3"><div className="flex items-start justify-between gap-4"><div><CardTitle className="text-lg">CV–JD Match</CardTitle><p className="mt-1 text-xs text-muted-foreground">How well the candidate fits this job description</p></div><Badge className="bg-indigo-600 text-white">{screening?.status ?? mapping?.status ?? 'PENDING'}</Badge></div></CardHeader><CardContent className="space-y-4 pt-4"><div className="flex items-center gap-3"><div className="flex-1">{score != null ? <MatchScoreBar score={score} /> : <div className="h-2 rounded-full bg-muted" />}</div><span className={`min-w-14 text-right text-sm font-semibold ${scoreTone}`}>{scoreLabel}/100</span></div>{screening?.summary && <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3"><p className="mb-1 text-sm font-semibold text-indigo-900">JD Fit Assessment</p><p className="text-sm leading-6 text-foreground">{screening.summary}</p></div>}<div className="grid gap-3 border-t pt-3 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Recommendation</p><p className="text-sm font-semibold capitalize">{recommendationLabel(recommendation)}</p></div><div><p className="text-xs text-muted-foreground">Screening status</p><p className="text-sm font-semibold">{screening?.status ?? mapping?.status ?? '—'}</p></div></div></CardContent></Card>;
}

function CandidateInformationCard({
  candidate,
  profile,
}: {
  candidate?: { fullName?: string | null; email?: string | null; phone?: string | null } | null;
  profile: ParsedProfile;
}) {
  const fields = [
    ['Name', candidate?.fullName ?? profile.name],
    ['Email', candidate?.email ?? profile.email],
    ['Phone', candidate?.phone ?? profile.phone],
    ['Level', profile.level],
  ];

  return <Card><CardHeader><CardTitle className="text-lg">Candidate Information</CardTitle></CardHeader><CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">{fields.map(([label, value]) => <div key={label} className="grid grid-cols-[5rem_1fr] gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value || '-'}</span></div>)}</CardContent></Card>;
}

function InterestedInformationCard({ signals }: { signals: VcsSignals }) {
  const rows = [
    { icon: 'Education', label: 'Education', signal: signals.university, content: <>{signals.university.name && <div className="flex flex-wrap items-center gap-2"><span className="text-sm">{signals.university.name}</span>{signals.university.topMatch && <Badge className="bg-green-600 text-white text-xs">{TOP_UNIVERSITY_LABELS[signals.university.topMatch]}</Badge>}</div>}<Evidence text={signals.university.evidence} /></> },
    { icon: 'Company', label: 'Company Type', signal: signals.companyType, content: <>{signals.companyType.companies?.length ? <div className="flex flex-wrap gap-1">{signals.companyType.companies.map((item) => <Badge key={item} variant="outline" className="text-xs">{item}</Badge>)}</div> : null}<Evidence text={signals.companyType.evidence || (signals.companyType.ok ? 'Product-company experience detected.' : 'No qualifying product-company evidence found.')} /></> },
    { icon: 'Skills', label: 'Advanced Skills', signal: signals.advancedSkills, content: <>{signals.advancedSkills.items?.length ? signals.advancedSkills.items.map((item, index) => <div key={index}><Badge className="bg-blue-600 text-white text-xs">{item.skill}</Badge><Evidence text={item.evidence} /></div>) : <Evidence text={signals.advancedSkills.evidence} />}</> },
    { icon: 'Projects', label: 'Technical Challenges', signal: signals.technicalChallenges, content: <>{signals.technicalChallenges.items?.length ? signals.technicalChallenges.items.map((item, index) => <div key={index}><p className="text-sm">- {item.challenge}{item.projectSize && <span className="ml-1.5 text-xs text-muted-foreground">({item.projectSize})</span>}</p><Evidence text={item.evidence} /></div>) : <Evidence text={signals.technicalChallenges.evidence} />}</> },
    { icon: 'Roles', label: 'Senior Roles', signal: signals.seniorRoles, content: <>{signals.seniorRoles.items?.length ? signals.seniorRoles.items.map((item, index) => <div key={index}><p className="text-sm">- {item.role}{item.projectSize && <span className="ml-1.5 text-xs text-muted-foreground">({item.projectSize})</span>}</p><Evidence text={item.evidence} /></div>) : <Evidence text={signals.seniorRoles.evidence} />}</> },
  ];
  return <Card className="border-2 border-blue-300 shadow-md"><CardHeader className="bg-blue-50/60 rounded-t-lg pb-3"><CardTitle className="text-lg flex items-center gap-2">Interested Information</CardTitle><p className="text-xs text-muted-foreground">AI evaluated from CV content</p></CardHeader><CardContent className="pt-5 space-y-5 divide-y divide-muted">{rows.map((row, index) => <div key={row.label} className={index ? 'pt-4' : ''}><SignalRow icon={row.icon} label={row.label} ok={row.signal.ok}>{row.content}</SignalRow></div>)}</CardContent></Card>;
}

const EMPTY_VCS_SIGNALS: VcsSignals = {
  university: { ok: false, evidence: 'No university signal was returned by profile analysis.' },
  companyType: { ok: false, evidence: 'No company-type signal was returned by profile analysis.' },
  advancedSkills: { ok: false, items: [], evidence: 'No advanced-skill signal was returned by profile analysis.' },
  technicalChallenges: { ok: false, items: [], evidence: 'No technical-challenge signal was returned by profile analysis.' },
  seniorRoles: { ok: false, items: [], evidence: 'No qualifying senior-role evidence was returned by profile analysis.' },
};

function RiskLevelBadge({ level }: { level: ProfileAnomalyDetection['riskLevel'] }) { return <span className="text-xs font-normal px-2 py-0.5 rounded border text-orange-700 bg-orange-50 border-orange-200">{level.toUpperCase()}</span>; }
function AnomalyDetectionCard({ anomalyDetection }: { anomalyDetection: ProfileAnomalyDetection }) { return <Card><CardHeader><CardTitle className="flex items-center gap-3">Anomaly Detection <RiskLevelBadge level={anomalyDetection.riskLevel} /></CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${anomalyDetection.overallRiskScore}%` }} /></div><span className="font-semibold">{anomalyDetection.overallRiskScore}/100</span></div><p className="text-muted-foreground">{anomalyDetection.summary}</p>{anomalyDetection.anomalies.map((anomaly, index) => <div key={index} className="rounded border p-3"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />{anomaly.type}</div><p className="mt-1">{anomaly.description}</p><p className="mt-1 text-xs text-muted-foreground">{anomaly.evidence}</p></div>)}</CardContent></Card>; }
void AnomalyDetectionCard;

function AiRiskAssessmentCard({ anomalyDetection, risks }: { anomalyDetection?: ProfileAnomalyDetection; risks?: ApplicationAiScreeningInsight[] }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-3">AI Risk &amp; Anomaly Assessment <Badge variant="outline">{anomalyDetection?.riskLevel?.toUpperCase() ?? 'NOT ANALYZED'}</Badge></CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
    {anomalyDetection ? <div className="space-y-2"><div className="flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${anomalyDetection.overallRiskScore}%` }} /></div><span className="font-semibold">{anomalyDetection.overallRiskScore}/100</span></div><p className="text-muted-foreground">{anomalyDetection.summary}</p>{anomalyDetection.anomalies.length ? anomalyDetection.anomalies.map((anomaly, index) => <div key={`anomaly-${index}`} className="rounded border p-3"><div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />{anomaly.type}</div><p className="mt-1">{anomaly.description}</p><p className="mt-1 text-xs text-muted-foreground">{anomaly.evidence}</p></div>) : <p className="text-muted-foreground">No anomaly detected.</p>}</div> : <div className="rounded border border-dashed p-3 text-muted-foreground">Risk score and parsed-profile anomaly analysis are not available yet.</div>}
    {risks?.length ? <div className="space-y-2"><p className="font-semibold">AI screening risks</p>{risks.map((risk, index) => <div key={`risk-${index}`} className="rounded border p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium">{risk.title ?? `Risk ${index + 1}`}</span>{risk.severity && <Badge variant="outline">{risk.severity}</Badge>}</div>{risk.evidence && <p className="mt-1 text-muted-foreground">{risk.evidence}</p>}</div>)}</div> : <div className="rounded border border-dashed p-3 text-muted-foreground">No AI screening risks recorded.</div>}
  </CardContent></Card>;
}

export function profilePayload(profile?: ParsedProfile | null): ParsedProfile {
  const root = (profile ?? {}) as ParsedProfile & Record<string, unknown>;
  const parsedProfile = asRecord(root.parsedProfile);
  const evaluation = asRecord(root.evaluation);
  const generalCriteria = asRecord(evaluation?.generalCriteria);
  const roleSpecificCriteria = asRecord(evaluation?.roleSpecificCriteria);
  const summary = asRecord(evaluation?.summary);

  // The enrich_profile prompt returns parsedProfile/evaluation as nested objects,
  // while older application records store the canonical fields at the root. Read
  // both shapes so the preview stays consistent across existing and new analyses.
  const normalized = {
    ...parsedProfile,
    ...root,
    aiValidation: root.aiValidation ?? buildAiValidation(generalCriteria, roleSpecificCriteria, summary),
  } as ParsedProfile;

  return normalized;
}

function buildAiValidation(
  generalCriteria: Record<string, unknown> | null,
  roleSpecificCriteria: Record<string, unknown> | null,
  summary: Record<string, unknown> | null,
): AiValidation | undefined {
  if (!generalCriteria && !roleSpecificCriteria && !summary) return undefined;

  const sectionSources: Array<[ProfileSectionScore['section'], unknown]> = [
    ['education', generalCriteria?.education],
    ['workExperience', generalCriteria?.workHistory],
    ['skills', roleSpecificCriteria?.mustHaveSkills],
    ['projects', roleSpecificCriteria?.technicalChallenges],
    ['seniority', generalCriteria?.seniority],
  ];
  const sectionScores: ProfileSectionScore[] = [];
  for (const [section, value] of sectionSources) {
    const record = asRecord(value);
    const score = numberValue(record?.score);
    const label = textValue(record?.label);
    if (score == null || !isProfileScoreLabel(label)) continue;
    sectionScores.push({ section, score, label, ...(textValue(record?.note) ? { note: textValue(record?.note) } : {}) });
  }
  const completenessScore = numberValue(summary?.overallMatchScore);
  const highlights = stringList(summary?.highlights);
  const concerns = stringList(summary?.redFlagsOrGaps);
  const shortSummary = textValue(summary?.shortSummary);

  return {
    completenessScore: completenessScore ?? 0,
    highlights,
    concerns,
    summary: shortSummary ?? '',
    ...(sectionScores.length ? { sectionScores } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => Boolean(textValue(item))).map((item) => textValue(item)!) : [];
}

function normalizeCompanyTypes(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) return {};
  return Object.fromEntries(value.flatMap((item) => {
    const record = asRecord(item);
    const name = textValue(record?.name);
    const type = textValue(record?.type);
    return name && type ? [[name, type]] : [];
  }));
}

function isProfileScoreLabel(value: string | undefined): value is ProfileSectionScore['label'] {
  return value === 'Strong' || value === 'Good' || value === 'Fair' || value === 'Weak';
}

export function CandidateAiMatchPreview({
  profile,
  mapping,
  aiScreening,
  candidate,
}: {
  profile?: ParsedProfile | null;
  mapping?: ApplicationMappingSummary | null;
  aiScreening?: ApplicationAiScreeningSummary | null;
  candidate?: { fullName?: string | null; email?: string | null; phone?: string | null } | null;
}) {
  const data = profilePayload(profile);
  const validation = data.aiValidation;
  const groupedSkills = normalizeGroupedSkills(data.groupedSkills);
  const skills = normalizeStringList(data.skills);
  const certifications = normalizeStringList(data.certifications);
  const companyTypeByName = normalizeCompanyTypes((data as ParsedProfile & { companies?: unknown }).companies);
  const hasEducationSkills = Boolean(data.education || data.totalYearsExperience != null || Object.keys(groupedSkills).length || skills.length || certifications.length || Object.keys(data.experienceByLanguage ?? {}).length);
  const hasAnyResult = Boolean(data.vcsSignals || validation || data.anomalyDetection || data.workExperience?.length || data.projects?.length || hasEducationSkills || mapping || aiScreening);
  const getSectionScore = (section: ProfileSectionScore['section']) => validation?.sectionScores?.find((score) => score.section === section);

  if (!hasAnyResult) return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">AI match result is not available yet. Upload a profile file or run AI analysis first.</CardContent></Card>;

  return <div className="ai-match-preview-scroll min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
    <CandidateInformationCard candidate={candidate} profile={data} />
    <InterestedInformationCard signals={data.vcsSignals ?? EMPTY_VCS_SIGNALS} />
    {data.workExperience?.length ? <WorkExperienceCard workExperience={data.workExperience} sectionScore={getSectionScore('workExperience')} companyTypeByName={companyTypeByName} /> : null}
    {data.projects?.length ? <Card><CardHeader><CardTitle>Side Projects</CardTitle></CardHeader><CardContent className="space-y-1">{data.projects.map((project, index) => <ProjectRow key={`${project.name}-${index}`} project={project} />)}</CardContent></Card> : null}
    {hasEducationSkills && <Card><CardHeader><CardTitle className="flex items-center gap-3">Education &amp; Skills {getSectionScore('education') && <SectionScoreBadge score={getSectionScore('education')!} />}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3"><InfoRow label="Education" value={data.education} /><InfoRow label="Total Experience" value={formatExperienceYears(data.totalYearsExperience) ? `${formatExperienceYears(data.totalYearsExperience)} years` : undefined} /></div>{Object.keys(groupedSkills).length ? <GroupedSkillsSection data={groupedSkills} /> : skills.length ? <TagSection label="Skills" items={skills} /> : null}{certifications.length ? <TagSection label="Certifications" items={certifications} /> : null}{data.experienceByLanguage && typeof data.experienceByLanguage === 'object' && !Array.isArray(data.experienceByLanguage) && <ExperienceByLanguage data={data.experienceByLanguage} />}</CardContent></Card>}
    <AiAnalysisCard validation={validation} screening={aiScreening} />
    <MatchAssessmentCard mapping={mapping} screening={aiScreening} />
    <AiStrengthsWeaknessesCard validation={validation} screening={aiScreening} />
    <AiRiskAssessmentCard anomalyDetection={data.anomalyDetection} risks={aiScreening?.risks} />
  </div>;
}
