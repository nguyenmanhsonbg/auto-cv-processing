import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmisIdentityContactToUsers1786400000000 implements MigrationInterface {
  name = 'AddAmisIdentityContactToUsers1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "amis_full_name" varchar NULL,
      ADD COLUMN IF NOT EXISTS "amis_email" varchar NULL,
      ADD COLUMN IF NOT EXISTS "amis_phone" varchar NULL,
      ADD COLUMN IF NOT EXISTS "amis_tenant_id" varchar NULL,
      ADD COLUMN IF NOT EXISTS "amis_identity_verified_at" timestamp NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      DROP COLUMN IF EXISTS "amis_identity_verified_at",
      DROP COLUMN IF EXISTS "amis_tenant_id",
      DROP COLUMN IF EXISTS "amis_phone",
      DROP COLUMN IF EXISTS "amis_email",
      DROP COLUMN IF EXISTS "amis_full_name"
    `);
  }
}
