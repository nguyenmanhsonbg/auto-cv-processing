import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMustChangePasswordToUsers1700000000000 implements MigrationInterface {
  name = 'AddMustChangePasswordToUsers1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'must_change_password',
        type: 'boolean',
        default: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'must_change_password');
  }
}
