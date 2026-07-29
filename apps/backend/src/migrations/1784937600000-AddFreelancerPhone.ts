import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFreelancerPhone1784937600000 implements MigrationInterface {
  name = 'AddFreelancerPhone1784937600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "freelancers" ADD COLUMN IF NOT EXISTS "phone" varchar(50) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "freelancers" DROP COLUMN IF EXISTS "phone"`,
    );
  }
}
