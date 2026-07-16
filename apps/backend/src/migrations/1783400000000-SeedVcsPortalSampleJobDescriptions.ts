import { MigrationInterface, QueryRunner } from 'typeorm';

interface SampleJobDescriptionSeed {
  id: string;
  versionId: string;
  sourceJobId: string;
  sourceSlug: string;
  title: string;
  summary: string;
  description: string;
  overview: string;
  responsibilities: string;
  requirements: string;
  benefits: Record<string, string>;
  salary: string;
  annualLeaveDays: string;
  department: string;
  applicationDeadline: string;
  sourceCreatedAt: string;
  sourceModifiedAt: string;
  sourceCategoryName: string;
}

const SEED_USER_ID = '11111111-1111-4111-8111-111111111111';
const SEED_USER_EMAIL = 'vcs-portal-seed@example.local';
const SEED_USER_PASSWORD_HASH = '$2a$10$JVxnmhc2X2eSR/B/AmSYHOoFfTI8JjTu9pVTlnMdjR92FYKBoMn.y';

const SAMPLE_JOBS: SampleJobDescriptionSeed[] = [
  {
    id: '11111111-1111-4111-8111-111111111201',
    versionId: '11111111-1111-4111-8111-111111111301',
    sourceJobId: 'sample-vcs-portal-backend-engineer',
    sourceSlug: 'sample-backend-engineer-nodejs',
    title: 'Sample Backend Engineer (Node.js)',
    summary: 'Build and operate backend services for recruitment and internal workflow products.',
    description: 'The backend engineer owns service design, API implementation, database changes, and production support for internal platforms.',
    overview: 'Join the platform team to develop reliable NestJS services, PostgreSQL data models, and integrations used by HR and operations teams.',
    responsibilities: 'Design REST APIs, implement business workflows, review database changes, improve observability, and collaborate with frontend engineers.',
    requirements: 'Strong TypeScript and Node.js experience, practical PostgreSQL knowledge, API design skills, and familiarity with queue or event-driven workflows.',
    benefits: {
      insurance: 'Full social insurance and private healthcare package.',
      awards: 'Performance bonus based on project and company results.',
      office: 'Hybrid work setup with modern office equipment.',
      celebration: 'Company events, team activities, and annual trip.',
    },
    salary: 'Negotiable based on experience',
    annualLeaveDays: '12 days plus company holidays',
    department: 'Engineering',
    applicationDeadline: '2026-12-31',
    sourceCreatedAt: '2026-07-01T02:00:00.000Z',
    sourceModifiedAt: '2026-07-10T02:00:00.000Z',
    sourceCategoryName: 'Technology',
  },
  {
    id: '11111111-1111-4111-8111-111111111202',
    versionId: '11111111-1111-4111-8111-111111111302',
    sourceJobId: 'sample-vcs-portal-frontend-engineer',
    sourceSlug: 'sample-frontend-engineer-react',
    title: 'Sample Frontend Engineer (React)',
    summary: 'Create polished recruitment interfaces for interviewers, HR users, and candidates.',
    description: 'The frontend engineer builds responsive React features, integrates with backend APIs, and improves usability across recruitment workflows.',
    overview: 'Work on the React and Vite application that supports job descriptions, job postings, candidate applications, and interview operations.',
    responsibilities: 'Develop feature-complete pages, maintain shared UI patterns, handle API states, and verify flows across desktop and mobile browsers.',
    requirements: 'Strong React and TypeScript fundamentals, experience with form-heavy products, API integration skills, and attention to accessible UI details.',
    benefits: {
      insurance: 'Full social insurance and private healthcare package.',
      awards: 'Performance bonus based on project and company results.',
      office: 'Hybrid work setup with modern office equipment.',
      celebration: 'Company events, team activities, and annual trip.',
    },
    salary: 'Negotiable based on experience',
    annualLeaveDays: '12 days plus company holidays',
    department: 'Engineering',
    applicationDeadline: '2026-12-31',
    sourceCreatedAt: '2026-07-02T02:00:00.000Z',
    sourceModifiedAt: '2026-07-10T02:00:00.000Z',
    sourceCategoryName: 'Technology',
  },
  {
    id: '11111111-1111-4111-8111-111111111203',
    versionId: '11111111-1111-4111-8111-111111111303',
    sourceJobId: 'sample-vcs-portal-qa-engineer',
    sourceSlug: 'sample-qa-engineer-automation',
    title: 'Sample QA Engineer (Automation)',
    summary: 'Plan and execute quality strategy for recruitment workflows and public application forms.',
    description: 'The QA engineer validates critical user journeys, designs automation coverage, and coordinates release readiness for recruitment products.',
    overview: 'Help the team ship stable features by combining exploratory testing, API verification, browser automation, and clear defect reporting.',
    responsibilities: 'Create test plans, validate API and UI flows, maintain regression checks, document defects, and work with engineers on root-cause analysis.',
    requirements: 'Experience with web application testing, API clients, browser automation, SQL basics, and clear communication in cross-functional teams.',
    benefits: {
      insurance: 'Full social insurance and private healthcare package.',
      awards: 'Performance bonus based on project and company results.',
      office: 'Hybrid work setup with modern office equipment.',
      celebration: 'Company events, team activities, and annual trip.',
    },
    salary: 'Negotiable based on experience',
    annualLeaveDays: '12 days plus company holidays',
    department: 'Quality Engineering',
    applicationDeadline: '2026-12-31',
    sourceCreatedAt: '2026-07-03T02:00:00.000Z',
    sourceModifiedAt: '2026-07-10T02:00:00.000Z',
    sourceCategoryName: 'Technology',
  },
];

export class SeedVcsPortalSampleJobDescriptions1783400000000 implements MigrationInterface {
  name = 'SeedVcsPortalSampleJobDescriptions1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, [
      'users',
      'job_descriptions',
      'job_description_versions',
      'job_source_categories',
      'job_description_source_categories',
    ]);

    const seedUserId = await this.ensureSeedUser(queryRunner);

    for (const job of SAMPLE_JOBS) {
      await this.insertJobDescription(queryRunner, job, seedUserId);
      await this.linkSourceCategory(queryRunner, job);
      await this.insertVersionSnapshot(queryRunner, job);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const sourceJobIds = SAMPLE_JOBS.map((job) => job.sourceJobId);
    const jobDescriptionIds = SAMPLE_JOBS.map((job) => job.id);
    const versionIds = SAMPLE_JOBS.map((job) => job.versionId);

    await queryRunner.query(
      `
        DELETE FROM "job_description_versions" version
        USING "job_descriptions" jd
        WHERE version."job_description_id" = jd."id"
          AND version."id" = ANY($1::uuid[])
          AND jd."id" = ANY($2::uuid[])
          AND jd."source_system" = 'VCS_PORTAL'
          AND jd."source_job_id" = ANY($3::text[])
          AND jd."source_payload" @> '{"sample": true}'::jsonb
          AND NOT EXISTS (
            SELECT 1 FROM "job_postings" posting
            WHERE posting."job_description_version_id" = version."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "applications" application
            WHERE application."job_description_version_id" = version."id"
          )
      `,
      [versionIds, jobDescriptionIds, sourceJobIds],
    );

    await queryRunner.query(
      `
        DELETE FROM "job_description_source_categories" link
        USING "job_descriptions" jd
        WHERE link."job_description_id" = jd."id"
          AND jd."id" = ANY($1::uuid[])
          AND jd."source_system" = 'VCS_PORTAL'
          AND jd."source_job_id" = ANY($2::text[])
          AND jd."source_payload" @> '{"sample": true}'::jsonb
      `,
      [jobDescriptionIds, sourceJobIds],
    );

    await queryRunner.query(
      `
        DELETE FROM "job_descriptions" jd
        WHERE jd."id" = ANY($1::uuid[])
          AND jd."source_system" = 'VCS_PORTAL'
          AND jd."source_job_id" = ANY($2::text[])
          AND jd."source_payload" @> '{"sample": true}'::jsonb
          AND NOT EXISTS (
            SELECT 1 FROM "job_description_versions" version
            WHERE version."job_description_id" = jd."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "job_postings" posting
            WHERE posting."job_description_id" = jd."id"
          )
      `,
      [jobDescriptionIds, sourceJobIds],
    );

    await queryRunner.query(
      `
        DELETE FROM "users" seed_user
        WHERE seed_user."id" = $1
          AND seed_user."email" = $2
          AND NOT EXISTS (
            SELECT 1 FROM "job_descriptions" jd
            WHERE jd."created_by_id" = seed_user."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "job_description_versions" version
            WHERE version."created_by_id" = seed_user."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "job_postings" posting
            WHERE posting."created_by_id" = seed_user."id"
          )
          AND NOT EXISTS (
            SELECT 1 FROM "question_sets" question_set
            WHERE question_set."created_by_id" = seed_user."id"
          )
      `,
      [SEED_USER_ID, SEED_USER_EMAIL],
    );
  }

  private async ensureSeedUser(queryRunner: QueryRunner): Promise<string> {
    await queryRunner.query(
      `
        INSERT INTO "users" ("id", "email", "name", "password", "role", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, now(), now())
        ON CONFLICT DO NOTHING
      `,
      [
        SEED_USER_ID,
        SEED_USER_EMAIL,
        'VCS Portal Sample Seeder',
        SEED_USER_PASSWORD_HASH,
        'INTERVIEWER',
      ],
    );

    const rows = await queryRunner.query(
      `
        SELECT "id"
        FROM "users"
        WHERE "email" = $1
        LIMIT 1
      `,
      [SEED_USER_EMAIL],
    );
    const seedUserId = rows[0]?.id;
    if (typeof seedUserId !== 'string') {
      throw new Error('Cannot find or create VCS Portal sample seed user.');
    }

    return seedUserId;
  }

  private async insertJobDescription(
    queryRunner: QueryRunner,
    job: SampleJobDescriptionSeed,
    seedUserId: string,
  ) {
    const sourcePayload = this.buildSourcePayload(job);
    const sourceContentHash = `${job.sourceJobId}:v1`;

    await queryRunner.query(
      `
        INSERT INTO "job_descriptions" (
          "id",
          "title",
          "position_id",
          "level_id",
          "description",
          "summary",
          "overview",
          "responsibilities",
          "requirements",
          "benefits",
          "salary",
          "annual_leave_days",
          "department",
          "application_deadline",
          "source_system",
          "source_job_id",
          "source_slug",
          "source_url",
          "source_department",
          "source_created_at",
          "source_modified_at",
          "source_deadline_at",
          "source_snapshot_hash",
          "source_snapshot",
          "source_last_synced_at",
          "source_payload",
          "source_content_hash",
          "last_synced_at",
          "status",
          "created_by_id",
          "created_at",
          "updated_at"
        )
        VALUES (
          $1,
          $2,
          NULL,
          NULL,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb,
          $9,
          $10,
          $11,
          $12::date,
          'VCS_PORTAL',
          $13,
          $14,
          NULL,
          $15,
          $16::timestamptz,
          $17::timestamptz,
          $18::timestamp,
          $19,
          $20::jsonb,
          now(),
          $20::jsonb,
          $19,
          now(),
          'ACTIVE',
          $21,
          now(),
          now()
        )
        ON CONFLICT DO NOTHING
      `,
      [
        job.id,
        job.title,
        job.description,
        job.summary,
        job.overview,
        job.responsibilities,
        job.requirements,
        JSON.stringify(job.benefits),
        job.salary,
        job.annualLeaveDays,
        job.department,
        job.applicationDeadline,
        job.sourceJobId,
        job.sourceSlug,
        job.department,
        job.sourceCreatedAt,
        job.sourceModifiedAt,
        `${job.applicationDeadline} 00:00:00`,
        sourceContentHash,
        JSON.stringify(sourcePayload),
        seedUserId,
      ],
    );
  }

  private async linkSourceCategory(
    queryRunner: QueryRunner,
    job: SampleJobDescriptionSeed,
  ) {
    await queryRunner.query(
      `
        INSERT INTO "job_description_source_categories" (
          "job_description_id",
          "source_category_id"
        )
        SELECT jd."id", category."id"
        FROM "job_descriptions" jd
        JOIN "job_source_categories" category
          ON category."source_system" = 'VCS_PORTAL'
          AND category."name" = $1
        WHERE jd."id" = $2
          AND jd."source_system" = 'VCS_PORTAL'
          AND jd."source_job_id" = $3
          AND jd."source_payload" @> '{"sample": true}'::jsonb
        ON CONFLICT DO NOTHING
      `,
      [job.sourceCategoryName, job.id, job.sourceJobId],
    );
  }

  private async insertVersionSnapshot(
    queryRunner: QueryRunner,
    job: SampleJobDescriptionSeed,
  ) {
    await queryRunner.query(
      `
        INSERT INTO "job_description_versions" (
          "id",
          "job_description_id",
          "version_no",
          "snapshot",
          "status",
          "created_by_id",
          "created_at"
        )
        SELECT
          $1,
          jd."id",
          1,
          jsonb_build_object(
            'schemaVersion', 2,
            'snapshottedAt', now(),
            'jobDescription', jsonb_build_object(
              'id', jd."id",
              'title', jd."title",
              'positionId', jd."position_id",
              'levelId', jd."level_id",
              'description', jd."description",
              'overview', jd."overview",
              'responsibilities', jd."responsibilities",
              'summary', jd."summary",
              'requirements', jd."requirements",
              'benefits', jd."benefits",
              'salary', jd."salary",
              'annualLeaveDays', jd."annual_leave_days",
              'department', jd."department",
              'applicationDeadline', jd."application_deadline",
              'status', jd."status",
              'createdById', jd."created_by_id",
              'createdAt', jd."created_at",
              'updatedAt', jd."updated_at"
            ),
            'position', NULL,
            'level', NULL,
            'createdBy', jsonb_build_object(
              'id', seed_user."id",
              'email', seed_user."email",
              'name', seed_user."name",
              'role', seed_user."role"
            )
          ),
          'ACTIVE',
          jd."created_by_id",
          now()
        FROM "job_descriptions" jd
        JOIN "users" seed_user ON seed_user."id" = jd."created_by_id"
        WHERE jd."source_system" = 'VCS_PORTAL'
          AND jd."source_job_id" = $2
          AND jd."id" = $3
          AND jd."source_payload" @> '{"sample": true}'::jsonb
          AND NOT EXISTS (
            SELECT 1 FROM "job_description_versions" existing_version
            WHERE existing_version."job_description_id" = jd."id"
              AND existing_version."version_no" = 1
          )
        ON CONFLICT DO NOTHING
      `,
      [job.versionId, job.sourceJobId, job.id],
    );
  }

  private buildSourcePayload(job: SampleJobDescriptionSeed) {
    return {
      id: job.sourceJobId,
      slug: job.sourceSlug,
      title: { rendered: job.title },
      excerpt: { rendered: job.summary },
      content: { rendered: job.description },
      date: job.sourceCreatedAt,
      modified: job.sourceModifiedAt,
      acf: {
        overview: job.overview,
        responsibilities: job.responsibilities,
        qualifications: job.requirements,
        salary: job.salary,
        annual_leave_days: job.annualLeaveDays,
        department: job.department,
        end_date: this.toPortalDate(job.applicationDeadline),
        insurance: job.benefits.insurance,
        awards: job.benefits.awards,
        office: job.benefits.office,
        celebration: job.benefits.celebration,
      },
      categories: [
        {
          name: job.sourceCategoryName,
          slug: job.sourceCategoryName.toLowerCase(),
        },
      ],
      questions: [],
      sample: true,
    };
  }

  private toPortalDate(value: string) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  private async assertRequiredTables(queryRunner: QueryRunner, tableNames: string[]): Promise<void> {
    const rows = await queryRunner.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
      `,
      [tableNames],
    );
    const existing = new Set(rows.map((row: { table_name: string }) => row.table_name));
    const missing = tableNames.filter((tableName) => !existing.has(tableName));

    if (missing.length > 0) {
      throw new Error(
        `Cannot seed VCS Portal sample job descriptions because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }
}
