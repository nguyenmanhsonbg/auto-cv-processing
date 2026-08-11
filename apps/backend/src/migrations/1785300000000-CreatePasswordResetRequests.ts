import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePasswordResetRequests1785300000000 implements MigrationInterface {
  name = 'CreatePasswordResetRequests1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "password_reset_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "otp_hash" character varying NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "verified_at" TIMESTAMP NULL,
        "reset_token_hash" character varying NULL,
        "reset_token_expires_at" TIMESTAMP NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_password_reset_requests_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query('CREATE INDEX IF NOT EXISTS "IDX_password_reset_requests_user_id" ON "password_reset_requests" ("user_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "password_reset_requests"');
  }
}
