import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAmisCareers1782951000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, ['users']);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "amis_careers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "amis_career_id" varchar NOT NULL,
        "code" varchar NULL,
        "name" varchar NOT NULL,
        "description" text NULL,
        "organization_unit_id" uuid NULL,
        "organization_unit_name" varchar NULL,
        "usage_status" integer NULL,
        "parent_amis_career_id" varchar NULL,
        "sort_order" integer NULL,
        "question_category_names" jsonb NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "removed_from_amis_at" timestamp NULL,
        "raw_snapshot" jsonb NULL,
        "last_synced_at" timestamp NOT NULL,
        "last_synced_by_id" uuid NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_amis_careers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_amis_careers_last_synced_by" FOREIGN KEY ("last_synced_by_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_amis_careers_amis_career_id" ON "amis_careers" ("amis_career_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_amis_careers_parent_amis_career_id" ON "amis_careers" ("parent_amis_career_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_amis_careers_name" ON "amis_careers" ("name")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "amis_careers"`);
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
        `Cannot create AMIS careers table because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }
}
