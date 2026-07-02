import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFacebookPublishTargetOwner1782970000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      ADD COLUMN IF NOT EXISTS "owner_user_id" uuid NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_facebook_publish_targets_owner_user'
        ) THEN
          ALTER TABLE "facebook_publish_targets"
          ADD CONSTRAINT "FK_facebook_publish_targets_owner_user"
          FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_facebook_publish_targets_owner_type_active"
      ON "facebook_publish_targets" ("owner_user_id", "type", "active")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_facebook_publish_targets_owner_type_active"`);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP CONSTRAINT IF EXISTS "FK_facebook_publish_targets_owner_user"
    `);
    await queryRunner.query(`
      ALTER TABLE "facebook_publish_targets"
      DROP COLUMN IF EXISTS "owner_user_id"
    `);
  }
}
