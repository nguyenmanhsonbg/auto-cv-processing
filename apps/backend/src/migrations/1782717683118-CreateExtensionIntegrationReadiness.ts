import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExtensionIntegrationReadiness1782717683118 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, ['users', 'job_postings']);

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "recruitment_external_references" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_system" varchar NOT NULL,
        "external_entity_type" varchar NOT NULL,
        "external_id" varchar NOT NULL,
        "external_url" text NULL,
        "internal_entity_type" varchar NOT NULL,
        "internal_entity_id" uuid NOT NULL,
        "last_snapshot_hash" varchar NULL,
        "last_idempotency_key" varchar NULL,
        "last_synced_at" timestamp NULL,
        "metadata" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recruitment_external_references" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recruitment_external_references_job_posting" FOREIGN KEY ("internal_entity_id") REFERENCES "job_postings"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "extension_idempotency_records" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "idempotency_key" varchar NOT NULL,
        "source_system" varchar NOT NULL,
        "request_hash" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'PROCESSING',
        "response_data" jsonb NULL,
        "actor_user_id" uuid NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_extension_idempotency_records" PRIMARY KEY ("id"),
        CONSTRAINT "FK_extension_idempotency_records_actor_user" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await this.createIndexes(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "extension_idempotency_records"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recruitment_external_references"`);
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
        `Cannot create extension integration readiness tables because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }

  private async createIndexes(queryRunner: QueryRunner): Promise<void> {
    const indexes = [
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_recruitment_external_references_external" ON "recruitment_external_references" ("source_system", "external_entity_type", "external_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_recruitment_external_references_internal" ON "recruitment_external_references" ("internal_entity_type", "internal_entity_id")`,
      `CREATE INDEX IF NOT EXISTS "IDX_recruitment_external_references_source_external_id" ON "recruitment_external_references" ("source_system", "external_id")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_extension_idempotency_records_key" ON "extension_idempotency_records" ("idempotency_key")`,
      `CREATE INDEX IF NOT EXISTS "IDX_extension_idempotency_records_source_key" ON "extension_idempotency_records" ("source_system", "idempotency_key")`,
      `CREATE INDEX IF NOT EXISTS "IDX_extension_idempotency_records_status" ON "extension_idempotency_records" ("status")`,
    ];

    for (const indexSql of indexes) {
      await queryRunner.query(indexSql);
    }
  }
}
