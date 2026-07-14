import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExtensionInstancesAndTasks1783000000000 implements MigrationInterface {
  name = 'CreateExtensionInstancesAndTasks1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "extension_instances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "owner_user_id" uuid NOT NULL,
        "install_id" varchar NOT NULL,
        "display_name" varchar NULL,
        "version" varchar NULL,
        "status" varchar NOT NULL DEFAULT 'ONLINE',
        "capabilities" jsonb NULL,
        "last_seen_at" timestamp NULL,
        "registered_at" timestamp NOT NULL DEFAULT now(),
        "disabled_at" timestamp NULL,
        "metadata" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_extension_instances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_extension_instances_owner_user" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE UNIQUE INDEX IF NOT EXISTS "UQ_extension_instances_owner_install" ON "extension_instances" ("owner_user_id", "install_id")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_extension_instances_owner_status" ON "extension_instances" ("owner_user_id", "status")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_extension_instances_last_seen_at" ON "extension_instances" ("last_seen_at")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "extension_tasks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'PENDING',
        "requested_by_user_id" uuid NOT NULL,
        "assigned_instance_id" uuid NULL,
        "claimed_by_instance_id" uuid NULL,
        "locked_until" timestamp NULL,
        "payload" jsonb NULL,
        "result" jsonb NULL,
        "error_code" varchar NULL,
        "error_message" text NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "max_attempts" integer NOT NULL DEFAULT 3,
        "priority" integer NOT NULL DEFAULT 0,
        "started_at" timestamp NULL,
        "finished_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_extension_tasks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_extension_tasks_requested_by_user" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_extension_tasks_assigned_instance" FOREIGN KEY ("assigned_instance_id") REFERENCES "extension_instances"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_extension_tasks_claimed_instance" FOREIGN KEY ("claimed_by_instance_id") REFERENCES "extension_instances"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_extension_tasks_status_priority_created" ON "extension_tasks" ("status", "priority", "created_at")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_extension_tasks_assigned_status" ON "extension_tasks" ("assigned_instance_id", "status")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_extension_tasks_claimed_status" ON "extension_tasks" ("claimed_by_instance_id", "status")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_extension_tasks_locked_until" ON "extension_tasks" ("locked_until")');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "extension_task_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "task_id" uuid NOT NULL,
        "instance_id" uuid NULL,
        "event_type" varchar NOT NULL,
        "message" text NULL,
        "payload" jsonb NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_extension_task_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_extension_task_events_task" FOREIGN KEY ("task_id") REFERENCES "extension_tasks"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_extension_task_events_instance" FOREIGN KEY ("instance_id") REFERENCES "extension_instances"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_extension_task_events_task_created" ON "extension_task_events" ("task_id", "created_at")');
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_extension_task_events_instance_created" ON "extension_task_events" ("instance_id", "created_at")');

    await queryRunner.query('ALTER TABLE "extension_idempotency_records" ADD COLUMN IF NOT EXISTS "extension_instance_id" uuid NULL');
    await this.addForeignKeyIfMissing(
      queryRunner,
      'extension_idempotency_records',
      'extension_instance_id',
      'extension_instances',
      'FK_extension_idempotency_records_instance',
    );

    await queryRunner.query('ALTER TABLE "recruitment_external_references" ADD COLUMN IF NOT EXISTS "last_synced_by_extension_instance_id" uuid NULL');
    await this.addForeignKeyIfMissing(
      queryRunner,
      'recruitment_external_references',
      'last_synced_by_extension_instance_id',
      'extension_instances',
      'FK_recruitment_external_references_last_extension_instance',
    );

    await queryRunner.query('ALTER TABLE "facebook_publish_targets" ADD COLUMN IF NOT EXISTS "owner_extension_instance_id" uuid NULL');
    await queryRunner.query('ALTER TABLE "facebook_publish_targets" ADD COLUMN IF NOT EXISTS "last_verified_by_instance_id" uuid NULL');
    await queryRunner.query('ALTER TABLE "facebook_publish_targets" ADD COLUMN IF NOT EXISTS "facebook_account_label" varchar NULL');
    await this.addForeignKeyIfMissing(
      queryRunner,
      'facebook_publish_targets',
      'owner_extension_instance_id',
      'extension_instances',
      'FK_facebook_publish_targets_owner_extension_instance',
    );
    await this.addForeignKeyIfMissing(
      queryRunner,
      'facebook_publish_targets',
      'last_verified_by_instance_id',
      'extension_instances',
      'FK_facebook_publish_targets_last_verified_instance',
    );

    await queryRunner.query('ALTER TABLE "facebook_publish_histories" ADD COLUMN IF NOT EXISTS "extension_instance_id" uuid NULL');
    await this.addForeignKeyIfMissing(
      queryRunner,
      'facebook_publish_histories',
      'extension_instance_id',
      'extension_instances',
      'FK_facebook_publish_histories_extension_instance',
    );
  }

  private async addForeignKeyIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    referencedTableName: string,
    constraintName: string,
  ): Promise<void> {
    const existing = await queryRunner.query(
      `
        SELECT 1
        FROM pg_constraint constraint_row
        WHERE constraint_row.conrelid = $1::regclass
          AND constraint_row.contype = 'f'
          AND constraint_row.confrelid = $2::regclass
          AND constraint_row.conkey = ARRAY[
            (
              SELECT attribute.attnum
              FROM pg_attribute attribute
              WHERE attribute.attrelid = $1::regclass
                AND attribute.attname = $3
                AND NOT attribute.attisdropped
            )
          ]::smallint[]
          AND constraint_row.confdeltype = 'n'
        LIMIT 1
      `,
      [tableName, referencedTableName, columnName],
    );

    if (existing.length > 0) return;

    await queryRunner.query(
      `ALTER TABLE "${tableName}" ADD CONSTRAINT "${constraintName}" FOREIGN KEY ("${columnName}") REFERENCES "${referencedTableName}"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "facebook_publish_histories" DROP CONSTRAINT IF EXISTS "FK_facebook_publish_histories_extension_instance"');
    await queryRunner.query('ALTER TABLE "facebook_publish_histories" DROP COLUMN IF EXISTS "extension_instance_id"');

    await queryRunner.query('ALTER TABLE "facebook_publish_targets" DROP CONSTRAINT IF EXISTS "FK_facebook_publish_targets_last_verified_instance"');
    await queryRunner.query('ALTER TABLE "facebook_publish_targets" DROP CONSTRAINT IF EXISTS "FK_facebook_publish_targets_owner_extension_instance"');
    await queryRunner.query('ALTER TABLE "facebook_publish_targets" DROP COLUMN IF EXISTS "facebook_account_label"');
    await queryRunner.query('ALTER TABLE "facebook_publish_targets" DROP COLUMN IF EXISTS "last_verified_by_instance_id"');
    await queryRunner.query('ALTER TABLE "facebook_publish_targets" DROP COLUMN IF EXISTS "owner_extension_instance_id"');

    await queryRunner.query('ALTER TABLE "recruitment_external_references" DROP CONSTRAINT IF EXISTS "FK_recruitment_external_references_last_extension_instance"');
    await queryRunner.query('ALTER TABLE "recruitment_external_references" DROP COLUMN IF EXISTS "last_synced_by_extension_instance_id"');

    await queryRunner.query('ALTER TABLE "extension_idempotency_records" DROP CONSTRAINT IF EXISTS "FK_extension_idempotency_records_instance"');
    await queryRunner.query('ALTER TABLE "extension_idempotency_records" DROP COLUMN IF EXISTS "extension_instance_id"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_extension_task_events_instance_created"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_extension_task_events_task_created"');
    await queryRunner.query('DROP TABLE IF EXISTS "extension_task_events"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_extension_tasks_locked_until"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_extension_tasks_claimed_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_extension_tasks_assigned_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_extension_tasks_status_priority_created"');
    await queryRunner.query('DROP TABLE IF EXISTS "extension_tasks"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_extension_instances_last_seen_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_extension_instances_owner_status"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_extension_instances_owner_install"');
    await queryRunner.query('DROP TABLE IF EXISTS "extension_instances"');
  }
}
