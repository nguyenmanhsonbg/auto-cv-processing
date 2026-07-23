import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookAccountScope1783500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facebook_accounts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "owner_user_id" uuid NOT NULL,
        "facebook_external_id" varchar(255) NOT NULL,
        "display_name" varchar(255) NULL,
        "profile_url" text NULL,
        "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
        "last_seen_at" timestamp NULL,
        "last_authenticated_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_facebook_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_facebook_accounts_owner_external" UNIQUE ("owner_user_id", "facebook_external_id"),
        CONSTRAINT "FK_facebook_accounts_owner_user"
          FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_facebook_accounts_owner_status"
      ON "facebook_accounts" ("owner_user_id", "status")
    `);

    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      ADD COLUMN IF NOT EXISTS "facebook_account_id" uuid NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_facebook_publish_targets_account'
        ) THEN
          ALTER TABLE "facebook_publish_targets"
          ADD CONSTRAINT "FK_facebook_publish_targets_account"
          FOREIGN KEY ("facebook_account_id") REFERENCES "facebook_accounts"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_facebook_publish_targets_account_type_active"
      ON "facebook_publish_targets" ("facebook_account_id", "type", "active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_facebook_publish_targets_account_type_active"');
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP CONSTRAINT IF EXISTS "FK_facebook_publish_targets_account"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP COLUMN IF EXISTS "facebook_account_id"
    `);
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_facebook_accounts_owner_status"');
    await queryRunner.query('DROP TABLE IF EXISTS "facebook_accounts"');
  }
}
