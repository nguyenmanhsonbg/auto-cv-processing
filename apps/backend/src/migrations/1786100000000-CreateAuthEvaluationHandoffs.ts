import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthEvaluationHandoffs1786100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auth_evaluation_handoffs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "application_id" uuid NOT NULL,
        "token_hash" varchar(128) NOT NULL,
        "expires_at" timestamp NOT NULL,
        "used_at" timestamp NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_evaluation_handoffs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auth_evaluation_handoffs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_auth_evaluation_handoffs_token_hash"
      ON "auth_evaluation_handoffs" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_auth_evaluation_handoffs_expires_at"
      ON "auth_evaluation_handoffs" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_auth_evaluation_handoffs_expires_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_auth_evaluation_handoffs_token_hash"');
    await queryRunner.query('DROP TABLE IF EXISTS "auth_evaluation_handoffs"');
  }
}
