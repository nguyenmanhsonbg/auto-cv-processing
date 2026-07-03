const MIN_RESUME_TEXT_LENGTH = 120;
const RESUME_SKILL_KEYWORDS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'Go',
  'Golang',
  'C#',
  'C++',
  'Node.js',
  'React',
  'Angular',
  'Vue',
  'Next.js',
  'NestJS',
  'Spring Boot',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'GCP',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'Kafka',
  'GraphQL',
  'REST',
  'REST API',
  'Microservices',
  'Git',
  'CI/CD',
  'Selenium',
  'Cypress',
  'Playwright',
  'Figma',
  'Jira',
  'Business Analysis',
  'Manual Testing',
  'Automation Testing',
];

export type ResumeValidationStatus = 'LIKELY_CV' | 'NOT_CV';

export interface ResumeValidationResult {
  status: ResumeValidationStatus;
  isLikelyCv: boolean;
  score: number;
  requiredSignals: ['rawText', 'email', 'skills'];
  foundSignals: {
    rawText: boolean;
    email: boolean;
    skills: boolean;
  };
  extracted: {
    email: string | null;
    skills: string[];
    rawTextLength: number;
  };
  reasons: string[];
}

export function validateResumeSignals(
  parsedData: Record<string, unknown>,
  text: string,
): ResumeValidationResult {
  const normalizedText = normalizeText(text);
  const email = extractEmail(parsedData, normalizedText);
  const skills = extractSkills(parsedData, normalizedText);
  const hasRawText = normalizedText.length >= MIN_RESUME_TEXT_LENGTH;
  const score = [hasRawText, Boolean(email), skills.length > 0]
    .filter(Boolean).length;
  const status = score === 3 ? 'LIKELY_CV' : 'NOT_CV';

  return {
    status,
    isLikelyCv: status === 'LIKELY_CV',
    score,
    requiredSignals: ['rawText', 'email', 'skills'],
    foundSignals: {
      rawText: hasRawText,
      email: Boolean(email),
      skills: skills.length > 0,
    },
    extracted: {
      email,
      skills,
      rawTextLength: normalizedText.length,
    },
    reasons: buildResumeValidationReasons(hasRawText, email, skills),
  };
}

function extractEmail(parsedData: Record<string, unknown>, normalizedText: string) {
  const parsedEmail = optionalText(
    typeof parsedData.email === 'string' ? parsedData.email : null,
  );
  if (parsedEmail) return parsedEmail.toLowerCase();

  return normalizedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0].toLowerCase() ?? null;
}

function extractSkills(parsedData: Record<string, unknown>, normalizedText: string) {
  const parsedSkills = Array.isArray(parsedData.skills)
    ? parsedData.skills.filter((value): value is string => typeof value === 'string')
    : [];
  const normalizedSkillSet = new Set(parsedSkills.map((skill) => skill.toLowerCase()));
  const skills = [...parsedSkills];

  for (const keyword of RESUME_SKILL_KEYWORDS) {
    const pattern = buildSkillPattern(keyword);
    if (!pattern.test(normalizedText) || normalizedSkillSet.has(keyword.toLowerCase())) continue;
    skills.push(keyword);
    normalizedSkillSet.add(keyword.toLowerCase());
  }

  return skills.sort((a, b) => a.localeCompare(b));
}

function buildSkillPattern(keyword: string) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu');
}

function buildResumeValidationReasons(
  hasRawText: boolean,
  email: string | null,
  skills: string[],
) {
  const reasons: string[] = [];
  if (hasRawText) reasons.push('Extracted text is long enough for a CV-like document.');
  else reasons.push(`Extracted text is shorter than ${MIN_RESUME_TEXT_LENGTH} characters.`);

  if (email) reasons.push('Email address was found.');
  else reasons.push('Email address was not found.');

  if (skills.length > 0) reasons.push('At least one skill keyword was found.');
  else reasons.push('No configured skill keyword was found.');

  return reasons;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function optionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}
