import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVcsPortalJobDescriptionSync1783000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, [
      'job_descriptions',
      'question_sets',
    ]);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_source_categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_system" varchar NOT NULL,
        "name" varchar NOT NULL,
        "display_name" varchar NOT NULL,
        "slug" varchar NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_job_source_categories" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_source_categories_source_name"
      ON "job_source_categories" ("source_system", "name")
    `);

    await queryRunner.query(`
      INSERT INTO "job_source_categories" ("source_system", "name", "display_name", "slug")
      VALUES
        ('VCS_PORTAL', 'Technology', 'Technology', 'technology'),
        ('VCS_PORTAL', 'Security', 'Security', 'security'),
        ('VCS_PORTAL', 'Infrastructure', 'Infrastructure', 'infrastructure'),
        ('VCS_PORTAL', 'Non-tech', 'Non-tech', 'non-tech')
      ON CONFLICT ("source_system", "name") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_description_source_categories" (
        "job_description_id" uuid NOT NULL,
        "source_category_id" uuid NOT NULL,
        CONSTRAINT "PK_job_description_source_categories" PRIMARY KEY ("job_description_id", "source_category_id"),
        CONSTRAINT "FK_jd_source_categories_job_description" FOREIGN KEY ("job_description_id") REFERENCES "job_descriptions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_jd_source_categories_source_category" FOREIGN KEY ("source_category_id") REFERENCES "job_source_categories"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_jd_source_categories_category"
      ON "job_description_source_categories" ("source_category_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ADD COLUMN IF NOT EXISTS "source_system" varchar NULL,
      ADD COLUMN IF NOT EXISTS "source_job_id" varchar NULL,
      ADD COLUMN IF NOT EXISTS "source_slug" varchar NULL,
      ADD COLUMN IF NOT EXISTS "source_url" text NULL,
      ADD COLUMN IF NOT EXISTS "source_department" varchar NULL,
      ADD COLUMN IF NOT EXISTS "source_created_at" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "source_modified_at" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "source_deadline_at" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "source_snapshot_hash" varchar NULL,
      ADD COLUMN IF NOT EXISTS "source_snapshot" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "source_last_synced_at" timestamp NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_descriptions_source_system_job_id"
      ON "job_descriptions" ("source_system", "source_job_id")
      WHERE "source_system" IS NOT NULL AND "source_job_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_job_descriptions_source_system"
      ON "job_descriptions" ("source_system")
    `);

    await queryRunner.query(`
      ALTER TABLE "question_sets"
      ADD COLUMN IF NOT EXISTS "source_system" varchar NULL,
      ADD COLUMN IF NOT EXISTS "source_job_id" varchar NULL,
      ADD COLUMN IF NOT EXISTS "source_snapshot_hash" varchar NULL,
      ADD COLUMN IF NOT EXISTS "source_snapshot" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "source_last_synced_at" timestamp NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_question_sets_source"
      ON "question_sets" ("source_system", "source_job_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_question_sets_source"`);
    await queryRunner.query(`
      ALTER TABLE "question_sets"
      DROP COLUMN IF EXISTS "source_last_synced_at",
      DROP COLUMN IF EXISTS "source_snapshot",
      DROP COLUMN IF EXISTS "source_snapshot_hash",
      DROP COLUMN IF EXISTS "source_job_id",
      DROP COLUMN IF EXISTS "source_system"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_descriptions_source_system"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_job_descriptions_source_system_job_id"`);
    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      DROP COLUMN IF EXISTS "source_last_synced_at",
      DROP COLUMN IF EXISTS "source_snapshot",
      DROP COLUMN IF EXISTS "source_snapshot_hash",
      DROP COLUMN IF EXISTS "source_deadline_at",
      DROP COLUMN IF EXISTS "source_modified_at",
      DROP COLUMN IF EXISTS "source_created_at",
      DROP COLUMN IF EXISTS "source_department",
      DROP COLUMN IF EXISTS "source_url",
      DROP COLUMN IF EXISTS "source_slug",
      DROP COLUMN IF EXISTS "source_job_id",
      DROP COLUMN IF EXISTS "source_system"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "job_description_source_categories"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_job_source_categories_source_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "job_source_categories"`);
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
        `Cannot add VCS Portal JD sync schema because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }
}
