import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandFreelancerPhoneLength1786600000000 implements MigrationInterface {
  name = 'ExpandFreelancerPhoneLength1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "freelancers"
      ALTER COLUMN "phone" TYPE varchar(64)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "freelancers"
      ALTER COLUMN "phone" TYPE varchar(50)
    `);
  }
}
