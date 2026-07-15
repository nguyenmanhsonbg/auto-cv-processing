import { VcsSignals } from '@interview-assistant/shared';
import { normalizeVcsSignals } from './vcs-signals.mapper';

declare const describe: any;
declare const expect: any;
declare const it: any;

describe('normalizeVcsSignals', () => {
  it('preserves explicit VCS signals from the AI response', () => {
    const input = {
      parsedProfile: {
        vcsSignals: {
          university: {
            ok: true,
            name: 'Đại học Bách Khoa Hà Nội',
            topMatch: 'HUST',
            evidence: 'Tốt nghiệp HUST ngành Kỹ thuật máy tính.',
          },
          companyType: {
            ok: true,
            companies: ['Product Labs'],
            evidence: 'Đã làm sản phẩm nội bộ tại Product Labs.',
          },
          advancedSkills: {
            ok: true,
            items: [{ skill: 'Kafka', evidence: 'Vận hành Kafka cho hệ thống production.' }],
            evidence: 'Có bằng chứng về kỹ năng nâng cao.',
          },
          technicalChallenges: {
            ok: true,
            items: [{
              challenge: 'Distributed systems',
              projectSize: '20 services',
              evidence: 'Thiết kế và vận hành 20 services.',
            }],
            evidence: 'Có kinh nghiệm xử lý bài toán phân tán.',
          },
          seniorRoles: {
            ok: true,
            items: [{
              role: 'Technical Lead',
              projectSize: '8 engineers',
              evidence: 'Dẫn dắt nhóm 8 kỹ sư.',
            }],
            evidence: 'Có vai trò dẫn dắt kỹ thuật.',
          },
        } satisfies VcsSignals,
      },
    };

    expect(normalizeVcsSignals(input)).toEqual(input.parsedProfile.vcsSignals);
  });

  it('maps legacy evaluation fields and profile evidence into VCS signals', () => {
    const input = {
      parsedProfile: {
        education: 'HUST - Computer Engineering',
        companies: [
          { name: 'Product Labs', type: 'PRODUCT', tenureYears: 3 },
          { name: 'Outsource Co', type: 'OUTSOURCE', tenureYears: 1 },
        ],
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
            note: 'Có kinh nghiệm ở vai trò Senior và phạm vi tự chủ tốt.',
          },
        },
        roleSpecificCriteria: {
          advancedSkills: {
            score: 8,
            matched: ['Kafka', 'Redis'],
            note: 'Có bằng chứng sử dụng Kafka và Redis trong dự án.',
          },
          technicalChallenges: {
            score: 7,
            evidenceFound: ['High-throughput APIs'],
            note: 'Đã xử lý API lưu lượng cao.',
          },
        },
      },
    };

    expect(normalizeVcsSignals(input)).toEqual({
      university: {
        ok: true,
        name: 'HUST - Computer Engineering',
        evidence: 'Tốt nghiệp trường đại học thuộc nhóm ưu tiên.',
      },
      companyType: {
        ok: true,
        companies: ['Product Labs'],
        evidence: 'Có kinh nghiệm tại công ty phát triển sản phẩm.',
      },
      advancedSkills: {
        ok: true,
        items: [
          { skill: 'Kafka', evidence: 'Có bằng chứng sử dụng Kafka và Redis trong dự án.' },
          { skill: 'Redis', evidence: 'Có bằng chứng sử dụng Kafka và Redis trong dự án.' },
        ],
        evidence: 'Có bằng chứng sử dụng Kafka và Redis trong dự án.',
      },
      technicalChallenges: {
        ok: true,
        items: [{
          challenge: 'High-throughput APIs',
          evidence: 'Đã xử lý API lưu lượng cao.',
        }],
        evidence: 'Đã xử lý API lưu lượng cao.',
      },
      seniorRoles: {
        ok: true,
        items: [{
          role: 'Senior Backend Engineer',
          evidence: 'Có kinh nghiệm ở vai trò Senior và phạm vi tự chủ tốt.',
        }],
        evidence: 'Có kinh nghiệm ở vai trò Senior và phạm vi tự chủ tốt.',
      },
    });
  });

  it('returns safe empty signals when optional AI fields are missing or malformed', () => {
    expect(normalizeVcsSignals({ vcsSignals: { advancedSkills: null } })).toEqual({
      university: { ok: false, evidence: '' },
      companyType: { ok: false, evidence: '' },
      advancedSkills: { ok: false, evidence: '' },
      technicalChallenges: { ok: false, evidence: '' },
      seniorRoles: { ok: false, evidence: '' },
    });
  });
});
