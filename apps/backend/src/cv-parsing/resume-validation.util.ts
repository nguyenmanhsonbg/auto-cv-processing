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
  // Business, marketing, and customer-facing role signals.
  'Marketing',
  'Digital Marketing',
  'Content Marketing',
  'Social Media',
  'SEO',
  'SEM',
  'Branding',
  'Sales',
  'Business Development',
  'Customer Service',
  'Public Relations',
  'Event Management',
  'Chăm sóc khách hàng',
  'Kinh doanh',
  'Bán hàng',
  'Truyền thông',
  'Quản trị Marketing',
  'Nghiên cứu thị trường',
  'Canva',
  'CRM',
  'Microsoft Office',
  'Excel',
  'PowerPoint',
  'Word',
  // Operations, analysis, and management signals.
  'Operational Analysis',
  'Business Operations',
  'Operations Analyst',
  'Operations Management',
  'Business Intelligence',
  'BI',
  'Management Reporting',
  'Dashboard',
  'Data Analysis',
  'Performance Analysis',
  'Strategic Planning',
  'Business Planning',
  'Process Improvement',
  'Business Process',
  'Phân tích điều hành',
  'Phân tích kinh doanh',
  'Phân tích dữ liệu',
  'Phân tích hiệu suất',
  'Báo cáo quản trị',
  'Quản trị vận hành',
  'KPI',
  'Chỉ số KPI',
  // SI partner, alliance, and channel development signals.
  'Partner Development',
  'Partner Management',
  'Partnerships',
  'Strategic Partnerships',
  'Channel Management',
  'Alliance Management',
  'System Integrator',
  'SI Partner',
  'SI Partnership',
  'Technology Partner',
  'Channel Partner',
  'Business Partner',
  'Ecosystem Development',
  'Partner Enablement',
  'Partner Success',
  'Partner Operations',
  'Quản lý đối tác',
  'Phát triển đối tác',
  'Đối tác SI',
  'Tích hợp hệ thống',
  'Kênh đối tác',
  'Liên minh chiến lược',
  // Customer experience and consulting signals.
  'Customer Experience',
  'CX',
  'Customer Journey',
  'Voice of Customer',
  'VOC',
  'Customer Success',
  'Customer Journey Mapping',
  'Service Design',
  'NPS',
  'CSAT',
  'CES',
  'Consultant',
  'Consulting',
  'Business Consultant',
  'Management Consultant',
  'Technology Consultant',
  'Solution Consultant',
  'IT Consultant',
  'Tư vấn',
  'Tư vấn giải pháp',
  'Trải nghiệm khách hàng',
  'Hành trình khách hàng',
  // Presales and implementation consulting signals.
  'Presales',
  'Pre-sales',
  'Sales Engineer',
  'Solutions Engineer',
  'Solution Architect',
  'Technical Sales',
  'Proposal',
  'RFP',
  'RFQ',
  'RFI',
  'Proof of Concept',
  'PoC',
  'Demo',
  'Discovery',
  'Implementation Consultant',
  'Implementation',
  'Deployment',
  'Professional Services',
  'Project Implementation',
  'Solution Deployment',
  'Functional Consultant',
  'ERP Implementation',
  'CRM Implementation',
  'Tư vấn tiền bán hàng',
  'Kỹ sư giải pháp',
  'Kiến trúc giải pháp',
  'Tư vấn triển khai',
  'Triển khai giải pháp',
  'Triển khai hệ thống',
  'Nghiệm thu',
  'Đào tạo người dùng',
  'UAT',
  'Go-live',
  'Cutover',
  'Migration',
  'Integration',
  // Information security and cybersecurity signals.
  'Cybersecurity',
  'Cyber Security',
  'Information Security',
  'Network Security',
  'Application Security',
  'Cloud Security',
  'Endpoint Security',
  'Data Security',
  'Security Operations',
  'Security Operations Center',
  'SOC',
  'SIEM',
  'SOAR',
  'Security Monitoring',
  'Threat Intelligence',
  'Threat Hunting',
  'Incident Response',
  'Digital Forensics',
  'Vulnerability Assessment',
  'Vulnerability Management',
  'Penetration Testing',
  'PenTest',
  'Ethical Hacking',
  'Red Team',
  'Blue Team',
  'Purple Team',
  'Risk Assessment',
  'Security Risk',
  'Security Governance',
  'GRC',
  'Compliance',
  'ISO 27001',
  'PCI DSS',
  'NIST',
  'CIS Controls',
  'IAM',
  'Identity and Access Management',
  'PAM',
  'MFA',
  'Zero Trust',
  'Firewall',
  'WAF',
  'IDS',
  'IPS',
  'DLP',
  'EDR',
  'XDR',
  'SASE',
  'VPN',
  'PKI',
  'Cryptography',
  'Encryption',
  'Secure SDLC',
  'DevSecOps',
  'OWASP',
  'OWASP Top 10',
  'CISO',
  'Security Analyst',
  'SOC Analyst',
  'Security Engineer',
  'Security Consultant',
  'Security Architect',
  'Security Compliance',
  'An toàn thông tin',
  'An ninh mạng',
  'Bảo mật thông tin',
  'Kiểm thử xâm nhập',
  'Quản trị rủi ro',
  'Ứng phó sự cố',
  'Giám sát an ninh',
  'Trung tâm điều hành an ninh',
  'Điều tra số',
  'Phân tích mã độc',
  'Mã hóa',
  'Tường lửa',
  'Kiểm soát truy cập',
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
