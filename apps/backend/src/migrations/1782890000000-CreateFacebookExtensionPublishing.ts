import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFacebookExtensionPublishing1782890000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, ['job_postings']);

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facebook_publish_targets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" varchar NOT NULL,
        "name" varchar NOT NULL,
        "external_id" varchar NULL,
        "url" text NULL,
        "active" boolean NOT NULL DEFAULT true,
        "priority" integer NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_facebook_publish_targets" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facebook_publish_histories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "job_posting_id" uuid NOT NULL,
        "job_description_id" uuid NULL,
        "job_description_version_id" uuid NULL,
        "target_id" uuid NULL,
        "target_type" varchar NOT NULL,
        "target_name" varchar NOT NULL,
        "target_url" text NULL,
        "content" text NOT NULL,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "error_reason" text NULL,
        "external_post_id" varchar NULL,
        "submitted_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_facebook_publish_histories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_facebook_publish_histories_job_posting" FOREIGN KEY ("job_posting_id") REFERENCES "job_postings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_facebook_publish_histories_target" FOREIGN KEY ("target_id") REFERENCES "facebook_publish_targets"("id") ON DELETE SET NULL
      )
    `);

    await this.createIndexes(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "facebook_publish_histories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "facebook_publish_targets"`);
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
        `Cannot create Facebook publishing tables because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS "IDX_facebook_publish_targets_type_active" ON "facebook_publish_targets" ("type", "active")`,
      `CREATE INDEX IF NOT EXISTS "IDX_facebook_publish_targets_priority" ON "facebook_publish_targets" ("priority", "created_at")`,
      `CREATE INDEX IF NOT EXISTS "IDX_facebook_publish_histories_job_posting" ON "facebook_publish_histories" ("job_posting_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_facebook_publish_histories_status" ON "facebook_publish_histories" ("status")`,
      `CREATE INDEX IF NOT EXISTS "IDX_facebook_publish_histories_target" ON "facebook_publish_histories" ("target_id")`,
    ];

    for (const indexSql of indexes) {
      await queryRunner.query(indexSql);
    }
  }
}
