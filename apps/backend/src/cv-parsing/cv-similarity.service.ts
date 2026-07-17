import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export const CV_SIMILARITY_THRESHOLD = 0.95;
export const CV_SIMILARITY_METHOD_VERSION = 'TFIDF_WORD_NGRAM_V1' as const;

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
}

@Injectable()
export class CvSimilarityService {
  normalizeForSimilarity(text: string, identity?: CvSimilarityIdentity): string {
    let normalized = (text ?? '').normalize('NFC').toLowerCase();

    normalized = normalized
      .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, ' ')
      .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
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

  buildFeatures(normalizedText: string): string[] {
    const tokens = this.tokenize(normalizedText.normalize('NFC').toLowerCase());
    const features: string[] = [...tokens];

    for (let index = 0; index < tokens.length - 1; index += 1) {
      features.push(`${tokens[index]} ${tokens[index + 1]}`);
    }

    return features;
  }

  compare(
    oldText: string,
    newText: string,
    identity?: CvSimilarityIdentity,
  ): CvSimilarityResult {
    const oldNormalizedText = this.normalizeForSimilarity(oldText, identity);
    const newNormalizedText = this.normalizeForSimilarity(newText, identity);

    if (!oldNormalizedText || !newNormalizedText) {
      throw new Error('CV text is empty');
    }

    const oldFeatures = this.buildFeatures(oldNormalizedText);
    const newFeatures = this.buildFeatures(newNormalizedText);
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
    const score = this.cosineSimilarity(oldVector, newVector);
    const sharedFeatureCount = [...new Set(oldFeatures)].filter((feature) =>
      new Set(newFeatures).has(feature),
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
    };
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

    return Math.min(1, Math.max(0, dotProduct / magnitude));
  }

  private hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
