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

  it('rejects empty comparison text instead of producing a misleading score', () => {
    expect(() => service.compare('', 'Python SQL')).toThrow('CV text is empty');
  });
});
