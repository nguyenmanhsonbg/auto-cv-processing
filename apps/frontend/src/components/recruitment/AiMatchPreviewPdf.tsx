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

function projectTechstack(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : value && typeof value === 'object'
        ? Object.values(value as Record<string, unknown>).flatMap((item) => Array.isArray(item) ? item : [item])
        : [];
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
  return score >= 8 ? '#22c55e' : score >= 6 ? '#3b82f6' : score >= 4 ? '#fb923c' : '#f87171';
}

function matchColor(score: number) {
  return score >= 70 ? '#16a34a' : score >= 50 ? '#2563eb' : score >= 35 ? '#f97316' : '#dc2626';
}

function companyTypeColor(type?: string) {
  return ({ PRODUCT: '#2563eb', STARTUP: '#9333ea', ENTERPRISE: '#475569', OUTSOURCE: '#f97316' } as Record<string, string>)[type ?? ''] ?? '#64748b';
}

function deriveProjects(entry: WorkExperience): NonNullable<WorkExperience['projects']> {
  if (entry.projects?.length) return entry.projects;
  if (!entry.rawDescription) return [];
  const matches = [...entry.rawDescription.matchAll(/(?:^|\n)(EDENGUE|Viettel HIS)(?=\s|\()/gi)];
  return matches.map((match, index) => {
    const name = match[1];
    const start = (match.index ?? 0) + match[0].lastIndexOf(name) + name.length;
    const end = matches[index + 1]?.index ?? entry.rawDescription!.length;
    const description = entry.rawDescription!.slice(start, end).replace(/^\s*\([^\n]+\)\s*(?:\|[^\n]*)?/i, '').replace(/[â—¦â€¢]/g, '').replace(/\s+/g, ' ').trim();
    return { name, role: entry.role, techstack: entry.technologies ?? [], description: description.slice(0, 420), rawDescription: description };
  });
}

function period(entry: WorkExperience) {
  const item = entry as WorkExperience & { startDate?: string; endDate?: string | null };
  return `${item.startDate ?? entry.startYear ?? '?'} - ${item.endDate ?? (entry.endYear == null ? 'present' : entry.endYear)}`;
}

function scoreRow(label: string, score: ProfileSectionScore) {
  return <View style={styles.scoreRow} wrap={false}>
    <Text style={styles.scoreLabel}>{label}</Text>
    <View style={styles.scoreTrack}><View style={{ ...styles.scoreFill, backgroundColor: scoreColor(score.score), width: `${Math.max(0, Math.min(10, score.score)) * 10}%` }} /></View>
    <Text style={styles.scoreText}>{score.score}/10 {score.label}</Text>
  </View>;
}

function WorkCard({ entry, companyType }: { entry: WorkExperience; companyType?: string }) {
  const projects = deriveProjects(entry);
  return <View style={styles.card}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
      <Text style={{ ...styles.cardTitle, flex: 1, marginBottom: 0, marginRight: 8 }}>{entry.company}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ ...styles.muted, marginRight: 8 }}>{period(entry)}</Text>
        <Text style={{ ...styles.companyTypeBadge, backgroundColor: companyTypeColor(entry.companyType ?? companyType ?? 'UNKNOWN') }}>{entry.companyType ?? companyType ?? 'UNKNOWN'}</Text>
      </View>
    </View>
    {entry.role && <Text style={styles.muted}>{entry.role}</Text>}
    {entry.summary && <Text style={{ marginTop: 4 }}>{entry.summary}</Text>}
    {list(entry.responsibilities).length ? <Text style={{ ...styles.cardTitle, marginTop: 5 }}>Responsibilities</Text> : null}
    {list(entry.responsibilities).map((item, index) => <Text key={`responsibility-${index}`} style={styles.bullet}>- {item}</Text>)}
    {list(entry.achievements).length ? <Text style={{ ...styles.cardTitle, marginTop: 5 }}>Achievements</Text> : null}
    {list(entry.achievements).map((item, index) => <Text key={`achievement-${index}`} style={styles.bullet}>- {item}</Text>)}
    {list(entry.technologies).length ? <Text style={styles.tagLine}>Technologies: {list(entry.technologies).join(', ')}</Text> : null}
    {projects.map((project, index) => <View key={`project-${index}`} style={{ marginTop: 6, marginLeft: 8 }}>
      <Text style={styles.cardTitle}>{project.name}{project.role ? ` - ${project.role}` : ''}{project.startYear != null || project.endYear != null ? ` (${project.startYear ?? '?'} - ${project.endYear == null ? 'present' : project.endYear})` : ''}</Text>
      {project.projectType && <Text style={styles.muted}>Project type: {project.projectType}</Text>}
      {project.description && <Text style={{ marginTop: 3 }}>{project.description}</Text>}
      {projectTechstack(project.techstack).length ? <Text style={styles.tagLine}>Technologies: {projectTechstack(project.techstack).join(', ')}</Text> : null}
      {list(project.responsibilities).map((item, itemIndex) => <Text key={`project-item-${itemIndex}`} style={styles.bullet}>- {item}</Text>)}
      {list(project.achievements).map((item, itemIndex) => <Text key={`project-achievement-${itemIndex}`} style={styles.bullet}>- {item}</Text>)}
    </View>)}
  </View>;
}

function ProjectCard({ project }: { project: NonNullable<ParsedProfile['projects']>[number] }) {
  return <View style={styles.card} wrap={false}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text style={{ ...styles.cardTitle, flex: 1 }}>{project.name}{project.role ? ` - ${project.role}` : ''}</Text>
      {project.startYear != null || project.endYear != null ? <Text style={styles.muted}>{project.startYear ?? '?'} - {project.endYear == null ? 'present' : project.endYear}</Text> : null}
    </View>
    {project.projectType && <Text style={styles.muted}>Project type: {project.projectType}</Text>}
    {projectTechstack(project.techstack).length ? <Text style={styles.tagLine}>Technologies: {projectTechstack(project.techstack).join(', ')}</Text> : null}
    {project.description && <Text style={{ marginTop: 4 }}>{project.description}</Text>}
    {list(project.responsibilities).map((item, index) => <Text key={`side-project-${index}`} style={styles.bullet}>- {item}</Text>)}
    {list(project.achievements).map((item, index) => <Text key={`side-achievement-${index}`} style={styles.bullet}>- {item}</Text>)}
  </View>;
}

function SignalPdfRow({ label, ok, value, evidence }: { label: string; ok?: boolean; value?: string | null; evidence?: string | null }) {
  return <View style={{ borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingVertical: 5 }} wrap={false}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ ...styles.cardTitle, flex: 1, marginBottom: 0, marginRight: 8 }}>{label}</Text>
      <Text style={{
        fontSize: 8,
        fontWeight: 700,
        color: ok ? '#15803d' : '#b91c1c',
        backgroundColor: ok ? '#f0fdf4' : '#fef2f2',
        borderColor: ok ? '#bbf7d0' : '#fca5a5',
        borderWidth: 1,
        borderRadius: 3,
        paddingVertical: 2,
        paddingHorizontal: 6,
      }}>
        {ok ? 'OK' : 'Not OK'}
      </Text>
    </View>
    {value && <Text style={{ marginLeft: 14, marginTop: 2 }}>{value}</Text>}
    {evidence && <Text style={{ ...styles.muted, marginLeft: 14, marginTop: 2 }}> &gt; {evidence}</Text>}
  </View>;
}

const EMPTY_SIGNALS: VcsSignals = {
  university: { ok: false, evidence: '' },
  companyType: { ok: false, companies: [], evidence: '' },
  advancedSkills: { ok: false, items: [], evidence: '' },
  technicalChallenges: { ok: false, items: [], evidence: '' },
  seniorRoles: { ok: false, items: [], evidence: '' },
};

export function AiMatchPreviewPdf({ profile, mapping, screening, candidate }: PdfProps) {
  const data = profilePayload(profile);
  const validation = data.aiValidation as AiValidation | undefined;
  const signals = (data.vcsSignals as VcsSignals | undefined) ?? EMPTY_SIGNALS;
  const score = screening?.score ?? mapping?.score;
  const workExperience = data.workExperience ?? [];
  const groupedSkills = data.groupedSkills ? Object.entries(data.groupedSkills) : [];
  const companyTypeByName = Object.fromEntries((Array.isArray((data as ParsedProfile & { companies?: unknown }).companies) ? (data as ParsedProfile & { companies?: Array<{ name?: string; type?: string }> }).companies : [])?.flatMap((item) => item.name && item.type ? [[item.name, item.type]] : []) ?? []);
  const languages = (data as ParsedProfile & { languages?: unknown }).languages;
  const strengths = [...(validation?.highlights ?? []), ...(screening?.strengths ?? []).map((item) => item.title ?? '')].filter(Boolean);
  const weaknesses = [...(validation?.concerns ?? []), ...(screening?.gaps ?? []).map((item) => item.title ?? '')].filter(Boolean);

  return <Document title={`AI Match - ${candidate?.fullName ?? 'Candidate'}`} author="VCS Interview Assistant">
    <Page size="A4" style={styles.page}>
      <Text style={styles.title}>AI Match Preview</Text>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Candidate Information</Text>
        <View style={styles.row}>
          <View style={{ flex: 1, flexDirection: 'row' }}><Text style={{ ...styles.label, width: 50 }}>Name</Text><Text style={styles.value}>{candidate?.fullName ?? data.name ?? '-'}</Text></View>
          <View style={{ flex: 1, flexDirection: 'row' }}><Text style={{ ...styles.label, width: 50 }}>Email</Text><Text style={styles.value}>{candidate?.email ?? data.email ?? '-'}</Text></View>
        </View>
        <View style={styles.row}>
          <View style={{ flex: 1, flexDirection: 'row' }}><Text style={{ ...styles.label, width: 50 }}>Phone</Text><Text style={styles.value}>{candidate?.phone ?? data.phone ?? '-'}</Text></View>
          <View style={{ flex: 1, flexDirection: 'row' }}><Text style={{ ...styles.label, width: 50 }}>Level</Text><Text style={styles.value}>{data.level ?? '-'}</Text></View>
        </View>
      </View>

      <View style={styles.sectionCard} wrap={false}>
        <Text style={styles.sectionTitle}>Interested Information</Text>
        <SignalPdfRow label="Education" ok={signals.university?.ok} value={signals.university?.name} evidence={signals.university?.evidence} />
        <SignalPdfRow label="Company Type" ok={signals.companyType?.ok} value={signals.companyType?.companies?.join(', ')} evidence={signals.companyType?.evidence} />
        <SignalPdfRow label="Advanced Skills" ok={signals.advancedSkills?.ok} value={signals.advancedSkills?.items?.map((item) => item.skill).join(', ')} evidence={signals.advancedSkills?.items?.map((item) => item.evidence).filter(Boolean).join(' | ') || signals.advancedSkills?.evidence} />
        <SignalPdfRow label="Technical Challenges" ok={signals.technicalChallenges?.ok} value={signals.technicalChallenges?.items?.map((item) => `${item.challenge}${item.projectSize ? ` (${item.projectSize})` : ''}`).join(', ')} evidence={signals.technicalChallenges?.items?.map((item) => item.evidence).filter(Boolean).join(' | ') || signals.technicalChallenges?.evidence} />
        <SignalPdfRow label="Senior Roles" ok={signals.seniorRoles?.ok} value={signals.seniorRoles?.items?.map((item) => `${item.role}${item.projectSize ? ` (${item.projectSize})` : ''}`).join(', ')} evidence={signals.seniorRoles?.items?.map((item) => item.evidence).filter(Boolean).join(' | ') || signals.seniorRoles?.evidence} />
      </View>

      <View style={styles.sectionCard}>
        <View>
          <Text style={styles.sectionTitle}>Work Experience</Text>
          {workExperience[0] ? <WorkCard entry={workExperience[0]} companyType={companyTypeByName[workExperience[0].company]} /> : <Text style={styles.muted}>No work experience extracted.</Text>}
        </View>
        {workExperience.slice(1).map((entry, index) => <WorkCard key={`work-${index + 1}`} entry={entry} companyType={companyTypeByName[entry.company]} />)}
      </View>

      {data.projects?.length ? <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Side Projects</Text>
        {data.projects.map((project, index) => <ProjectCard key={`side-${index}`} project={project} />)}
      </View> : null}

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Education &amp; Skills</Text>
        {data.education && <Text style={{ marginBottom: 6 }}>Education: {data.education}</Text>}
        {data.totalYearsExperience != null && <Text style={{ marginBottom: 6 }}>Total Experience: {experienceYears(data.totalYearsExperience)} years</Text>}
        {groupedSkills.map(([group, items]) => <Text key={group} style={styles.tagLine}>{group}: {list(items).join(', ')}</Text>)}
        {list(data.skills).length > 0 && groupedSkills.length === 0 && <Text style={styles.tagLine}>Skills: {list(data.skills).join(', ')}</Text>}
        {list(data.certifications).length > 0 && <Text style={styles.tagLine}>Certifications: {list(data.certifications).join(', ')}</Text>}
        {data.experienceByLanguage && typeof data.experienceByLanguage === 'object' && !Array.isArray(data.experienceByLanguage) && <Text style={styles.tagLine}>Experience by Language: {Object.entries(data.experienceByLanguage).map(([language, years]) => `${language} ${years}y`).join(', ')}</Text>}
        {list(languages).length > 0 && <Text style={styles.tagLine}>Languages: {list(languages).join(', ')}</Text>}
      </View>

      {validation && <View style={styles.sectionCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4 }}>
          <Text style={{ ...styles.sectionTitle, marginBottom: 0, borderBottomWidth: 0, paddingBottom: 0 }}>AI Profile Analysis</Text>
          <Text style={{
            fontSize: 8,
            fontWeight: 700,
            color: validation.completenessScore >= 80 ? '#15803d' : validation.completenessScore >= 60 ? '#1d4ed8' : '#c2410c',
            backgroundColor: validation.completenessScore >= 80 ? '#f0fdf4' : validation.completenessScore >= 60 ? '#eff6ff' : '#fff7ed',
            borderColor: validation.completenessScore >= 80 ? '#bbf7d0' : validation.completenessScore >= 60 ? '#bfdbfe' : '#fed7aa',
            borderWidth: 1,
            borderRadius: 3,
            paddingVertical: 2,
            paddingHorizontal: 6,
            marginLeft: 8,
          }}>
            Overall: {validation.completenessScore}/100 - {validation.completenessScore >= 80 ? 'Good' : validation.completenessScore >= 60 ? 'Fair' : 'Weak'}
          </Text>
        </View>
        {validation.summary && <Text style={{ marginBottom: 7 }}>{validation.summary}</Text>}
        {validation.sectionScores?.length ? <Text style={{ ...styles.cardTitle, marginBottom: 5 }}>Category Scores</Text> : null}
        {validation.sectionScores?.map((item) => <View key={`profile-score-${item.section}`}>{scoreRow(sectionLabel(item.section), item)}</View>)}
        {validation.highlights?.length ? (
          <View style={{ marginTop: 6 }}>
            <Text style={{ ...styles.good, marginBottom: 3 }}>Highlights</Text>
            {validation.highlights.map((item, index) => (
              <View key={`highlight-${index}`} style={{ flexDirection: 'row', alignItems: 'flex-start', marginLeft: 4, marginBottom: 2 }}>
                <Svg width={9} height={9} viewBox="0 0 24 24" style={{ marginRight: 4, marginTop: 1 }}>
                  <Path d="M20 6L9 17l-5-5" stroke="#15803d" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={{ flex: 1 }}>{item}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {validation.concerns?.length ? (
          <View style={{ marginTop: 6 }}>
            <Text style={{ ...styles.concern, marginBottom: 3 }}>Concerns</Text>
            {validation.concerns.map((item, index) => (
              <View key={`concern-${index}`} style={{ flexDirection: 'row', alignItems: 'flex-start', marginLeft: 4, marginBottom: 2 }}>
                <Svg width={9} height={9} viewBox="0 0 24 24" style={{ marginRight: 4, marginTop: 1 }}>
                  <Path d="M12 4v9m0 4h.01" stroke="#c2410c" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text style={{ flex: 1 }}>{item}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>}

      <View style={styles.matchBox} wrap={false}>
        <Text style={styles.sectionTitle}>CV-JD Match</Text>
        <Text style={styles.muted}>How well the candidate fits this job description</Text>
        {score != null ? <View style={styles.matchScoreRow}>
          <View style={styles.matchTrack}><View style={{ ...styles.matchFill, backgroundColor: matchColor(score), width: `${Math.max(0, Math.min(100, score))}%` }} /></View>
          <Text style={{ ...styles.matchScoreText, color: matchColor(score) }}>{score} / 100</Text>
        </View> : <Text style={styles.matchScore}>- / 100</Text>}
        {screening?.summary && <View style={{ borderWidth: 1, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', borderRadius: 4, padding: 7, marginBottom: 5 }}><Text style={{ ...styles.cardTitle, color: '#312e81' }}>JD Fit Assessment</Text><Text>{screening.summary}</Text></View>}
        <Text>Recommendation: {recommendation(screening?.recommendation ?? mapping?.recommendation)}</Text>
        <Text>Screening status: {screening?.status ?? mapping?.status ?? '-'}</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>AI Strengths &amp; Weaknesses</Text>
        <View style={styles.twoCol}>
          <View style={styles.col}><Text style={styles.good}>Strengths</Text>{strengths.map((item, index) => <Text key={`strength-${index}`} style={styles.bullet}>- {item}</Text>)}{(screening?.strengths ?? []).map((item, index) => item.evidence ? <Text key={`strength-evidence-${index}`} style={styles.muted}>{item.evidence}</Text> : null)}</View>
          <View style={styles.col}><Text style={styles.concern}>Weaknesses / Gaps</Text>{weaknesses.map((item, index) => <Text key={`gap-${index}`} style={styles.bullet}>- {item}</Text>)}{(screening?.gaps ?? []).map((item, index) => item.evidence ? <Text key={`gap-evidence-${index}`} style={styles.muted}>{item.evidence}</Text> : null)}</View>
        </View>
      </View>

      {(data.anomalyDetection || screening?.risks?.length) && <View style={styles.sectionCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7, borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 4 }}>
          <Text style={{ ...styles.sectionTitle, marginBottom: 0, borderBottomWidth: 0, paddingBottom: 0 }}>AI Risk &amp; Anomaly Assessment</Text>
          {data.anomalyDetection && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
              <Text style={{ color: '#475569', fontSize: 8, marginRight: 4 }}>Risk level:</Text>
              <Text style={{
                fontSize: 8,
                fontWeight: 700,
                color: '#c2410c',
                backgroundColor: '#fff7ed',
                borderColor: '#fed7aa',
                borderWidth: 1,
                borderRadius: 3,
                paddingVertical: 2,
                paddingHorizontal: 6,
              }}>
                {data.anomalyDetection.riskLevel.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
        {data.anomalyDetection && <AnomalySection anomaly={data.anomalyDetection} />}
        {screening?.risks?.map((risk, index) => (
          <View key={`risk-${index}`} style={styles.card} wrap={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: risk.evidence ? 3 : 0 }}>
              <Text style={{ ...styles.cardTitle, flex: 1, marginBottom: 0, marginRight: 8 }}>{risk.title ?? `Risk ${index + 1}`}</Text>
              {risk.severity && (
                <Text style={{
                  fontSize: 8,
                  fontWeight: 700,
                  color: risk.severity.toUpperCase() === 'HIGH' ? '#dc2626' : risk.severity.toUpperCase() === 'MEDIUM' ? '#c2410c' : '#475569',
                  backgroundColor: risk.severity.toUpperCase() === 'HIGH' ? '#fef2f2' : risk.severity.toUpperCase() === 'MEDIUM' ? '#fff7ed' : '#f8fafc',
                  borderColor: risk.severity.toUpperCase() === 'HIGH' ? '#fca5a5' : risk.severity.toUpperCase() === 'MEDIUM' ? '#fed7aa' : '#e2e8f0',
                  borderWidth: 1,
                  borderRadius: 3,
                  paddingVertical: 2,
                  paddingHorizontal: 6,
                }}>
                  {risk.severity.toUpperCase()}
                </Text>
              )}
            </View>
            {risk.evidence && <Text>{risk.evidence}</Text>}
          </View>
        ))}
      </View>}
    </Page>
  </Document>;
}

function AnomalySection({ anomaly }: { anomaly: ProfileAnomalyDetection }) {
  return <View wrap={false}>
    <View style={styles.matchScoreRow}>
      <View style={{ ...styles.matchTrack, backgroundColor: '#ffedd5' }}><View style={{ ...styles.matchFill, backgroundColor: '#f97316', width: `${Math.max(0, Math.min(100, anomaly.overallRiskScore))}%` }} /></View>
      <Text style={{ ...styles.matchScoreText, color: '#c2410c' }}>{anomaly.overallRiskScore}/100</Text>
    </View>
    {anomaly.summary && <Text style={{ marginBottom: 5 }}>{anomaly.summary}</Text>}
    {anomaly.anomalies.map((item, index) => <View key={`anomaly-${index}`} style={styles.card} wrap={false}><Text style={styles.cardTitle}>{item.type}</Text><Text>{item.description}</Text><Text style={styles.muted}>{item.evidence}</Text></View>)}
  </View>;
}
