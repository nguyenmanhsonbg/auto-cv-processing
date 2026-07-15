import { AiService } from './ai.service';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

describe('AiService Recruitment Phase 1 screening flow', () => {
  function createService() {
    const service = new AiService(
      { get: jest.fn() } as any,
      { findByKey: jest.fn() } as any,
      { findByKey: jest.fn() } as any,
    );

    jest.spyOn(service as any, 'getSystemPrompt').mockImplementation(async (key: string) => ({
      systemPrompt: `system:${key}`,
      model: `model:${key}`,
    }));

    return service as any;
  }

  it('runs ai_screening with the enriched JD/profile, optional anomaly result, optional form answers, and metadata', async () => {
    const service = createService();
    const screeningResult = {
      finalScore: 82,
      recommendation: 'MATCH',
      summary: 'Ung vien phu hop voi JD.',
      strengths: [{ title: 'Java', evidence: 'Co du an Java', confidence: 'HIGH' }],
      gaps: [],
      risks: [],
      status: 'DONE',
    };
    const callGemini = jest
      .spyOn(service, 'callGemini')
      .mockResolvedValue(JSON.stringify(screeningResult));

    const result = await service.runRecruitmentPhase1AiScreening({
      enrichedJobDescription: { jobInfo: { title: 'Backend Engineer' } },
      enrichedProfile: { parsedProfile: { name: 'Nguyen Van A' }, evaluation: {} },
      formAnswers: [{ question: 'Quy mo DB?', answer: 'Hang chuc trieu records' }],
      anomalyResult: { overallRiskScore: 0, riskLevel: 'minimal', anomalies: [], summary: 'Clean' },
      applicationMetadata: { applicationId: 'app-1', status: 'FORM_SUBMITTED' },
    });

    expect(service.getSystemPrompt.mock.calls[0][0]).toBe('ai_screening');
    expect(callGemini).toHaveBeenCalledWith(
      'system:ai_screening',
      expect.stringContaining('"enrichedJobDescription"'),
      'gemini-3.1-flash-lite',
    );
    expect(callGemini.mock.calls[0][1]).toContain('"formAnswers"');
    expect(callGemini.mock.calls[0][1]).toContain('"anomalyResult"');
    expect(result).toEqual(screeningResult);
  });

  it('runs final_screening_recommendation with the ai_screening output included in the prompt input', async () => {
    const service = createService();
    const recommendation = {
      decisionHint: 'APPROVE',
      confidence: 'HIGH',
      summary: 'Nen moi HR review de phe duyet.',
      topReasons: ['Dap ung must-have', 'Khong co risk cao'],
      openQuestions: [],
      doNotExposeToCandidate: true,
    };
    const callGemini = jest
      .spyOn(service, 'callGemini')
      .mockResolvedValue(JSON.stringify(recommendation));

    const result = await service.runFinalScreeningRecommendation({
      enrichedJobDescription: { jobInfo: { title: 'Backend Engineer' } },
      enrichedProfile: { parsedProfile: { name: 'Nguyen Van A' }, evaluation: {} },
      formAnswers: [],
      anomalyResult: null,
      applicationMetadata: { applicationId: 'app-1', status: 'AI_SCREENING_DONE' },
      aiScreening: { finalScore: 82, recommendation: 'MATCH', status: 'DONE' },
    });

    expect(service.getSystemPrompt.mock.calls[0][0]).toBe('final_screening_recommendation');
    expect(callGemini).toHaveBeenCalledWith(
      'system:final_screening_recommendation',
      expect.stringContaining('"aiScreening"'),
      'gemini-3.1-flash-lite',
    );
    expect(callGemini.mock.calls[0][1]).toContain('"MATCH"');
    expect(result).toEqual(recommendation);
  });

  it('falls back to the next Gemini model when the current model is overloaded', async () => {
    const service = createService();
    (service as any).config.get.mockImplementation((key: string) => (
      key === 'GEMINI_CV_PARSE_MODELS'
        ? 'gemini-3.1-flash-lite,gemini-2.5-flash'
        : undefined
    ));
    const screeningResult = {
      finalScore: 72,
      recommendation: 'MATCH',
      summary: 'Phu hop.',
      strengths: [],
      gaps: [],
      risks: [],
      status: 'DONE',
    };
    const callGemini = jest
      .spyOn(service, 'callGemini')
      .mockRejectedValueOnce(new Error('Gemini API error (HTTP 503): overloaded'))
      .mockResolvedValueOnce(JSON.stringify(screeningResult));

    const result = await service.runRecruitmentPhase1AiScreening({
      enrichedJobDescription: { jobInfo: { title: 'Backend Engineer' } },
      enrichedProfile: { parsedProfile: { name: 'Nguyen Van A' }, evaluation: {} },
    });

    expect(callGemini.mock.calls.map((call: any[]) => call[2])).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
    ]);
    expect(result).toEqual(screeningResult);
  });

  it('enriches a job description with the enrich_job_description prompt', async () => {
    const service = createService();
    const enrichedJobDescription = {
      jobInfo: {
        title: 'Backend Engineer',
        roleCategory: 'BACKEND',
        department: null,
      },
      generalCriteria: {
        minYearsExperience: 2,
        educationRequirement: null,
        softSkills: ['Teamwork'],
      },
      roleSpecificCriteria: {
        coreMustHaveSkills: ['Java', 'Spring Boot'],
        advancedNiceToHaveSkills: ['Kafka'],
        expectedTechnicalChallenges: ['High-throughput APIs'],
      },
      redFlags: ['No experience in Java'],
    };
    const callGemini = jest
      .spyOn(service, 'callGemini')
      .mockResolvedValue(JSON.stringify(enrichedJobDescription));

    const result = await service.enrichJobDescription({
      jobDescription: {
        title: 'Backend Engineer',
        requirements: { mustHave: ['Java', 'Spring Boot'] },
      },
    });

    expect(service.getSystemPrompt.mock.calls[0][0]).toBe('enrich_job_description');
    expect(callGemini).toHaveBeenCalledWith(
      'system:enrich_job_description',
      expect.stringContaining('"Backend Engineer"'),
      'gemini-3.1-flash-lite',
    );
    expect(result).toEqual(enrichedJobDescription);
  });

  it('attaches normalized VCS signals to an enriched profile', async () => {
    const service = createService();
    const callGemini = jest.spyOn(service, 'callGemini').mockResolvedValue(JSON.stringify({
      parsedProfile: {
        education: 'HUST - Computer Engineering',
        companies: [{ name: 'Product Labs', type: 'PRODUCT', tenureYears: 3 }],
        workExperience: [{ company: 'Product Labs', role: 'Senior Backend Engineer' }],
      },
      evaluation: {
        generalCriteria: {
          education: {
            score: 9,
            isTopVNUniversity: true,
            note: 'Tốt nghiệp trường đại học thuộc nhóm ưu tiên.',
          },
          workHistory: {
            score: 8,
            hasProductCompanyExp: true,
            note: 'Có kinh nghiệm tại công ty phát triển sản phẩm.',
          },
          seniority: {
            score: 8,
            note: 'Có kinh nghiệm ở vai trò Senior.',
          },
        },
        roleSpecificCriteria: {
          advancedSkills: {
            score: 8,
            matched: ['Kafka'],
            note: 'Có bằng chứng sử dụng Kafka trong dự án.',
          },
          technicalChallenges: {
            score: 7,
            evidenceFound: ['High-throughput APIs'],
            note: 'Đã xử lý API lưu lượng cao.',
          },
        },
      },
    }));

    const result = await service.enrichParsedProfile('CV text', { name: 'Candidate' });

    expect(callGemini).toHaveBeenCalledWith(
      'system:enrich_profile',
      expect.stringContaining('CV text'),
      'gemini-3.1-flash-lite',
    );
    expect(result?.vcsSignals).toEqual(expect.objectContaining({
      university: expect.objectContaining({ ok: true }),
      companyType: expect.objectContaining({ ok: true, companies: ['Product Labs'] }),
      advancedSkills: expect.objectContaining({ ok: true, items: [{ skill: 'Kafka', evidence: 'Có bằng chứng sử dụng Kafka trong dự án.' }] }),
      technicalChallenges: expect.objectContaining({ ok: true }),
      seniorRoles: expect.objectContaining({ ok: true }),
    }));
  });

  it('analyzes files directly with Gemini inline data', async () => {
    const service = createService();
    const tmpDir = join(process.cwd(), 'tmp-test-files');
    mkdirSync(tmpDir, { recursive: true });
    const filePath = join(tmpDir, 'cv.pdf');
    writeFileSync(filePath, Buffer.from('%PDF test content'));
    const parsedProfile = {
      name: 'Tin Le',
      skills: ['Java'],
      totalYearsExperience: 3,
    };
    const callGeminiWithFileFallback = jest
      .spyOn(service, 'callGeminiWithFileFallback')
      .mockResolvedValue(JSON.stringify(parsedProfile));

    try {
      const result = await service.analyzeFileDirectly(filePath, 'application/pdf');

      expect(service.getSystemPrompt.mock.calls[0][0]).toBe('enrich_profile');
      expect(callGeminiWithFileFallback).toHaveBeenCalledWith(
        'system:enrich_profile',
        expect.stringContaining('Read and extract all CV/resume information'),
        expect.objectContaining({
          mimeType: 'application/pdf',
          dataBase64: Buffer.from('%PDF test content').toString('base64'),
        }),
      );
      expect(result).toEqual({
        ...parsedProfile,
        vcsSignals: expect.any(Object),
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('attaches normalized VCS signals to direct file analysis results', async () => {
    const service = createService();
    const tmpDir = join(process.cwd(), 'tmp-test-files');
    mkdirSync(tmpDir, { recursive: true });
    const filePath = join(tmpDir, 'cv-with-vcs-signals.pdf');
    writeFileSync(filePath, Buffer.from('%PDF test content'));
    const callGeminiWithFileFallback = jest
      .spyOn(service, 'callGeminiWithFileFallback')
      .mockResolvedValue(JSON.stringify({
        name: 'Tin Le',
        parsedProfile: { education: 'HUST' },
        evaluation: {
          generalCriteria: {
            education: { score: 9, isTopVNUniversity: true, note: 'Tốt nghiệp HUST.' },
          },
          roleSpecificCriteria: {
            technicalChallenges: {
              score: 8,
              evidenceFound: ['Distributed systems'],
              note: 'Đã triển khai.',
            },
          },
        },
      }));

    try {
      const result = await service.analyzeFileDirectly(filePath, 'application/pdf');

      expect(result?.vcsSignals).toEqual(expect.objectContaining({
        university: expect.objectContaining({ ok: true, name: 'HUST' }),
        technicalChallenges: expect.objectContaining({ ok: true }),
      }));
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
