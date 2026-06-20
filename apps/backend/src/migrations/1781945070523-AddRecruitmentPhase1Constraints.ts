import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecruitmentPhase1Constraints1781945070523 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertNoDuplicateApplications(queryRunner);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_applications_candidate_job_posting"
      ON "applications" ("candidate_id", "job_posting_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_applications_candidate_job_posting"
    `);
  }

  private async assertNoDuplicateApplications(queryRunner: QueryRunner): Promise<void> {
    const duplicates: Array<{
      candidate_id: string;
      job_posting_id: string;
      duplicate_count: number;
    }> = await queryRunner.query(`
      SELECT
        "candidate_id",
        "job_posting_id",
        COUNT(*)::int AS "duplicate_count"
      FROM "applications"
      GROUP BY "candidate_id", "job_posting_id"
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (duplicates.length > 0) {
      const sample = duplicates
        .map(
          (row) =>
            `candidate_id=${row.candidate_id}, job_posting_id=${row.job_posting_id}, count=${row.duplicate_count}`,
        )
        .join('; ');

      throw new Error(
        `Cannot add UQ_applications_candidate_job_posting because duplicate applications exist: ${sample}`,
      );
    }
  }
}
