import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCommitteeUserRole1785700000000 implements MigrationInterface {
  name = 'AddCommitteeUserRole1785700000000';

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

    if (enumRows.length === 0) return;

    const enumTypeName = enumRows[0].udt_name as string;
    const committeeRoleRows = await queryRunner.query(
      `
        SELECT 1
        FROM pg_type type_row
        JOIN pg_enum enum_row ON enum_row.enumtypid = type_row.oid
        WHERE type_row.typname = $1
          AND enum_row.enumlabel = 'COMMITTEE'
        LIMIT 1
      `,
      [enumTypeName],
    );

    if (committeeRoleRows.length === 0) {
      await queryRunner.query(`ALTER TYPE "${enumTypeName}" ADD VALUE 'COMMITTEE'`);
    }
  }

  public async down(): Promise<void> {
    // PostgreSQL enum labels are intentionally retained because removing a role
    // can invalidate existing users in shared environments.
  }
}
