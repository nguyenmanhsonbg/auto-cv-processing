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
            "requirements"->'overview'->>'text',
            "requirements"->'overview'->>'rawText',
            "requirements"->'overview'->>'html'
          ), '')
        ),
        "responsibilities" = COALESCE(
          "responsibilities",
          NULLIF(COALESCE(
            "requirements"->'responsibilities'->>'text',
            "requirements"->'responsibilities'->>'rawText',
            "requirements"->'responsibilities'->>'html'
          ), '')
        ),
        "salary" = COALESCE(
          "salary",
          NULLIF(
            CASE
              WHEN jsonb_typeof("benefits"->'salary') = 'string'
                THEN "benefits"->'salary' #>> '{}'
              ELSE COALESCE(
                "benefits"->'salary'->>'text',
                "benefits"->'salary'->>'rawText',
                "benefits"->'salary'->>'html'
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
                WHEN jsonb_typeof("benefits"->'annualLeave') = 'string'
                  THEN "benefits"->'annualLeave' #>> '{}'
                ELSE COALESCE(
                  "benefits"->'annualLeave'->>'text',
                  "benefits"->'annualLeave'->>'rawText',
                  "benefits"->'annualLeave'->>'html',
                  "benefits"->'annualLeave'->>'days'
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
              WHEN jsonb_typeof("benefits"->'insurance') = 'string'
                THEN "benefits"->'insurance' #>> '{}'
              ELSE COALESCE(
                "benefits"->'insurance'->>'text',
                "benefits"->'insurance'->>'rawText',
                "benefits"->'insurance'->>'html'
              )
            END,
            ''
          ),
          'awards',
          NULLIF(
            CASE
              WHEN jsonb_typeof("benefits"->'awards') = 'string'
                THEN "benefits"->'awards' #>> '{}'
              ELSE COALESCE(
                "benefits"->'awards'->>'text',
                "benefits"->'awards'->>'rawText',
                "benefits"->'awards'->>'html'
              )
            END,
            ''
          ),
          'office',
          NULLIF(
            CASE
              WHEN jsonb_typeof("benefits"->'office') = 'string'
                THEN "benefits"->'office' #>> '{}'
              ELSE COALESCE(
                "benefits"->'office'->>'text',
                "benefits"->'office'->>'rawText',
                "benefits"->'office'->>'html'
              )
            END,
            ''
          ),
          'celebration',
          NULLIF(
            CASE
              WHEN jsonb_typeof("benefits"->'celebration') = 'string'
                THEN "benefits"->'celebration' #>> '{}'
              ELSE COALESCE(
                "benefits"->'celebration'->>'text',
                "benefits"->'celebration'->>'rawText',
                "benefits"->'celebration'->>'html'
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
          WHEN jsonb_typeof("requirements") = 'string'
            THEN "requirements" #>> '{}'
          WHEN "requirements" ? 'qualifications'
            THEN COALESCE(
              "requirements"->'qualifications'->>'text',
              "requirements"->'qualifications'->>'rawText',
              "requirements"->'qualifications'->>'html',
              ("requirements"->'qualifications')::text
            )
          WHEN "requirements" ? 'rawText'
            THEN "requirements"->>'rawText'
          WHEN "requirements" ? 'text'
            THEN "requirements"->>'text'
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
