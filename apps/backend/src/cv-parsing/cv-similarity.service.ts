import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export const CV_SIMILARITY_THRESHOLD = 0.95;
export const CV_EXACT_FILE_HASH_METHOD_VERSION = 'EXACT_ORIGINAL_FILE_HASH_V1' as const;
export const CV_SIMILARITY_METHOD_VERSION = 'TFIDF_WORD_CHAR_SECTION_V3' as const;

type CvSectionName =
  | 'summary'
  | 'experience'
  | 'projects'
  | 'skills'
  | 'education'
  | 'certifications'
  | 'other';

interface NormalizedSimilarityDocument {
  text: string;
  sections: Map<CvSectionName, string>;
}

interface SectionHeadingMatch {
  name: CvSectionName;
  content: string;
}

const CV_SECTION_WEIGHTS: Record<CvSectionName, number> = {
  experience: 0.35,
  projects: 0.25,
  skills: 0.15,
  education: 0.1,
  summary: 0.05,
  certifications: 0.05,
  other: 0.05,
};

const CV_SECTION_ORDER: CvSectionName[] = [
  'summary',
  'education',
  'experience',
  'projects',
  'skills',
  'certifications',
  'other',
];

const CV_SECTION_LABELS: Record<CvSectionName, string> = {
  summary: 'summary',
  education: 'education',
  experience: 'experience',
  projects: 'projects',
  skills: 'skills',
  certifications: 'certifications',
  other: 'other',
};

export interface CvSimilarityIdentity {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface CvSimilarityResult {
  score: number;
  isDuplicate: boolean;
  threshold: number;
  methodVersion: typeof CV_SIMILARITY_METHOD_VERSION;
  oldNormalizedTextHash: string;
  newNormalizedTextHash: string;
  featureCount: number;
  sharedFeatureCount: number;
  wordScore: number;
  charScore: number;
  sectionScore: number;
}

@Injectable()
export class CvSimilarityService {
  normalizeForSimilarity(text: string, identity?: CvSimilarityIdentity): string {
    return this.buildNormalizedDocument(text, identity).text;
  }

  buildFeatures(normalizedText: string): string[] {
    const tokens = this.tokenize(normalizedText.normalize('NFKC').toLowerCase());
    const features: string[] = [...tokens];

    for (let index = 0; index < tokens.length - 1; index += 1) {
      features.push(`${tokens[index]} ${tokens[index + 1]}`);
    }

    return features;
  }

  buildCharFeatures(normalizedText: string): string[] {
    const compactText = normalizedText
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/gu, ' ')
      .trim();
    const features: string[] = [];

    for (let ngramLength = 3; ngramLength <= 5; ngramLength += 1) {
      for (let index = 0; index <= compactText.length - ngramLength; index += 1) {
        features.push(compactText.slice(index, index + ngramLength));
      }
    }

    return features;
  }

  compare(
    oldText: string,
    newText: string,
    identity?: CvSimilarityIdentity,
  ): CvSimilarityResult {
    const oldDocument = this.buildNormalizedDocument(oldText, identity);
    const newDocument = this.buildNormalizedDocument(newText, identity);
    const oldNormalizedText = oldDocument.text;
    const newNormalizedText = newDocument.text;

    if (!oldNormalizedText || !newNormalizedText) {
      throw new Error('CV text is empty');
    }

    if (
      oldNormalizedText === newNormalizedText
      || this.compactSimilarityText(oldNormalizedText) === this.compactSimilarityText(newNormalizedText)
    ) {
      return {
        score: 1,
        isDuplicate: true,
        threshold: CV_SIMILARITY_THRESHOLD,
        methodVersion: CV_SIMILARITY_METHOD_VERSION,
        oldNormalizedTextHash: this.hash(oldNormalizedText),
        newNormalizedTextHash: this.hash(newNormalizedText),
        featureCount: 0,
        sharedFeatureCount: 0,
        wordScore: 1,
        charScore: 1,
        sectionScore: 1,
      };
    }

    const oldWordFeatures = this.buildFeatures(oldNormalizedText);
    const newWordFeatures = this.buildFeatures(newNormalizedText);
    const oldCharFeatures = this.buildCharFeatures(oldNormalizedText);
    const newCharFeatures = this.buildCharFeatures(newNormalizedText);
    const wordScore = this.cosineSimilarityForFeatures(oldWordFeatures, newWordFeatures);
    const charScore = this.cosineSimilarityForFeatures(oldCharFeatures, newCharFeatures);
    const sectionScore = this.compareSections(oldDocument.sections, newDocument.sections);
    const score = this.clampScore(
      (wordScore * 0.55) + (charScore * 0.25) + (sectionScore * 0.2),
    );

    const vocabulary = new Set([...oldWordFeatures, ...newWordFeatures]);
    const newWordFeatureSet = new Set(newWordFeatures);
    const sharedFeatureCount = [...new Set(oldWordFeatures)].filter((feature) =>
      newWordFeatureSet.has(feature),
    ).length;

    return {
      score,
      isDuplicate: score >= CV_SIMILARITY_THRESHOLD,
      threshold: CV_SIMILARITY_THRESHOLD,
      methodVersion: CV_SIMILARITY_METHOD_VERSION,
      oldNormalizedTextHash: this.hash(oldNormalizedText),
      newNormalizedTextHash: this.hash(newNormalizedText),
      featureCount: vocabulary.size,
      sharedFeatureCount,
      wordScore,
      charScore,
      sectionScore,
    };
  }

  private buildNormalizedDocument(
    text: string,
    identity?: CvSimilarityIdentity,
  ): NormalizedSimilarityDocument {
    const sourceText = this.stripExtractedCvHeader((text ?? '').normalize('NFC'));
    const sections = new Map<CvSectionName, string>();
    let currentSection: CvSectionName = 'other';

    for (const line of sourceText.split(/\r?\n/u)) {
      const heading = this.matchSectionHeading(line);
      if (heading) {
        currentSection = heading.name;
        if (heading.content) {
          this.appendSectionText(sections, currentSection, heading.content);
        }
        continue;
      }

      if (line.trim()) {
        this.appendSectionText(sections, currentSection, line);
      }
    }

    const normalizedSections = new Map<CvSectionName, string>();
    for (const [sectionName, sectionText] of sections) {
      const normalizedSection = this.normalizeSimilarityText(sectionText, identity);
      if (normalizedSection) {
        normalizedSections.set(sectionName, normalizedSection);
      }
    }

    return {
      text: CV_SECTION_ORDER
        .map((sectionName) => {
          const sectionText = normalizedSections.get(sectionName);
          return sectionText
            ? `${CV_SECTION_LABELS[sectionName]} ${sectionText}`
            : '';
        })
        .filter(Boolean)
        .join(' '),
      sections: normalizedSections,
    };
  }

  private normalizeSimilarityText(text: string, identity?: CvSimilarityIdentity): string {
    let normalized = this.canonicalizeExtractedText(text).toLowerCase();

    normalized = normalized
      .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, ' ')
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
      .replace(/\b(?:github|gitlab)\.com\/[^\s<>()]+/gi, ' ')
      .replace(/\blinkedin\.com\/(?:in|pub)\/[^\s<>()]+/gi, ' ')
      .replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, ' ');

    for (const value of [identity?.name, identity?.email, identity?.phone]) {
      const cleanValue = value?.normalize('NFC').trim().toLowerCase();
      if (cleanValue) {
        normalized = normalized.replace(
          new RegExp(this.escapeRegExp(cleanValue), 'gi'),
          ' ',
        );
      }
    }

    return this.tokenize(normalized).join(' ');
  }

  private canonicalizeExtractedText(text: string) {
    return text
      .normalize('NFKC')
      .replace(/[\u00ad\u200b\u200c\u200d]/gu, '')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
      .replace(/([\p{L}\p{N}])-[ \t]*\r?\n[ \t]*([\p{L}\p{N}])/gu, '$1$2')
      .replace(/[ \t]+/gu, ' ')
      .replace(/\r?\n[ \t]*/gu, '\n')
      .trim();
  }

  private compactSimilarityText(text: string) {
    return text.replace(/[^\p{L}\p{N}]+/gu, '');
  }

  private matchSectionHeading(line: string): SectionHeadingMatch | null {
    const trimmedLine = line.trim();
    const patterns: Array<{ name: CvSectionName; pattern: RegExp }> = [
      {
        name: 'experience',
        pattern: /^(?:work\s+experience|professional\s+experience|employment(?:\s+history)?|kinh\s+nghiệm(?:\s+làm\s+việc)?|kinh\s+nghiem)(?:\s*[:\-]\s*(.*))?$/iu,
      },
      {
        name: 'education',
        pattern: /^(?:education|academic\s+background|học\s+vấn|hoc\s+van)(?:\s*[:\-]\s*(.*))?$/iu,
      },
      {
        name: 'projects',
        pattern: /^(?:personal\s+projects|projects?|selected\s+projects|dự\s+án|du\s+an)(?:\s*[:\-]\s*(.*))?$/iu,
      },
      {
        name: 'skills',
        pattern: /^(?:technical\s+skills|skills?|competencies|kỹ\s+năng|ky\s+nang)(?:\s*[:\-]\s*(.*))?$/iu,
      },
      {
        name: 'certifications',
        pattern: /^(?:certifications?|licenses?|chứng\s+chỉ|chung\s+chi)(?:\s*[:\-]\s*(.*))?$/iu,
      },
      {
        name: 'summary',
        pattern: /^(?:professional\s+summary|summary|profile|objective|about\s+me|tóm\s+tắt|tom\s+tat|mục\s+tiêu|muc\s+tieu|giới\s+thiệu|gioi\s+thieu)(?:\s*[:\-]\s*(.*))?$/iu,
      },
    ];

    for (const { name, pattern } of patterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        return { name, content: match[1]?.trim() ?? '' };
      }
    }

    return null;
  }

  private appendSectionText(
    sections: Map<CvSectionName, string>,
    sectionName: CvSectionName,
    text: string,
  ) {
    sections.set(
      sectionName,
      `${sections.get(sectionName) ?? ''} ${text}`.trim(),
    );
  }

  private compareSections(
    oldSections: Map<CvSectionName, string>,
    newSections: Map<CvSectionName, string>,
  ): number {
    const sectionNames = new Set<CvSectionName>([
      ...oldSections.keys(),
      ...newSections.keys(),
    ]);
    if (sectionNames.size === 0) return 0;

    let weightedScore = 0;
    let totalWeight = 0;
    for (const sectionName of sectionNames) {
      const weight = CV_SECTION_WEIGHTS[sectionName];
      const oldSection = oldSections.get(sectionName) ?? '';
      const newSection = newSections.get(sectionName) ?? '';
      const sectionScore = oldSection && newSection
        ? (this.cosineSimilarityForFeatures(
          this.buildFeatures(oldSection),
          this.buildFeatures(newSection),
        ) * 0.55)
          + (this.cosineSimilarityForFeatures(
            this.buildCharFeatures(oldSection),
            this.buildCharFeatures(newSection),
          ) * 0.45)
        : 0;

      weightedScore += weight * sectionScore;
      totalWeight += weight;
    }

    return totalWeight === 0 ? 0 : this.clampScore(weightedScore / totalWeight);
  }

  private cosineSimilarityForFeatures(oldFeatures: string[], newFeatures: string[]): number {
    if (oldFeatures.length === 0 || newFeatures.length === 0) return 0;

    const vocabulary = new Set([...oldFeatures, ...newFeatures]);
    const documentFrequency = new Map<string, number>();

    for (const document of [oldFeatures, newFeatures]) {
      for (const feature of new Set(document)) {
        documentFrequency.set(feature, (documentFrequency.get(feature) ?? 0) + 1);
      }
    }

    const idf = new Map<string, number>();
    for (const feature of vocabulary) {
      const frequency = documentFrequency.get(feature) ?? 0;
      idf.set(feature, Math.log((2 + 1) / (frequency + 1)) + 1);
    }

    const oldVector = this.toTfIdfVector(oldFeatures, vocabulary, idf);
    const newVector = this.toTfIdfVector(newFeatures, vocabulary, idf);
    return this.cosineSimilarity(oldVector, newVector);
  }

  private clampScore(score: number): number {
    return Math.min(1, Math.max(0, score));
  }

  private stripExtractedCvHeader(text: string): string {
    const firstSectionHeading = text.search(
      /(?:^|\n)\s*(?:professional\s+summary|summary|profile|objective|education|work\s+experience|professional\s+experience|experience|employment|technical\s+skills|skills|projects|certifications|achievements|awards|volunteer\s+experience|references|học\s+vấn|hoc\s+van|kinh\s+nghiệm|kinh\s+nghiem|kỹ\s+năng|ky\s+nang|dự\s+án|du\s+an|chứng\s+chỉ|chung\s+chi)\b/iu,
    );

    return firstSectionHeading > 0 ? text.slice(firstSectionHeading) : text;
  }

  private tokenize(text: string): string[] {
    return text.match(/(?:\.[\p{L}\p{N}]+|[\p{L}\p{N}]+(?:[+#]+|(?:[.-][\p{L}\p{N}]+)*)?)/gu) ?? [];
  }

  private toTfIdfVector(
    features: string[],
    vocabulary: Set<string>,
    idf: Map<string, number>,
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const feature of features) {
      counts.set(feature, (counts.get(feature) ?? 0) + 1);
    }

    const totalFeatureCount = features.length;
    return new Map(
      [...vocabulary].map((feature) => {
        const tf = (counts.get(feature) ?? 0) / totalFeatureCount;
        return [feature, tf * (idf.get(feature) ?? 0)] as const;
      }),
    );
  }

  private cosineSimilarity(
    left: Map<string, number>,
    right: Map<string, number>,
  ): number {
    let dotProduct = 0;
    let leftMagnitudeSquared = 0;
    let rightMagnitudeSquared = 0;

    for (const [feature, leftWeight] of left) {
      const rightWeight = right.get(feature) ?? 0;
      dotProduct += leftWeight * rightWeight;
      leftMagnitudeSquared += leftWeight ** 2;
      rightMagnitudeSquared += rightWeight ** 2;
    }

    const magnitude = Math.sqrt(leftMagnitudeSquared) * Math.sqrt(rightMagnitudeSquared);
    if (magnitude === 0) {
      return 0;
    }

    return this.clampScore(dotProduct / magnitude);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

}
