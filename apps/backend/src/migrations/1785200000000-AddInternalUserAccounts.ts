import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInternalUserAccounts1785200000000 implements MigrationInterface {
  name = 'AddInternalUserAccounts1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const enumRows = await queryRunner.query(`
      SELECT column_row.udt_name
      FROM information_schema.columns column_row
      WHERE column_row.table_schema = 'public'
        AND column_row.table_name = 'users'
        AND column_row.column_name = 'role'
        AND column_row.data_type = 'USER-DEFINED'
      LIMIT 1
    `);

    if (enumRows.length > 0) {
      const enumTypeName = enumRows[0].udt_name as string;
      const internalRoleRows = await queryRunner.query(
        `
          SELECT 1
          FROM pg_type type_row
          JOIN pg_enum enum_row ON enum_row.enumtypid = type_row.oid
          WHERE type_row.typname = $1 AND enum_row.enumlabel = 'INTERNAL'
          LIMIT 1
        `,
        [enumTypeName],
      );

      if (internalRoleRows.length === 0) {
        await queryRunner.query(`ALTER TYPE "${enumTypeName}" ADD VALUE 'INTERNAL'`);
      }
    }

    await queryRunner.query(
      `ALTER TABLE "internals" ADD COLUMN IF NOT EXISTS "user_id" uuid NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_internals_user_id" ON "internals" ("user_id")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_internals_user'
        ) THEN
          ALTER TABLE "internals"
            ADD CONSTRAINT "FK_internals_user"
            FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "internals" DROP CONSTRAINT IF EXISTS "FK_internals_user"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_internals_user_id"`);
    await queryRunner.query(
      `ALTER TABLE "internals" DROP COLUMN IF EXISTS "user_id"`,
    );
    // Keep the enum label: removing PostgreSQL enum values is unsafe when data exists.
  }
}
