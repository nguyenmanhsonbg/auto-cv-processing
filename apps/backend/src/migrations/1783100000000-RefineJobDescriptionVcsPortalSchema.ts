import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefineJobDescriptionVcsPortalSchema1783100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, [
      'job_descriptions',
      'job_source_categories',
    ]);

    await queryRunner.query(`
      ALTER TABLE "job_source_categories"
      ADD COLUMN IF NOT EXISTS "source_category_id" varchar NULL
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_job_source_categories_source_name"`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_job_source_categories_source_name"
      ON "job_source_categories" ("source_system", "name")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_source_categories_source_category_id"
      ON "job_source_categories" ("source_system", "source_category_id")
      WHERE "source_category_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ADD COLUMN IF NOT EXISTS "overview" text NULL,
      ADD COLUMN IF NOT EXISTS "responsibilities" text NULL,
      ADD COLUMN IF NOT EXISTS "salary" text NULL,
      ADD COLUMN IF NOT EXISTS "annual_leave_days" text NULL,
      ADD COLUMN IF NOT EXISTS "department" text NULL,
      ADD COLUMN IF NOT EXISTS "application_deadline" date NULL,
      ADD COLUMN IF NOT EXISTS "source_payload" jsonb NULL,
      ADD COLUMN IF NOT EXISTS "source_content_hash" varchar NULL,
      ADD COLUMN IF NOT EXISTS "last_synced_at" timestamptz NULL
    `);

    await queryRunner.query(`
      UPDATE "job_descriptions"
      SET
        "overview" = COALESCE(
          "overview",
          NULLIF(COALESCE(
            ("requirements"::jsonb)->'overview'->>'text',
            ("requirements"::jsonb)->'overview'->>'rawText',
            ("requirements"::jsonb)->'overview'->>'html'
          ), '')
        ),
        "responsibilities" = COALESCE(
          "responsibilities",
          NULLIF(COALESCE(
            ("requirements"::jsonb)->'responsibilities'->>'text',
            ("requirements"::jsonb)->'responsibilities'->>'rawText',
            ("requirements"::jsonb)->'responsibilities'->>'html'
          ), '')
        ),
        "salary" = COALESCE(
          "salary",
          NULLIF(
            CASE
              WHEN jsonb_typeof(("benefits"::jsonb)->'salary') = 'string'
                THEN ("benefits"::jsonb)->'salary' #>> '{}'
              ELSE COALESCE(
                ("benefits"::jsonb)->'salary'->>'text',
                ("benefits"::jsonb)->'salary'->>'rawText',
                ("benefits"::jsonb)->'salary'->>'html'
              )
            END,
            ''
          )
        ),
        "annual_leave_days" = COALESCE(
          "annual_leave_days",
          NULLIF(
            trim(
              CASE
                WHEN jsonb_typeof(("benefits"::jsonb)->'annualLeave') = 'string'
                  THEN ("benefits"::jsonb)->'annualLeave' #>> '{}'
                ELSE COALESCE(
                  ("benefits"::jsonb)->'annualLeave'->>'text',
                  ("benefits"::jsonb)->'annualLeave'->>'rawText',
                  ("benefits"::jsonb)->'annualLeave'->>'html',
                  ("benefits"::jsonb)->'annualLeave'->>'days'
                )
              END
            ),
            ''
          )
        ),
        "department" = COALESCE("department", NULLIF("source_department", '')),
        "application_deadline" = COALESCE("application_deadline", "source_deadline_at"::date),
        "source_payload" = COALESCE("source_payload", "source_snapshot"),
        "source_content_hash" = COALESCE("source_content_hash", "source_snapshot_hash"),
        "last_synced_at" = COALESCE("last_synced_at", "source_last_synced_at")
      WHERE "source_system" = 'VCS_PORTAL'
    `);

    await queryRunner.query(`
      UPDATE "job_descriptions"
      SET "benefits" = NULLIF(
        jsonb_strip_nulls(jsonb_build_object(
          'insurance',
          NULLIF(
            CASE
              WHEN jsonb_typeof(("benefits"::jsonb)->'insurance') = 'string'
                THEN ("benefits"::jsonb)->'insurance' #>> '{}'
              ELSE COALESCE(
                ("benefits"::jsonb)->'insurance'->>'text',
                ("benefits"::jsonb)->'insurance'->>'rawText',
                ("benefits"::jsonb)->'insurance'->>'html'
              )
            END,
            ''
          ),
          'awards',
          NULLIF(
            CASE
              WHEN jsonb_typeof(("benefits"::jsonb)->'awards') = 'string'
                THEN ("benefits"::jsonb)->'awards' #>> '{}'
              ELSE COALESCE(
                ("benefits"::jsonb)->'awards'->>'text',
                ("benefits"::jsonb)->'awards'->>'rawText',
                ("benefits"::jsonb)->'awards'->>'html'
              )
            END,
            ''
          ),
          'office',
          NULLIF(
            CASE
              WHEN jsonb_typeof(("benefits"::jsonb)->'office') = 'string'
                THEN ("benefits"::jsonb)->'office' #>> '{}'
              ELSE COALESCE(
                ("benefits"::jsonb)->'office'->>'text',
                ("benefits"::jsonb)->'office'->>'rawText',
                ("benefits"::jsonb)->'office'->>'html'
              )
            END,
            ''
          ),
          'celebration',
          NULLIF(
            CASE
              WHEN jsonb_typeof(("benefits"::jsonb)->'celebration') = 'string'
                THEN ("benefits"::jsonb)->'celebration' #>> '{}'
              ELSE COALESCE(
                ("benefits"::jsonb)->'celebration'->>'text',
                ("benefits"::jsonb)->'celebration'->>'rawText',
                ("benefits"::jsonb)->'celebration'->>'html'
              )
            END,
            ''
          )
        )),
        '{}'::jsonb
      )
      WHERE "source_system" = 'VCS_PORTAL'
    `);

    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ALTER COLUMN "requirements" TYPE text
      USING (
        CASE
          WHEN jsonb_typeof("requirements"::jsonb) = 'string'
            THEN "requirements"::jsonb #>> '{}'
          WHEN "requirements"::jsonb ? 'qualifications'
            THEN COALESCE(
              ("requirements"::jsonb)->'qualifications'->>'text',
              ("requirements"::jsonb)->'qualifications'->>'rawText',
              ("requirements"::jsonb)->'qualifications'->>'html',
              ("requirements"::jsonb->'qualifications')::text
            )
          WHEN "requirements"::jsonb ? 'rawText'
            THEN "requirements"::jsonb->>'rawText'
          WHEN "requirements"::jsonb ? 'text'
            THEN "requirements"::jsonb->>'text'
          ELSE "requirements"::text
        END
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ALTER COLUMN "requirements" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ALTER COLUMN "source_created_at" TYPE timestamptz
      USING "source_created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "source_modified_at" TYPE timestamptz
      USING "source_modified_at" AT TIME ZONE 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ALTER COLUMN "source_created_at" TYPE timestamp
      USING "source_created_at" AT TIME ZONE 'UTC',
      ALTER COLUMN "source_modified_at" TYPE timestamp
      USING "source_modified_at" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      ALTER COLUMN "requirements" TYPE jsonb
      USING jsonb_build_object('text', "requirements")
    `);

    await queryRunner.query(`
      ALTER TABLE "job_descriptions"
      DROP COLUMN IF EXISTS "last_synced_at",
      DROP COLUMN IF EXISTS "source_content_hash",
      DROP COLUMN IF EXISTS "source_payload",
      DROP COLUMN IF EXISTS "application_deadline",
      DROP COLUMN IF EXISTS "department",
      DROP COLUMN IF EXISTS "annual_leave_days",
      DROP COLUMN IF EXISTS "salary",
      DROP COLUMN IF EXISTS "responsibilities",
      DROP COLUMN IF EXISTS "overview"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_job_source_categories_source_category_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_job_source_categories_source_name"`);
    await queryRunner.query(`
      ALTER TABLE "job_source_categories"
      DROP COLUMN IF EXISTS "source_category_id"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_job_source_categories_source_name"
      ON "job_source_categories" ("source_system", "name")
    `);
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
        `Cannot refine VCS Portal JD schema because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }
}
