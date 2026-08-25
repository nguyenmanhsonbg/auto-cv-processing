import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAmisRecruitmentBoardMembers1786000000000 implements MigrationInterface {
  name = 'CreateAmisRecruitmentBoardMembers1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN IF NOT EXISTS "amis_user_id" character varying
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_amis_user_id"
      ON "users" ("amis_user_id")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "amis_recruitment_board_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_system" character varying NOT NULL DEFAULT 'AMIS',
        "amis_recruitment_id" character varying NOT NULL,
        "amis_board_id" character varying,
        "amis_user_id" character varying NOT NULL,
        "full_name" character varying NOT NULL,
        "email" character varying,
        "is_admin" boolean NOT NULL DEFAULT false,
        "is_view_offer" boolean NOT NULL DEFAULT false,
        "is_push_notification" boolean NOT NULL DEFAULT false,
        "is_active" boolean NOT NULL DEFAULT true,
        "source_url" text,
        "last_synced_at" timestamp without time zone NOT NULL DEFAULT now(),
        "revoked_at" timestamp without time zone,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_amis_recruitment_board_members_id" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_amis_recruitment_board_members_source_user"
      ON "amis_recruitment_board_members" ("source_system", "amis_recruitment_id", "amis_user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_amis_recruitment_board_members_recruitment_active"
      ON "amis_recruitment_board_members" ("source_system", "amis_recruitment_id", "is_active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_amis_recruitment_board_members_recruitment_active"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_amis_recruitment_board_members_source_user"');
    await queryRunner.query('DROP TABLE IF EXISTS "amis_recruitment_board_members"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_users_amis_user_id"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "amis_user_id"');
  }
}
