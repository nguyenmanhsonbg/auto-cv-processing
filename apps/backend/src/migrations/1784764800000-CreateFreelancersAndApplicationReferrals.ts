import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFreelancersAndApplicationReferrals1784764800000
  implements MigrationInterface
{
  name = 'CreateFreelancersAndApplicationReferrals1784764800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, ['users', 'applications']);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await this.addFreelancerRoleIfMissing(queryRunner);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "freelancers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "identifier" varchar(8) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_id" uuid NOT NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_freelancers" PRIMARY KEY ("id")
      )
    `);
    await this.addForeignKeyIfMissing(
      queryRunner,
      'freelancers',
      'user_id',
      'users',
      'FK_freelancers_user',
      'RESTRICT',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'freelancers',
      'created_by_id',
      'users',
      'FK_freelancers_created_by',
      'RESTRICT',
    );
    await this.addCheckConstraintIfMissing(
      queryRunner,
      'freelancers',
      'CHK_freelancers_identifier_format',
      `"identifier" ~ '^FL[0-9]{6}$'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_freelancers_user_id" ON "freelancers" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_freelancers_identifier" ON "freelancers" ("identifier")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_freelancers_is_active" ON "freelancers" ("is_active")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "freelancer_identifier_counters" (
        "id" integer NOT NULL,
        "last_issued_number" integer NOT NULL,
        CONSTRAINT "PK_freelancer_identifier_counters" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "freelancer_identifier_counters" ("id", "last_issued_number")
      VALUES (1, 0)
      ON CONFLICT ("id") DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "application_referrals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "application_id" uuid NOT NULL,
        "freelancer_id" uuid NOT NULL,
        "evaluation" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_application_referrals" PRIMARY KEY ("id")
      )
    `);
    await this.addForeignKeyIfMissing(
      queryRunner,
      'application_referrals',
      'application_id',
      'applications',
      'FK_application_referrals_application',
      'RESTRICT',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'application_referrals',
      'freelancer_id',
      'freelancers',
      'FK_application_referrals_freelancer',
      'RESTRICT',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_application_referrals_application_id" ON "application_referrals" ("application_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_application_referrals_freelancer_id" ON "application_referrals" ("freelancer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "application_referrals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "freelancer_identifier_counters"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "freelancers"`);
    // Intentionally keep the FREELANCER enum value on users.role because removing
    // enum labels is unsafe and can break shared environments with existing data.
  }

  private async addFreelancerRoleIfMissing(queryRunner: QueryRunner): Promise<void> {
    const enumRows = await queryRunner.query(
      `
        SELECT column_row.udt_name
        FROM information_schema.columns column_row
        WHERE column_row.table_schema = 'public'
          AND column_row.table_name = 'users'
          AND column_row.column_name = 'role'
          AND column_row.data_type = 'USER-DEFINED'
        LIMIT 1
      `,
    );

    if (enumRows.length === 0) {
      return;
    }

    const enumTypeName = enumRows[0].udt_name as string;
    const existingEnumValue = await queryRunner.query(
      `
        SELECT 1
        FROM pg_type type_row
        JOIN pg_enum enum_row
          ON enum_row.enumtypid = type_row.oid
        WHERE type_row.typname = $1
          AND enum_row.enumlabel = 'FREELANCER'
        LIMIT 1
      `,
      [enumTypeName],
    );

    if (existingEnumValue.length > 0) {
      return;
    }

    await queryRunner.query(`ALTER TYPE "${enumTypeName}" ADD VALUE 'FREELANCER'`);
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    referencedTableName: string,
    constraintName: string,
    onDelete: 'CASCADE' | 'RESTRICT' | 'SET NULL',
  ): Promise<void> {
    const deleteBehaviorCodeByAction: Record<typeof onDelete, string> = {
      CASCADE: 'c',
      'SET NULL': 'n',
      RESTRICT: 'r',
    };
    const deleteBehaviorCode = deleteBehaviorCodeByAction[onDelete];

    const existing = await queryRunner.query(
      `
        SELECT 1
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid = $1::regclass
          AND constraint_row.contype = 'f'
          AND constraint_row.confrelid = $2::regclass
          AND constraint_row.conkey = ARRAY[
            (
              SELECT attribute.attnum
              FROM pg_attribute attribute
              WHERE attribute.attrelid = $1::regclass
                AND attribute.attname = $3
                AND NOT attribute.attisdropped
            )
          ]::smallint[]
          AND constraint_row.confdeltype = $4
        LIMIT 1
      `,
      [tableName, referencedTableName, columnName, deleteBehaviorCode],
    );

    if (existing.length > 0) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${columnName}") REFERENCES "${referencedTableName}"("id") ON DELETE ${onDelete}`,
    );
  }

  private async addCheckConstraintIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    expression: string,
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

    if (existing.length > 0) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" CHECK (${expression})`,
    );
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
        `Cannot create freelancer tables because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }
}
