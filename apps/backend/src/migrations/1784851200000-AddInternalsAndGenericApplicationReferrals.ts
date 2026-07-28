import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInternalsAndGenericApplicationReferrals1784851200000
  implements MigrationInterface
{
  name = 'AddInternalsAndGenericApplicationReferrals1784851200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, ['users', 'applications', 'application_referrals']);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "internals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_id" uuid NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_internals" PRIMARY KEY ("id")
      )
    `);
    await this.addForeignKeyIfMissing(
      queryRunner,
      'internals',
      'created_by_id',
      'users',
      'FK_internals_created_by',
      'SET NULL',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_internals_email" ON "internals" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_internals_is_active" ON "internals" ("is_active")`,
    );

    await this.addColumnIfMissing(
      queryRunner,
      'application_referrals',
      'source_type',
      `varchar(20) NOT NULL DEFAULT 'FREELANCER'`,
    );
    await this.addColumnIfMissing(
      queryRunner,
      'application_referrals',
      'internal_id',
      'uuid NULL',
    );
    await queryRunner.query(
      `ALTER TABLE "application_referrals" ALTER COLUMN "freelancer_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "application_referrals" SET "source_type" = 'FREELANCER' WHERE "source_type" IS NULL`,
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'application_referrals',
      'internal_id',
      'internals',
      'FK_application_referrals_internal',
      'RESTRICT',
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_application_referrals_internal_id" ON "application_referrals" ("internal_id")`,
    );
    await this.addCheckConstraintIfMissing(
      queryRunner,
      'application_referrals',
      'CHK_application_referrals_source_owner',
      `("source_type" = 'FREELANCER' AND "freelancer_id" IS NOT NULL AND "internal_id" IS NULL) OR ("source_type" = 'INTERNAL' AND "freelancer_id" IS NULL AND "internal_id" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "application_referrals" DROP CONSTRAINT IF EXISTS "CHK_application_referrals_source_owner"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_referrals" DROP CONSTRAINT IF EXISTS "FK_application_referrals_internal"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_application_referrals_internal_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_referrals" DROP COLUMN IF EXISTS "internal_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_referrals" DROP COLUMN IF EXISTS "source_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "application_referrals" ALTER COLUMN "freelancer_id" SET NOT NULL`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "internals"`);
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    definition: string,
  ) {
    const rows = await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
        LIMIT 1
      `,
      [tableName, columnName],
    );
    if (rows.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition}`,
      );
    }
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    referencedTableName: string,
    constraintName: string,
    onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL',
  ): Promise<void> {
    const existing = await queryRunner.query(
      `
        SELECT 1
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid = $1::regclass
          AND constraint_row.conname = $2
        LIMIT 1
      `,
      [tableName, constraintName],
    );
    if (existing.length > 0) return;

    await queryRunner.query(
      `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${columnName}") REFERENCES "${referencedTableName}"("id") ON DELETE ${onDelete}`,
    );
  }

  private async addCheckConstraintIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    expression: string,
  ) {
    const existing = await queryRunner.query(
      `
        SELECT 1
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid = $1::regclass
          AND constraint_row.conname = $2
        LIMIT 1
      `,
      [tableName, constraintName],
    );
    if (existing.length > 0) return;

    await queryRunner.query(
      `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" CHECK (${expression})`,
    );
  }

  private async assertRequiredTables(queryRunner: QueryRunner, tableNames: string[]) {
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
        `Cannot create Internal referral tables because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }
}
