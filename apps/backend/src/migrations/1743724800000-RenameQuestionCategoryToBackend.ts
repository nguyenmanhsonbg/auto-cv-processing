import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameQuestionCategoryToBackend1743724800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Skip on fresh DB where tables don't exist yet (synchronize will create them with correct schema)
    const tableExists = await queryRunner.query(
      `SELECT to_regclass('public.questions') IS NOT NULL AS exists`,
    );
    if (!tableExists[0]?.exists) {
      return;
    }

    // 1. Change questions.category from enum to varchar
    await queryRunner.query(`
      ALTER TABLE questions
      ALTER COLUMN category TYPE varchar USING category::text
    `);

    // Drop the old PostgreSQL enum type (TypeORM creates it as questions_category_enum)
    await queryRunner.query(`
      DROP TYPE IF EXISTS questions_category_enum
    `);

    // 2. Rename category values in questions table
    await queryRunner.query(`
      UPDATE questions SET category = 'BACKEND_MUST'   WHERE category = 'TECHNICAL_MUST'
    `);
    await queryRunner.query(`
      UPDATE questions SET category = 'BACKEND_SHOULD' WHERE category = 'TECHNICAL_SHOULD'
    `);

    // 3. Rename rows in categories table
    await queryRunner.query(`
      UPDATE categories
      SET name = 'BACKEND_MUST', "displayName" = 'Backend (Must)'
      WHERE name = 'TECHNICAL_MUST'
    `);
    await queryRunner.query(`
      UPDATE categories
      SET name = 'BACKEND_SHOULD', "displayName" = 'Backend (Should)'
      WHERE name = 'TECHNICAL_SHOULD'
    `);

    // 4. Rename CATEGORY::Subcategory keys in interview_sessions.categoryRatings JSONB
    await queryRunner.query(`
      UPDATE interview_sessions
      SET "categoryRatings" = (
        SELECT jsonb_object_agg(
          regexp_replace(key, '^TECHNICAL_', 'BACKEND_'),
          value
        )
        FROM jsonb_each("categoryRatings")
      )
      WHERE "categoryRatings" IS NOT NULL
        AND "categoryRatings"::text LIKE '%TECHNICAL_%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert sessions JSONB keys
    await queryRunner.query(`
      UPDATE interview_sessions
      SET "categoryRatings" = (
        SELECT jsonb_object_agg(
          regexp_replace(key, '^BACKEND_', 'TECHNICAL_'),
          value
        )
        FROM jsonb_each("categoryRatings")
      )
      WHERE "categoryRatings" IS NOT NULL
        AND "categoryRatings"::text LIKE '%BACKEND_%'
    `);

    // Revert categories table
    await queryRunner.query(`
      UPDATE categories
      SET name = 'TECHNICAL_MUST', "displayName" = 'Technical (Must)'
      WHERE name = 'BACKEND_MUST'
    `);
    await queryRunner.query(`
      UPDATE categories
      SET name = 'TECHNICAL_SHOULD', "displayName" = 'Technical (Should)'
      WHERE name = 'BACKEND_SHOULD'
    `);

    // Revert questions category values
    await queryRunner.query(`
      UPDATE questions SET category = 'TECHNICAL_MUST'   WHERE category = 'BACKEND_MUST'
    `);
    await queryRunner.query(`
      UPDATE questions SET category = 'TECHNICAL_SHOULD' WHERE category = 'BACKEND_SHOULD'
    `);

    // Recreate the enum type and cast back (simplified revert — may need manual adjustment)
    await queryRunner.query(`
      CREATE TYPE questions_category_enum AS ENUM (
        'TECHNICAL_MUST', 'TECHNICAL_SHOULD', 'SOFT_SKILL', 'PERSONALITY'
      )
    `);
    await queryRunner.query(`
      ALTER TABLE questions
      ALTER COLUMN category TYPE questions_category_enum
        USING category::questions_category_enum
    `);
  }
}
