import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFacebookGroupSyncStates1783400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facebook_group_sync_states" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "owner_user_id" uuid NOT NULL,
        "scope_key" varchar(255) NOT NULL,
        "status" varchar(32) NOT NULL DEFAULT 'NOT_INITIALIZED',
        "initial_scan_completed_at" timestamp NULL,
        "last_scan_started_at" timestamp NULL,
        "last_scan_completed_at" timestamp NULL,
        "last_scanned_count" integer NOT NULL DEFAULT 0,
        "last_error" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_facebook_group_sync_states" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_facebook_group_sync_states_owner_scope" UNIQUE ("owner_user_id", "scope_key"),
        CONSTRAINT "FK_facebook_group_sync_states_owner_user"
          FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_facebook_group_sync_states_owner_scope" ON "facebook_group_sync_states" ("owner_user_id", "scope_key")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_facebook_group_sync_states_owner_scope"');
    await queryRunner.query('DROP TABLE IF EXISTS "facebook_group_sync_states"');
  }
}
