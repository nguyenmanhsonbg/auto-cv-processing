import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserRoleMemberships1786500000000 implements MigrationInterface {
  name = 'CreateUserRoleMemberships1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'user_role_memberships_role_enum'
        ) THEN
          CREATE TYPE "user_role_memberships_role_enum" AS ENUM (
            'ADMIN', 'INTERVIEWER', 'COMMITTEE', 'HR', 'FREELANCER', 'INTERNAL'
          );
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_role_memberships" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "role" "user_role_memberships_role_enum" NOT NULL,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_role_memberships_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_role_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_role_memberships_user_role"
      ON "user_role_memberships" ("user_id", "role")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_role_memberships_role"
      ON "user_role_memberships" ("role")
    `);
    await queryRunner.query(`
      INSERT INTO "user_role_memberships" ("user_id", "role")
      SELECT "id", "role"::text::"user_role_memberships_role_enum"
      FROM "users"
      WHERE "role" IS NOT NULL
      ON CONFLICT ("user_id", "role") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_user_role_memberships_role"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_user_role_memberships_user_role"');
    await queryRunner.query('DROP TABLE IF EXISTS "user_role_memberships"');
    await queryRunner.query('DROP TYPE IF EXISTS "user_role_memberships_role_enum"');
  }
}
