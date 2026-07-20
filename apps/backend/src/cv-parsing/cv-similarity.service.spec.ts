import { CvSimilarityService } from './cv-similarity.service';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const beforeEach: any;

describe('CvSimilarityService', () => {
  let service: CvSimilarityService;

  beforeEach(() => {
    service = new CvSimilarityService();
  });

  it('returns 1 for text equal after normalization', () => {
    const result = service.compare(
      'Name\nPython   SQL',
      'name Python SQL',
      { name: 'Name' },
    );

    expect(result.score).toBeCloseTo(1, 6);
    expect(result.isDuplicate).toBe(true);
  });

  it('removes identity values before vectorization', () => {
    const result = service.compare(
      'Alice alice@example.com Python SQL',
      'Alice alice@example.com Python SQL',
      { name: 'Alice', email: 'alice@example.com' },
    );

    expect(result.score).toBeCloseTo(1, 6);
  });

  it('removes the extracted CV contact header from the similarity text', () => {
    const normalized = service.normalizeForSimilarity(
      'Le Quang TinEmail : luntanson@gmail.com\n'
      + 'Software EngineerGitHub : github.com/TinBip28\n'
      + 'Phone : +84 337314321\n'
      + 'Education\n'
      + 'VNU University of Science\n'
      + 'Work Experience\n'
      + 'Built RESTful APIs with Java and MongoDB.',
      { name: 'Tín Lê', email: 'luntanson@gmail.com', phone: '0337314321' },
    );

    expect(normalized).toContain('education vnu university of science');
    expect(normalized).not.toContain('le quang tin');
    expect(normalized).not.toContain('email');
    expect(normalized).not.toContain('luntanson');
    expect(normalized).not.toContain('github');
    expect(normalized).not.toContain('tinbip28');
    expect(normalized).not.toContain('phone');
    expect(normalized).not.toContain('0337314321');
  });

  it('returns a lower score when the experience content changes', () => {
    const result = service.compare(
      'built ETL pipelines with Python and SQL',
      'managed recruitment operations with Greenhouse and Excel',
    );

    expect(result.score).toBeLessThan(0.95);
    expect(result.isDuplicate).toBe(false);
  });

  it('includes unigrams and bigrams in the feature space', () => {
    const features = service.buildFeatures('built ETL pipelines');

    expect(features).toEqual(expect.arrayContaining([
      'built',
      'etl',
      'pipelines',
      'built etl',
      'etl pipelines',
    ]));
  });

  it('includes character n-grams to tolerate punctuation changes', () => {
    const features = service.buildCharFeatures('reactjs');

    expect(features).toEqual(expect.arrayContaining([
      'rea',
      'eac',
      'act',
      'ctj',
      'tjs',
    ]));
  });

  it('uses section-aware scoring when content moves between sections', () => {
    const result = service.compare(
      'Education\nJava SQL\nSkills\nPython',
      'Education\nPython\nSkills\nJava SQL',
    );

    expect(result.wordScore).toBeGreaterThan(result.sectionScore);
    expect(result.sectionScore).toBeLessThan(0.95);
    expect(result.score).toBeLessThan(result.wordScore);
  });

  it('is invariant to reordering complete CV sections', () => {
    const oldText = [
      'Education',
      'VNU University of Science',
      'Work Experience',
      'Built ETL pipelines with Java and SQL.',
      'Personal Projects',
      'Built a Kafka ticket platform.',
      'Technical Skills',
      'Java SQL Kafka',
    ].join('\n');
    const reorderedText = [
      'Education',
      'VNU University of Science',
      'Technical Skills',
      'Java SQL Kafka',
      'Work Experience',
      'Built ETL pipelines with Java and SQL.',
      'Personal Projects',
      'Built a Kafka ticket platform.',
    ].join('\n');

    expect(service.normalizeForSimilarity(oldText)).toBe(
      service.normalizeForSimilarity(reorderedText),
    );

    const result = service.compare(oldText, reorderedText);
    expect(result.score).toBeGreaterThanOrEqual(0.95);
  });

  it('identifies the hybrid word, character, and section method', () => {
    const result = service.compare('Education\nJava SQL', 'Education\nJava SQL');

    expect(result.methodVersion).toBe('TFIDF_WORD_CHAR_SECTION_V3');
  });

  it('rejects empty comparison text instead of producing a misleading score', () => {
    expect(() => service.compare('', 'Python SQL')).toThrow('CV text is empty');
  });

});
