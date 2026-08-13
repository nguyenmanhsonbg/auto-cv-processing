import { Document, Font, Page, Path, StyleSheet, Svg, Text, View } from '@react-pdf/renderer';
import type { AiValidation, ParsedProfile, ProfileAnomalyDetection, ProfileSectionScore, VcsSignals, WorkExperience } from '@interview-assistant/shared';
import type { ApplicationAiScreeningSummary, ApplicationMappingSummary } from '@/lib/recruitment-api';
import { profilePayload } from './CandidateAiMatchPreview';

Font.register({
  family: 'NotoSans',
  fonts: [
    { src: '/fonts/noto-sans-vietnamese-400-normal.woff', fontWeight: 400 },
    { src: '/fonts/noto-sans-vietnamese-700-normal.woff', fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'NotoSans', fontSize: 9, color: '#172033' },
  title: { fontSize: 20, fontWeight: 700, color: '#14213d', marginBottom: 4 },
  subtitle: { color: '#64748b', marginBottom: 16 },
  section: { marginBottom: 14 },
  sectionCard: { marginBottom: 14, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 5, padding: 10 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: '#183b75', marginBottom: 7, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4 },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 105, color: '#64748b' },
  value: { flex: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  scoreLabel: { width: 90, color: '#475569' },
  scoreTrack: { flex: 1, height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, marginRight: 8 },
  scoreFill: { height: 6, backgroundColor: '#2563eb', borderRadius: 3 },
  scoreText: { width: 48, textAlign: 'right', fontWeight: 700 },
  matchScoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  matchTrack: { flex: 1, height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, marginRight: 9 },
  matchFill: { height: 6, borderRadius: 4 },
  matchScoreText: { width: 58, textAlign: 'right', fontSize: 10, fontWeight: 700 },
  matchBox: { backgroundColor: '#eef2ff', borderColor: '#a5b4fc', borderWidth: 1, borderRadius: 5, padding: 10, marginBottom: 14 },
  matchScore: { fontSize: 18, fontWeight: 700, color: '#3730a3', marginBottom: 6 },
  card: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 4, padding: 8, marginBottom: 8 },
  cardTitle: { fontSize: 10, fontWeight: 700, color: '#0f172a', marginBottom: 3 },
  companyTypeLabel: { color: '#334155', marginRight: 4, fontSize: 8 },
  companyTypeBadge: { color: '#ffffff', fontSize: 8, fontWeight: 700, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 5 },
  muted: { color: '#64748b' },
  bullet: { marginLeft: 10, marginBottom: 3 },
  tagLine: { color: '#334155', marginTop: 3 },
  twoCol: { flexDirection: 'row', gap: 20 },
  col: { flex: 1 },
  good: { color: '#15803d' },
  concern: { color: '#c2410c' },
});

type PdfProps = {
  profile?: ParsedProfile | null;
  mapping?: ApplicationMappingSummary | null;
  screening?: ApplicationAiScreeningSummary | null;
  candidate?: { fullName?: string | null; email?: string | null; phone?: string | null } | null;
};

function list(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function stableKeyedItems<T>(items: T[], keyFor: (item: T) => string, prefix: string) {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const base = `${prefix}-${keyFor(item) || 'item'}`;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { item, key: occurrence === 0 ? base : `${base}-${occurrence}` };
  });
}

type ProjectLike = { name?: string | null; role?: string | null; startYear?: number | null; endYear?: number | null };

function projectIdentity(project: ProjectLike) {
  return [project.name, project.role, project.startYear, project.endYear].map((part) => String(part ?? '')).join('|');
}

function projectDateRange(project: ProjectLike) {
  if (project.startYear == null && project.endYear == null) return '';
  return ` (${project.startYear ?? '?'} - ${project.endYear == null ? 'present' : project.endYear})`;
}

function formatSignalItem(label: string, projectSize?: string | null) {
  return projectSize ? `${label} (${projectSize})` : label;
}

function projectTechstack(value: unknown) {
  let values: unknown[] = [];
  if (Array.isArray(value)) {
    values = value;
  } else if (typeof value === 'string') {
    values = [value];
  } else if (value && typeof value === 'object') {
    values = Object.values(value as Record<string, unknown>).flatMap((item) => {
      if (Array.isArray(item)) return item;
      return [item];
    });
  }
  return values.map((item) => String(item).trim()).filter((item) => item && !/^\[?\s*redacted\s*\]?$/i.test(item));
}

function experienceYears(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value > 3 && value <= 3.5) return '3.5';
  if (value > 3.5) return String(Math.ceil(value));
  return String(value);
}

function sectionLabel(section: ProfileSectionScore['section']) {
  return ({ education: 'Education', workExperience: 'Work Experience', skills: 'Skills', projects: 'Projects', seniority: 'Seniority' } as const)[section];
}

function recommendation(value?: string | null) {
  return value ? value.replaceAll('_', ' ') : 'Not available';
}

function scoreColor(score: number) {
  if (score >= 8) return '#22c55e';
  if (score >= 6) return '#3b82f6';
  if (score >= 4) return '#fb923c';
  return '#f87171';
}

function matchColor(score: number) {
  if (score >= 70) return '#16a34a';
  if (score >= 50) return '#2563eb';
  if (score >= 35) return '#f97316';
  return '#dc2626';
}

function companyTypeColor(type?: string) {
  return ({ PRODUCT: '#2563eb', STARTUP: '#9333ea', ENTERPRISE: '#475569', OUTSOURCE: '#f97316' } as Record<string, string>)[type ?? ''] ?? '#64748b';
}

function deriveCompanyTypes(data: any) {
  const companies = Array.isArray(data.companies) ? data.companies : [];
  return Object.fromEntries(companies.flatMap((item: { name?: string; type?: string }) => item.name && item.type ? [[item.name, item.type]] : []));
}

function deriveProjects(entry: WorkExperience): NonNullable<WorkExperience['projects']> {
  if (entry.projects?.length) return entry.projects;
  if (!entry.rawDescription) return [];
  const matches = [...entry.rawDescription.matchAll(/(?:^|\n)(EDENGUE|Viettel HIS)(?=\s|\()/gi)];
  return matches.map((match, index) => {
    const name = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf(name) + name.length;
    const end = matches[index + 1]?.index ?? entry.rawDescription!.length;
    const description = entry.rawDescription!.slice(start, end).replace(/^\s*\([^\n]+\)\s*(?:\|[^\n]*)?/i, '').replace(/[\u00c3\u00a2\u00e2\u201d\u00c2\u00a6\u201a\u00ac]/g, '').replace(/\s+/g, ' ').trim();
    return { name, role: entry.role, techstack: entry.technologies ?? [], description: description.slice(0, 420), rawDescription: description };
  });
}

function period(entry: WorkExperience) {
  const item = entry as WorkExperience & { startDate?: string; endDate?: string | null };
  return `${item.startDate ?? entry.startYear ?? '?'} - ${item.endDate ?? (entry.endYear == null ? 'present' : entry.endYear)}`;
}

function scoreRow(label: string, score: ProfileSectionScore) {
  return <View style={styles.scoreRow} wrap={false}><Text style={styles.scoreLabel}>{label}</Text><View style={styles.scoreTrack}><View style={{ ...styles.scoreFill, backgroundColor: scoreColor(score.score), width: `${Math.max(0, Math.min(10, score.score)) * 10}%` }} /></View><Text style={styles.scoreText}>{score.score}/10 {score.label}</Text></View>;
}

function WorkCard({ entry, companyType }: { entry: WorkExperience; companyType?: string }) {
  const projects = deriveProjects(entry);
  const keyedProjects = stableKeyedItems(projects, projectIdentity, 'project');
  return <View style={styles.card}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}><Text style={{ ...styles.cardTitle, flex: 1, marginBottom: 0, marginRight: 8 }}>{entry.company}</Text><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ ...styles.muted, marginRight: 8 }}>{period(entry)}</Text><Text style={{ ...styles.companyTypeBadge, backgroundColor: companyTypeColor(entry.companyType ?? companyType ?? 'UNKNOWN') }}>{entry.companyType ?? companyType ?? 'UNKNOWN'}</Text></View></View>
    {entry.role && <Text style={styles.muted}>{entry.role}</Text>}
    {entry.summary && <Text style={{ marginTop: 4 }}>{entry.summary}</Text>}
    {list(entry.responsibilities).length ? <Text style={{ ...styles.cardTitle, marginTop: 5 }}>Responsibilities</Text> : null}
    {stableKeyedItems(list(entry.responsibilities), (item) => item, 'responsibility').map(({ item, key }) => <Text key={key} style={styles.bullet}>- {item}</Text>)}
    {list(entry.achievements).length ? <Text style={{ ...styles.cardTitle, marginTop: 5 }}>Achievements</Text> : null}
    {stableKeyedItems(list(entry.achievements), (item) => item, 'achievement').map(({ item, key }) => <Text key={key} style={styles.bullet}>- {item}</Text>)}
    {list(entry.technologies).length ? <Text style={styles.tagLine}>Technologies: {list(entry.technologies).join(', ')}</Text> : null}
    {keyedProjects.map(({ item: project, key }) => <View key={key} style={{ marginTop: 6, marginLeft: 8 }}><Text style={styles.cardTitle}>{project.name}{project.role ? ` - ${project.role}` : ''}{projectDateRange(project)}</Text>{project.projectType && <Text style={styles.muted}>Project type: {project.projectType}</Text>}{project.description && <Text style={{ marginTop: 3 }}>{project.description}</Text>}{projectTechstack(project.techstack).length ? <Text style={styles.tagLine}>Technologies: {projectTechstack(project.techstack).join(', ')}</Text> : null}{stableKeyedItems(list(project.responsibilities), (item) => item, 'project-item').map(({ item, key: itemKey }) => <Text key={itemKey} style={styles.bullet}>- {item}</Text>)}{stableKeyedItems(list(project.achievements), (item) => item, 'project-achievement').map(({ item, key: itemKey }) => <Text key={itemKey} style={styles.bullet}>- {item}</Text>)}</View>)}
  </View>;
}

function ProjectCard({ project }: { project: NonNullable<ParsedProfile['projects']>[number] }) {
  return <View style={styles.card} wrap={false}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ ...styles.cardTitle, flex: 1 }}>{project.name}{project.role ? ` - ${project.role}` : ''}</Text>{project.startYear != null || project.endYear != null ? <Text style={styles.muted}>{project.startYear ?? '?'} - {project.endYear == null ? 'present' : project.endYear}</Text> : null}</View>{project.projectType && <Text style={styles.muted}>Project type: {project.projectType}</Text>}{projectTechstack(project.techstack).length ? <Text style={styles.tagLine}>Technologies: {projectTechstack(project.techstack).join(', ')}</Text> : null}{project.description && <Text style={{ marginTop: 4 }}>{project.description}</Text>}{stableKeyedItems(list(project.responsibilities), (item) => item, 'side-project').map(({ item, key }) => <Text key={key} style={styles.bullet}>- {item}</Text>)}{stableKeyedItems(list(project.achievements), (item) => item, 'side-achievement').map(({ item, key }) => <Text key={key} style={styles.bullet}>- {item}</Text>)}</View>;
}

function SignalPdfRow({ label, ok, value, evidence }: { label: string; ok?: boolean; value?: string | null; evidence?: string | null }) {
  return <View style={{ borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 5 }} wrap={false}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ ...styles.cardTitle, flex: 1, marginBottom: 0, marginRight: 8 }}>{label}</Text><Text style={{ fontSize: 8, fontWeight: 700, color: ok ? '#15803d' : '#b91c1c', backgroundColor: ok ? '#f0fdf4' : '#fef2f2', borderColor: ok ? '#bbf7d0' : '#fca5a5', borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>{ok ? 'OK' : 'Not OK'}</Text></View>{value && <Text style={{ marginLeft: 14, marginTop: 2 }}>{value}</Text>}{evidence && <Text style={{ ...styles.muted, marginLeft: 14, marginTop: 2 }}> &gt; {evidence}</Text>}</View>;
}

const EMPTY_SIGNALS: VcsSignals = { university: { ok: false, evidence: '' }, companyType: { ok: false, companies: [], evidence: '' }, advancedSkills: { ok: false, items: [], evidence: '' }, technicalChallenges: { ok: false, items: [], evidence: '' }, seniorRoles: { ok: false, items: [], evidence: '' } };

function CandidateInformation({ data, candidate }: { data: any; candidate: PdfProps['candidate'] }) {
  return <View style={styles.sectionCard}><Text style={styles.sectionTitle}>Candidate Information</Text><View style={styles.row}><View style={{ flex: 1, flexDirection: 'row' }}><Text style={{ ...styles.label, width: 50 }}>Name</Text><Text style={styles.value}>{candidate?.fullName ?? data.name ?? '-'}</Text></View><View style={{ flex: 1, flexDirection: 'row' }}><Text style={{ ...styles.label, width: 50 }}>Email</Text><Text style={styles.value}>{candidate?.email ?? data.email ?? '-'}</Text></View></View><View style={styles.row}><View style={{ flex: 1, flexDirection: 'row' }}><Text style={{ ...styles.label, width: 50 }}>Phone</Text><Text style={styles.value}>{candidate?.phone ?? data.phone ?? '-'}</Text></View><View style={{ flex: 1, flexDirection: 'row' }}><Text style={{ ...styles.label, width: 50 }}>Level</Text><Text style={styles.value}>{data.level ?? '-'}</Text></View></View></View>;
}

function InterestedInformation({ signals }: { signals: VcsSignals }) {
  return <View style={styles.sectionCard} wrap={false}><Text style={styles.sectionTitle}>Interested Information</Text><SignalPdfRow label="Education" ok={signals.university?.ok} value={signals.university?.name} evidence={signals.university?.evidence} /><SignalPdfRow label="Company Type" ok={signals.companyType?.ok} value={signals.companyType?.companies?.join(', ')} evidence={signals.companyType?.evidence} /><SignalPdfRow label="Advanced Skills" ok={signals.advancedSkills?.ok} value={signals.advancedSkills?.items?.map((item) => item.skill).join(', ')} evidence={signals.advancedSkills?.items?.map((item) => item.evidence).filter(Boolean).join(' | ') || signals.advancedSkills?.evidence} /><SignalPdfRow label="Technical Challenges" ok={signals.technicalChallenges?.ok} value={signals.technicalChallenges?.items?.map((item) => formatSignalItem(item.challenge, item.projectSize)).join(', ')} evidence={signals.technicalChallenges?.items?.map((item) => item.evidence).filter(Boolean).join(' | ') || signals.technicalChallenges?.evidence} /><SignalPdfRow label="Senior Roles" ok={signals.seniorRoles?.ok} value={signals.seniorRoles?.items?.map((item) => formatSignalItem(item.role, item.projectSize)).join(', ')} evidence={signals.seniorRoles?.items?.map((item) => item.evidence).filter(Boolean).join(' | ') || signals.seniorRoles?.evidence} /></View>;
}

function WorkExperienceSection({ workExperience, companyTypeByName }: { workExperience: WorkExperience[]; companyTypeByName: Record<string, string> }) {
  const companyType = (company?: string | null) => company ? companyTypeByName[company] : undefined;
  return <View style={styles.sectionCard}><View><Text style={styles.sectionTitle}>Work Experience</Text>{workExperience[0] ? <WorkCard entry={workExperience[0]} companyType={companyType(workExperience[0].company)} /> : <Text style={styles.muted}>No work experience extracted.</Text>}</View>{workExperience.slice(1).map((entry, index) => <WorkCard key={`work-${index + 1}`} entry={entry} companyType={companyType(entry.company)} />)}</View>;
}

function EducationSkills({ data, groupedSkills, languages }: { data: any; groupedSkills: [string, unknown][]; languages: unknown }) {
  return <View style={styles.sectionCard}><Text style={styles.sectionTitle}>Education &amp; Skills</Text>{data.education && <Text style={{ marginBottom: 6 }}>Education: {data.education}</Text>}{data.totalYearsExperience != null && <Text style={{ marginBottom: 6 }}>Total Experience: {experienceYears(data.totalYearsExperience)} years</Text>}{groupedSkills.map(([group, items]) => <Text key={group} style={styles.tagLine}>{group}: {list(items).join(', ')}</Text>)}{list(data.skills).length > 0 && groupedSkills.length === 0 && <Text style={styles.tagLine}>Skills: {list(data.skills).join(', ')}</Text>}{list(data.certifications).length > 0 && <Text style={styles.tagLine}>Certifications: {list(data.certifications).join(', ')}</Text>}{data.experienceByLanguage && typeof data.experienceByLanguage === 'object' && !Array.isArray(data.experienceByLanguage) && <Text style={styles.tagLine}>Experience by Language: {Object.entries(data.experienceByLanguage).map(([language, years]) => `${language} ${years}y`).join(', ')}</Text>}{list(languages).length > 0 && <Text style={styles.tagLine}>Languages: {list(languages).join(', ')}</Text>}</View>;
}

function completenessStyle(score: number) {
  if (score >= 80) return { color: '#15803d', backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', label: 'Good' };
  if (score >= 60) return { color: '#1d4ed8', backgroundColor: '#eff6ff', borderColor: '#bfdbfe', label: 'Fair' };
  return { color: '#c2410c', backgroundColor: '#fff7ed', borderColor: '#fed7aa', label: 'Weak' };
}

function ProfileAnalysis({ validation }: { validation?: AiValidation }) {
  if (!validation) return null;
  const completeness = completenessStyle(validation.completenessScore);
  const keyedHighlights = stableKeyedItems(validation.highlights ?? [], (item) => item, 'highlight');
  const keyedConcerns = stableKeyedItems(validation.concerns ?? [], (item) => item, 'concern');
  return <View style={styles.sectionCard}><View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4 }}><Text style={{ ...styles.sectionTitle, marginBottom: 0, borderBottomWidth: 0, paddingBottom: 0 }}>AI Profile Analysis</Text><Text style={{ fontSize: 8, fontWeight: 700, color: completeness.color, backgroundColor: completeness.backgroundColor, borderColor: completeness.borderColor, borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6, marginLeft: 8 }}>Overall: {validation.completenessScore}/100 - {completeness.label}</Text></View>{validation.summary && <Text style={{ marginBottom: 7 }}>{validation.summary}</Text>}{validation.sectionScores?.length ? <Text style={{ ...styles.cardTitle, marginBottom: 5 }}>Category Scores</Text> : null}{validation.sectionScores?.map((item) => <View key={`profile-score-${item.section}`}>{scoreRow(sectionLabel(item.section), item)}</View>)}{keyedHighlights.length ? <View style={{ marginTop: 6 }}><Text style={{ ...styles.good, marginBottom: 3 }}>Highlights</Text>{keyedHighlights.map(({ item, key }) => <View key={key} style={{ flexDirection: 'row', alignItems: 'flex-start', marginLeft: 4, marginBottom: 2 }}><Svg width={9} height={9} viewBox="0 0 24 24" style={{ marginRight: 4, marginTop: 1 }}><Path d="M20 6L9 17l-5-5" stroke="#15803d" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg><Text style={{ flex: 1 }}>{item}</Text></View>)}</View> : null}{keyedConcerns.length ? <View style={{ marginTop: 6 }}><Text style={{ ...styles.concern, marginBottom: 3 }}>Concerns</Text>{keyedConcerns.map(({ item, key }) => <View key={key} style={{ flexDirection: 'row', alignItems: 'flex-start', marginLeft: 4, marginBottom: 2 }}><Svg width={9} height={9} viewBox="0 0 24 24" style={{ marginRight: 4, marginTop: 1 }}><Path d="M12 4v9m0 4h.01" stroke="#c2410c" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg><Text style={{ flex: 1 }}>{item}</Text></View>)}</View> : null}</View>;
}

function MatchSection({ score, screening, mapping }: { score?: number; screening?: ApplicationAiScreeningSummary | null; mapping?: ApplicationMappingSummary | null }) {
  return <View style={styles.matchBox} wrap={false}><Text style={styles.sectionTitle}>CV-JD Match</Text><Text style={styles.muted}>How well the candidate fits this job description</Text>{score != null ? <View style={styles.matchScoreRow}><View style={styles.matchTrack}><View style={{ ...styles.matchFill, backgroundColor: matchColor(score), width: `${Math.max(0, Math.min(100, score))}%` }} /></View><Text style={{ ...styles.matchScoreText, color: matchColor(score) }}>{score} / 100</Text></View> : <Text style={styles.matchScore}>- / 100</Text>}{screening?.summary && <View style={{ borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', borderRadius: 4, padding: 7, marginBottom: 5 }}><Text style={{ ...styles.cardTitle, color: '#312e81' }}>JD Fit Assessment</Text><Text>{screening.summary}</Text></View>}<Text>Recommendation: {recommendation(screening?.recommendation ?? mapping?.recommendation)}</Text><Text>Screening status: {screening?.status ?? mapping?.status ?? '-'}</Text></View>;
}

function StrengthsWeaknesses({ strengths, weaknesses, screening }: { strengths: string[]; weaknesses: string[]; screening?: ApplicationAiScreeningSummary | null }) {
  const keyedStrengths = stableKeyedItems(strengths, (item) => item, 'strength');
  const keyedScreeningStrengths = stableKeyedItems(screening?.strengths ?? [], (item) => item.evidence ?? item.title ?? '', 'strength-evidence');
  const keyedWeaknesses = stableKeyedItems(weaknesses, (item) => item, 'gap');
  const keyedScreeningGaps = stableKeyedItems(screening?.gaps ?? [], (item) => item.evidence ?? item.title ?? '', 'gap-evidence');
  return <View style={styles.sectionCard}><Text style={styles.sectionTitle}>AI Strengths &amp; Weaknesses</Text><View style={styles.twoCol}><View style={styles.col}><Text style={styles.good}>Strengths</Text>{keyedStrengths.map(({ item, key }) => <Text key={key} style={styles.bullet}>- {item}</Text>)}{keyedScreeningStrengths.map(({ item, key }) => item.evidence ? <Text key={key} style={styles.muted}>{item.evidence}</Text> : null)}</View><View style={styles.col}><Text style={styles.concern}>Weaknesses / Gaps</Text>{keyedWeaknesses.map(({ item, key }) => <Text key={key} style={styles.bullet}>- {item}</Text>)}{keyedScreeningGaps.map(({ item, key }) => item.evidence ? <Text key={key} style={styles.muted}>{item.evidence}</Text> : null)}</View></View></View>;
}

function riskStyle(severity?: string | null) {
  const normalized = severity?.toUpperCase();
  if (normalized === 'HIGH') return { color: '#dc2626', backgroundColor: '#fef2f2', borderColor: '#fca5a5' };
  if (normalized === 'MEDIUM') return { color: '#c2410c', backgroundColor: '#fff7ed', borderColor: '#fed7aa' };
  return { color: '#475569', backgroundColor: '#f8fafc', borderColor: '#e2e8f0' };
}

function RiskAssessment({ anomalyDetection, risks }: { anomalyDetection?: ProfileAnomalyDetection; risks: ApplicationAiScreeningSummary['risks'] }) {
  if (!anomalyDetection && !risks?.length) return null;
  const keyedRisks = stableKeyedItems(risks ?? [], (risk) => `${risk.title ?? ''}|${risk.severity ?? ''}|${risk.evidence ?? ''}`, 'risk');
  return <View style={styles.sectionCard}><View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4 }}><Text style={{ ...styles.sectionTitle, marginBottom: 0, borderBottomWidth: 0, paddingBottom: 0 }}>AI Risk &amp; Anomaly Assessment</Text>{anomalyDetection && <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}><Text style={{ color: '#475569', fontSize: 8, marginRight: 4 }}>Risk level:</Text><Text style={{ fontSize: 8, fontWeight: 700, color: '#c2410c', backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>{anomalyDetection.riskLevel.toUpperCase()}</Text></View>}</View>{anomalyDetection && <AnomalySection anomaly={anomalyDetection} />}{keyedRisks.map(({ item: risk, key }, index) => { const palette = riskStyle(risk.severity); return <View key={key} style={styles.card} wrap={false}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: risk.evidence ? 3 : 0 }}><Text style={{ ...styles.cardTitle, flex: 1, marginBottom: 0, marginRight: 8 }}>{risk.title ?? `Risk ${index + 1}`}</Text>{risk.severity && <Text style={{ fontSize: 8, fontWeight: 700, color: palette.color, backgroundColor: palette.backgroundColor, borderColor: palette.borderColor, borderWidth: 1, borderRadius: 3, paddingVertical: 2, paddingHorizontal: 6 }}>{risk.severity.toUpperCase()}</Text>}</View>{risk.evidence && <Text>{risk.evidence}</Text>}</View>; })}</View>;
}

export function AiMatchPreviewPdf({ profile, mapping, screening, candidate }: PdfProps) {
  const data = profilePayload(profile);
  const validation = data.aiValidation as AiValidation | undefined;
  const signals = (data.vcsSignals as VcsSignals | undefined) ?? EMPTY_SIGNALS;
  const score = screening?.score ?? mapping?.score;
  const workExperience = data.workExperience ?? [];
  const sideProjects = Array.isArray(data.projects) ? stableKeyedItems(data.projects, projectIdentity, 'side') : [];
  const groupedSkills = data.groupedSkills ? Object.entries(data.groupedSkills) : [];
  const companyTypeByName = deriveCompanyTypes(data);
  const languages = (data as ParsedProfile & { languages?: unknown }).languages;
  const strengths = [...(validation?.highlights ?? []), ...(screening?.strengths ?? []).map((item) => item.title ?? '')].filter(Boolean);
  const weaknesses = [...(validation?.concerns ?? []), ...(screening?.gaps ?? []).map((item) => item.title ?? '')].filter(Boolean);

  return <Document title={`AI Match - ${candidate?.fullName ?? 'Candidate'}`} author="VCS Interview Assistant"><Page size="A4" style={styles.page}><Text style={styles.title}>AI Match Preview</Text><CandidateInformation data={data} candidate={candidate} /><InterestedInformation signals={signals} /><WorkExperienceSection workExperience={workExperience} companyTypeByName={companyTypeByName} />{sideProjects.length ? <View style={styles.sectionCard}><Text style={styles.sectionTitle}>Side Projects</Text>{sideProjects.map(({ item: project, key }) => <ProjectCard key={key} project={project} />)}</View> : null}<EducationSkills data={data} groupedSkills={groupedSkills} languages={languages} /><ProfileAnalysis validation={validation} /><MatchSection score={score ?? undefined} screening={screening} mapping={mapping} /><StrengthsWeaknesses strengths={strengths} weaknesses={weaknesses} screening={screening} /><RiskAssessment anomalyDetection={data.anomalyDetection ?? undefined} risks={screening?.risks} /></Page></Document>;
}

function AnomalySection({ anomaly }: { anomaly: ProfileAnomalyDetection }) {
  const keyedAnomalies = stableKeyedItems(anomaly.anomalies, (item) => `${item.type}|${item.description}|${item.evidence}`, 'anomaly');
  return <View wrap={false}><View style={styles.matchScoreRow}><View style={{ ...styles.matchTrack, backgroundColor: '#ffedd5' }}><View style={{ ...styles.matchFill, backgroundColor: '#f97316', width: `${Math.max(0, Math.min(100, anomaly.overallRiskScore))}%` }} /></View><Text style={{ ...styles.matchScoreText, color: '#c2410c' }}>{anomaly.overallRiskScore}/100</Text></View>{anomaly.summary && <Text style={{ marginBottom: 5 }}>{anomaly.summary}</Text>}{keyedAnomalies.map(({ item, key }) => <View key={key} style={styles.card} wrap={false}><Text style={styles.cardTitle}>{item.type}</Text><Text>{item.description}</Text><Text style={styles.muted}>{item.evidence}</Text></View>)}</View>;
}
