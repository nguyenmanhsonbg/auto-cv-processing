import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

type Value = Record<string, unknown>;

function record(value: unknown): Value {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Value : {};
}

function stringValue(value: unknown, fallback = '-') {
  const text = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value).trim()
    : '';
  return text || fallback;
}

function list(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => stringValue(item, '')).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function escapeHtml(value: unknown) {
  return stringValue(value, '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character] ?? character));
}

function insightCards(value: unknown, tone: 'blue' | 'green' | 'orange' | 'red') {
  const items = Array.isArray(value) ? value : [];
  if (!items.length) return '<p class="muted">No data recorded.</p>';
  return items.map((item, index) => {
    const insight = record(item);
    const title = escapeHtml(insight.title ?? insight.name ?? `Item ${index + 1}`);
    const evidence = escapeHtml(insight.evidence ?? insight.description ?? '');
    const badge = escapeHtml(insight.confidence ?? insight.severity ?? '');
    return `<div class="insight ${tone}"><div class="insight-head"><strong>${title}</strong>${badge ? `<span class="badge">${badge}</span>` : ''}</div>${evidence ? `<p>${evidence}</p>` : ''}</div>`;
  }).join('');
}

function profileHtml(detail: Value, parsedProfile: Value) {
  const candidate = record(detail.candidate);
  const profile = record(parsedProfile.parsedData ?? parsedProfile.profile ?? parsedProfile);
  const validation = record(profile.aiValidation);
  const screening = record(detail.aiScreening);
  const signals = record(profile.vcsSignals);
  const work = Array.isArray(profile.workExperience) ? profile.workExperience : [];
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  const groupedSkills = record(profile.groupedSkills);
  const skills = list(profile.skills);
  const certifications = list(profile.certifications);
  const technical = Array.isArray(signals.technicalChallenges) ? signals.technicalChallenges : [];
  const seniorRoles = Array.isArray(signals.seniorRoles) ? signals.seniorRoles : [];
  const technicalFallback = technical.length ? technical : work.flatMap((item) => record(item).projects as unknown[] ?? []).map((item) => ({ title: record(item).name, evidence: record(item).description ?? record(item).rawDescription }));
  const seniorFallback = seniorRoles.length ? seniorRoles : work.map((item) => ({ title: record(item).role, evidence: `Company: ${stringValue(record(item).company)}` }));
  const sectionScore = (name: string) => {
    const scores = Array.isArray(validation.sectionScores) ? validation.sectionScores : [];
    return record(scores.find((item) => record(item).section === name));
  };
  const scoreBadge = (name: string) => {
    const score = sectionScore(name);
    return score.score == null ? '' : `<span class="score-badge">${escapeHtml(score.score)}/10 ${escapeHtml(score.label)}</span>`;
  };

  return `
    <div class="preview-root">
      <div class="preview-title">AI Match Preview - ${escapeHtml(candidate.fullName ?? profile.name)}</div>
      <div class="preview-subtitle">CV-JD matching and AI screening result for this application.</div>

      <section class="card candidate-card"><h2>Candidate Information</h2><div class="info-grid">
        <div><span>Name</span><strong>${escapeHtml(candidate.fullName ?? profile.name)}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(candidate.email ?? profile.email)}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(candidate.phone ?? profile.phone)}</strong></div>
        <div><span>Level</span><strong>${escapeHtml(profile.level)}</strong></div>
      </div></section>

      <section class="card interested"><div class="card-header"><h2>Interested Information</h2><p>AI evaluated from CV content</p></div><div class="two-col">
        <div><h3>Technical Challenges</h3>${insightCards(technicalFallback, 'blue')}</div>
        <div><h3>Senior Roles</h3>${insightCards(seniorFallback, 'blue')}</div>
      </div></section>

      ${work.length ? `<section class="card"><h2>Work Experience ${scoreBadge('workExperience')}</h2>${work.map((item) => { const entry = record(item); return `<div class="work-row"><div class="row-head"><strong>${escapeHtml(entry.company)}</strong><span>${escapeHtml(entry.startYear)} - ${escapeHtml(entry.endYear ?? 'present')}</span></div>${entry.role ? `<p class="muted">${escapeHtml(entry.role)}</p>` : ''}${entry.summary ? `<p>${escapeHtml(entry.summary)}</p>` : ''}${list(entry.technologies).length ? `<div class="chips">${list(entry.technologies).map((technology) => `<span>${escapeHtml(technology)}</span>`).join('')}</div>` : ''}</div>`; }).join('')}</section>` : ''}

      ${projects.length ? `<section class="card"><h2>Side Projects</h2>${projects.map((item) => { const project = record(item); return `<div class="project-row"><strong>${escapeHtml(project.name)}</strong>${project.role ? `<span class="muted"> - ${escapeHtml(project.role)}</span>` : ''}${project.description ? `<p>${escapeHtml(project.description)}</p>` : ''}</div>`; }).join('')}</section>` : ''}

      <section class="card"><h2>Education &amp; Skills ${scoreBadge('education')}</h2><div class="info-grid"><div><span>Education</span><strong>${escapeHtml(profile.education)}</strong></div><div><span>Total Experience</span><strong>${escapeHtml(profile.totalYearsExperience)} years</strong></div></div>${Object.keys(groupedSkills).length ? Object.entries(groupedSkills).map(([category, values]) => `<div class="skill-group"><span>${escapeHtml(category)}</span><div class="chips">${list(values).map((skill) => `<span>${escapeHtml(skill)}</span>`).join('')}</div></div>`).join('') : `<div class="chips">${skills.concat(certifications).map((skill) => `<span>${escapeHtml(skill)}</span>`).join('')}</div>`}</section>

      <section class="card"><h2>AI Profile Analysis <span class="score-badge">Overall: ${escapeHtml(validation.completenessScore ?? screening.score)}</span></h2>${validation.summary || screening.summary ? `<p class="summary">${escapeHtml(validation.summary ?? screening.summary)}</p>` : ''}${Array.isArray(validation.highlights) && validation.highlights.length ? `<h3 class="green-text">Highlights</h3><ul>${validation.highlights.map((item) => `<li>✓ ${escapeHtml(item)}</li>`).join('')}</ul>` : ''}${Array.isArray(validation.concerns) && validation.concerns.length ? `<h3 class="red-text">Concerns</h3><ul>${validation.concerns.map((item) => `<li>! ${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</section>

      <section class="card"><h2>AI Strengths &amp; Weaknesses</h2><div class="two-col"><div><h3 class="green-text">Strengths</h3>${insightCards(screening.strengths, 'green')}</div><div><h3 class="orange-text">Weaknesses / Gaps</h3>${insightCards(screening.gaps, 'orange')}</div></div></section>

      <section class="card score-grid"><div><span>Mapping score</span><strong>${escapeHtml(record(detail.mapping).score)}</strong></div><div><span>AI score</span><strong>${escapeHtml(screening.score)}</strong></div><div><span>Recommendation</span><strong>${escapeHtml(screening.recommendation ?? record(detail.mapping).recommendation)}</strong></div><div><span>Status</span><strong>${escapeHtml(screening.status ?? record(detail.mapping).status)}</strong></div></section>

      <section class="card"><h2>AI Risk &amp; Anomaly Assessment</h2>${profile.anomalyDetection ? `<p>${escapeHtml(record(profile.anomalyDetection).summary)}</p>` : '<p class="muted">Risk score and parsed-profile anomaly analysis are not available yet.</p>'}${insightCards(screening.risks, 'red')}</section>
    </div>`;
}

function styles() {
  return `
    *{box-sizing:border-box}body{margin:0;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45}.preview-root{width:820px;padding:20px;background:#fff}.preview-title{font-size:22px;font-weight:700;line-height:1.2}.preview-subtitle{color:#64748b;font-size:13px;margin:3px 0 18px}.card{border:1px solid #dbe3ee;border-radius:9px;background:#fff;padding:20px;margin-bottom:18px;box-shadow:0 1px 2px rgba(15,23,42,.05)}h2{font-size:20px;margin:0 0 16px;font-weight:700}h3{font-size:14px;margin:0 0 10px;font-weight:700}.candidate-card h2{font-size:18px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 48px}.info-grid div,.score-grid div{display:grid;grid-template-columns:90px 1fr;gap:12px}.info-grid span,.score-grid span{color:#64748b}.interested{border:2px solid #69a9ff;padding:0;overflow:hidden;background:#f8fbff}.card-header{padding:20px 20px 12px;background:#eff7ff}.card-header h2{margin-bottom:3px}.card-header p{color:#64748b;font-size:12px;margin:0}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:14px 20px 20px}.insight{border:1px solid #dbe3ee;border-radius:6px;padding:12px;margin-bottom:10px;background:#fff}.insight.green{border-color:#b7e1c1;background:#f7fff8}.insight.orange{border-color:#f4c88b;background:#fffaf2}.insight.red{border-color:#f2b7b7;background:#fff8f8}.insight-head{display:flex;justify-content:space-between;gap:10px}.insight p{margin:5px 0 0;color:#64748b}.badge,.score-badge{font-size:11px;border:1px solid #cbd5e1;border-radius:999px;padding:2px 7px;color:#475569;white-space:nowrap}.score-badge{font-weight:400;background:#f8fafc}.work-row,.project-row{border:1px solid #dbe3ee;border-radius:7px;padding:14px;margin-bottom:10px}.row-head{display:flex;justify-content:space-between;gap:14px}.muted{color:#64748b}.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.chips span{background:#f1f5f9;border-radius:999px;padding:3px 9px;font-size:11px}.skill-group{margin-top:14px}.skill-group>span{display:block;color:#64748b;font-size:12px;margin-bottom:5px}.summary{color:#64748b;line-height:1.6}.green-text{color:#15803d}.orange-text{color:#c2410c}.red-text{color:#b91c1c}ul{margin:6px 0;padding-left:22px}.score-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.score-grid div{display:block}.score-grid strong{display:block;margin-top:4px}
  `;
}

function arrayBufferToBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export async function createAiMatchPreviewPdf(detail: Value, parsedProfile: Value) {
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.left = '0';
  root.style.top = '0';
  root.style.zIndex = '2147483647';
  root.style.pointerEvents = 'none';
  root.style.background = '#fff';
  root.style.width = '820px';
  root.innerHTML = `<style>${styles()}</style>${profileHtml(detail, parsedProfile)}`;
  document.body.appendChild(root);
  try {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const content = root.lastElementChild as HTMLElement;
    if (!content || content.tagName.toLowerCase() === 'style') {
      throw new Error('Không tìm thấy nội dung AI Match Preview để tạo PDF.');
    }
    const canvas = await html2canvas(content, { backgroundColor: '#fff', height: content.scrollHeight, scale: 2, useCORS: true, width: content.scrollWidth });
    const pdf = new jsPDF({ compress: true, format: 'a4', orientation: 'portrait', unit: 'mm' });
    const margin = 10;
    const width = pdf.internal.pageSize.getWidth() - margin * 2;
    const height = pdf.internal.pageSize.getHeight() - margin * 2;
    const pagePixels = Math.max(1, Math.floor((height / width) * canvas.width));
    let offset = 0;
    let page = 0;
    while (offset < canvas.height) {
      const slice = Math.min(pagePixels, canvas.height - offset);
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = slice;
      const context = pageCanvas.getContext('2d');
      if (!context) throw new Error('Could not render AI Match Preview PDF.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, offset, canvas.width, slice, 0, 0, pageCanvas.width, slice);
      if (page > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL('image/jpeg', .92), 'JPEG', margin, margin, width, (slice / canvas.width) * width);
      offset += slice;
      page += 1;
    }
    return arrayBufferToBase64(pdf.output('arraybuffer'));
  } finally {
    root.remove();
  }
}
