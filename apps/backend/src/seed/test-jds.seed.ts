import * as bcrypt from 'bcryptjs';
import { UserRole } from '@interview-assistant/shared';
import { JobDescriptionStatus } from '../recruitment-common';
import dataSource from '../config/typeorm.config';
import { UserEntity } from '../auth/entities/user.entity';
import { JobDescriptionEntity } from '../job-descriptions/entities/job-description.entity';

const TEST_USER_EMAIL = 'hr.test@example.com';
const TEST_USER_NAME = 'HR Test';
const TEST_USER_PASSWORD = 'Test@123456';
const TEST_JD_DEADLINE = '2026-07-31';
const DATABASE_RETRY_ATTEMPTS = 30;
const DATABASE_RETRY_DELAY_MS = 2000;
const TEST_BENEFITS_RAW_TEXT = `- Mức lương cạnh tranh, xứng đáng với năng lực, xét lương 1 lần/ năm
- Đầy đủ các chính sách và chế độ như: BHYT, BHXH, BHTN,.. theo đúng quy định của Bộ Luật Lao động và của Công ty;
- Hưởng đầy đủ các chế độ nghỉ mát, thưởng lễ, Tết định kỳ hàng năm.
- Hưởng đầy đủ các chế độ thăm hỏi sức khỏe cho bản thân và người nhà theo Chính sách đãi ngộ của Công ty;`;

interface TestJobDescriptionFixture {
  id: string;
  title: string;
  description: string[];
  requirements: string[];
}

const TEST_JOB_DESCRIPTIONS: TestJobDescriptionFixture[] = [
  {
    id: '8b8194e3-0452-4b45-be32-e2f5fb19b571',
    title: 'Cộng tác viên Tuyển dụng',
    description: [
      'Thu hút, tìm kiếm ứng viên tiềm năng qua các kênh Facebook, zalo, instagram...',
      'Liên hệ, sắp xếp lịch phỏng vấn, thông báo kết quả tuyển dụng',
      'Tham gia tổ chức các chương trình ngày hội việc làm',
      'Tham gia vào công tác tuyển dụng theo sự phân công của trưởng bộ phận',
    ],
    requirements: [
      'Có laptop cá nhân',
      'Là sinh viên chuyên ngành nhân sự, nhân lực...',
      'Máu lửa, chăm chỉ, nhiệt tình, ham học hỏi',
      'Yêu thích công việc tuyển dụng',
    ],
  },
  {
    id: 'fd35812c-81ab-466c-95a0-c6509eb4d311',
    title: 'ReactJS',
    description: [
      'Phát triển hệ thống ERP của công ty gồm các phân hệ: Dự báo /Phê duyệt đặt hàng, Mua hàng (quốc tế và trong nước), Kho hàng, Bán hàng, Giao hàng, Bảo hành, Hành chính – Nhân sự, Kế toán,…;',
      'Sử dụng công nghệ MERN Stack: React NodeJS;',
      'Triển khai trên kiến trúc Micro-services',
    ],
    requirements: [
      'Nam/Nữ; Tốt nghiệp các trường Đại học chuyên ngành CNTT, Điện tử - Viễn thông hoặc các ngành liên quan',
      'Thành thạo một trong các ngôn ngữ lập trình: .NET, Python, C#, Java;',
      'Thành thạo một trong các hệ quản trị cơ sở dữ liệu quan hệ: PostgreSQL, SQL Server, Oracle, MySQL; có kinh nghiệm làm việc với cơ sở dữ liệu NoSQL là 1 lợi thế;',
      'Am hiểu kiến trúc Micro services, sử dụng thành thạo Docker / Docker Swarm / K8s là 1 lợi thế;',
    ],
  },
  {
    id: '3111cdb0-b5d2-45ff-9c83-471e643f85e0',
    title: 'Tester (Onsite)',
    description: [
      'Chịu trách nhiệm kiểm soát chất lượng phần mềm của Công ty trước khi phát hành',
      'Lập kế hoạch test, xây dựng test cases, thực hiện test, log bug và kiểm soát tiến độ xử lý',
      'Tiếp nhận feedback, bug report của khách hàng và đốc thúc đội dự án cùng xử lý',
    ],
    requirements: [
      'Tư duy test hướng nghiệp vụ, hướng người dùng',
      'Nắm rõ về các phương pháp và công cụ test',
      'Hiểu rõ quy trình test sản phẩm phần mềm',
      'Kỹ năng xây dựng test cases tốt, mô tả bug rõ ràng, dễ hiểu',
      'Có khả năng làm việc độc lập',
      'Giao tiếp tốt, tư duy logic tốt, trách nhiệm cao với công việc',
    ],
  },
];

export async function seedTestJobDescriptions() {
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production') {
    console.log('Skipping test JD seed because NODE_ENV=production.');
    return;
  }

  let initializedBySeed = false;

  try {
    if (!dataSource.isInitialized) {
      await initializeDataSourceWithRetry();
      initializedBySeed = true;
    }

    const userRepository = dataSource.getRepository(UserEntity);
    let user = await userRepository.findOne({ where: { email: TEST_USER_EMAIL } });
    let userCreated = false;

    if (!user) {
      user = await userRepository.save(userRepository.create({
        email: TEST_USER_EMAIL,
        name: TEST_USER_NAME,
        password: await bcrypt.hash(TEST_USER_PASSWORD, 10),
        role: UserRole.HR,
      }));
      userCreated = true;
    }

    const jobDescriptionRepository = dataSource.getRepository(JobDescriptionEntity);
    let createdCount = 0;
    let skippedCount = 0;

    for (const fixture of TEST_JOB_DESCRIPTIONS) {
      const existing = await jobDescriptionRepository.findOne({ where: { id: fixture.id } });
      if (existing) {
        skippedCount += 1;
        continue;
      }

      const description = fixture.description.join('\n');
      const requirements = fixture.requirements.join('\n');

      await jobDescriptionRepository.save(jobDescriptionRepository.create({
        id: fixture.id,
        title: fixture.title,
        positionId: null,
        levelId: null,
        description,
        summary: description,
        overview: description,
        responsibilities: description,
        requirements,
        benefits: { rawText: TEST_BENEFITS_RAW_TEXT },
        salary: null,
        annualLeaveDays: null,
        department: null,
        applicationDeadline: TEST_JD_DEADLINE,
        sourceSystem: null,
        sourceJobId: null,
        sourceSlug: null,
        sourceUrl: null,
        sourceDepartment: null,
        sourceCreatedAt: null,
        sourceModifiedAt: null,
        sourceDeadlineAt: null,
        sourceSnapshotHash: null,
        sourceSnapshot: null,
        sourceLastSyncedAt: null,
        sourcePayload: null,
        sourceContentHash: null,
        lastSyncedAt: null,
        status: JobDescriptionStatus.ACTIVE,
        createdById: user.id,
      }));
      createdCount += 1;
    }

    console.log(
      `Test JD seed complete: user=${userCreated ? 'created' : 'existing'}, `
      + `created=${createdCount}, skipped=${skippedCount}, total=${TEST_JOB_DESCRIPTIONS.length}.`,
    );
  } finally {
    if (initializedBySeed) await dataSource.destroy();
  }
}

async function initializeDataSourceWithRetry() {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DATABASE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      await dataSource.initialize();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === DATABASE_RETRY_ATTEMPTS) break;

      console.warn(
        `Database is not ready yet (attempt ${attempt}/${DATABASE_RETRY_ATTEMPTS}); `
        + `retrying in ${DATABASE_RETRY_DELAY_MS}ms.`,
      );
      await new Promise((resolve) => setTimeout(resolve, DATABASE_RETRY_DELAY_MS));
    }
  }

  throw lastError;
}

if (require.main === module) {
  seedTestJobDescriptions().catch((error: unknown) => {
    console.error('Test JD seed failed:', error);
    process.exitCode = 1;
  });
}
