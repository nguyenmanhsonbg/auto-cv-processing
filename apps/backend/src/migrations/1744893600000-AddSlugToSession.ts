import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSlugToSession1744893600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Skip on fresh DB where tables don't exist yet (synchronize will create them with correct schema)
    const tableExists = await queryRunner.query(
      `SELECT to_regclass('public.interview_sessions') IS NOT NULL AS exists`,
    );
    if (!tableExists[0]?.exists) {
      return;
    }

    // 1. Add slug column (nullable initially for backfill)
    await queryRunner.query(`
      ALTER TABLE interview_sessions
      ADD COLUMN IF NOT EXISTS slug varchar
    `);

    // 2. Backfill slugs for existing sessions
    // Format: {candidate-name}-interview-{YYYY-MM-DD}
    // Use nanoid suffix to ensure uniqueness if multiple sessions on same day
    await queryRunner.query(`
      UPDATE interview_sessions s
      SET slug = CONCAT(
        LOWER(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              COALESCE(c.name, c.email, 'candidate'),
              '[^a-zA-Z0-9]+',
              '-',
              'g'
            ),
            '^-+|-+$',
            '',
            'g'
          )
        ),
        '-interview-',
        TO_CHAR(s."createdAt", 'YYYY-MM-DD'),
        '-',
        LEFT(s."accessToken", 6)
      )
      FROM candidates c
      WHERE s."candidateId" = c.id
        AND s.slug IS NULL
    `);

    // 3. Make slug unique and non-nullable
    await queryRunner.query(`
      ALTER TABLE interview_sessions
      ALTER COLUMN slug SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS interview_sessions_slug_key
      ON interview_sessions (slug)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(
      `SELECT to_regclass('public.interview_sessions') IS NOT NULL AS exists`,
    );
    if (!tableExists[0]?.exists) {
      return;
    }

    // Drop unique index
    await queryRunner.query(`
      DROP INDEX IF EXISTS interview_sessions_slug_key
    `);

    // Remove slug column
    await queryRunner.query(`
      ALTER TABLE interview_sessions
      DROP COLUMN IF EXISTS slug
    `);
  }
}
