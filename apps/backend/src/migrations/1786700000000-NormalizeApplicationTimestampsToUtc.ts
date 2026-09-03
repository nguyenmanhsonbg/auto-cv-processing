import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeApplicationTimestampsToUtc1786700000000 implements MigrationInterface {
  name = 'NormalizeApplicationTimestampsToUtc1786700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications"
        ALTER COLUMN "created_at" TYPE timestamptz
          USING "created_at" AT TIME ZONE 'UTC',
        ALTER COLUMN "updated_at" TYPE timestamptz
          USING "updated_at" AT TIME ZONE 'UTC'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "applications"
        ALTER COLUMN "created_at" TYPE timestamp
          USING "created_at" AT TIME ZONE 'UTC',
        ALTER COLUMN "updated_at" TYPE timestamp
          USING "updated_at" AT TIME ZONE 'UTC'
    `);
  }
}
