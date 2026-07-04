import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthRefreshTokens1782980000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.assertRequiredTables(queryRunner, ['users']);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "auth_refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar(128) NOT NULL,
        "expires_at" timestamp NOT NULL,
        "revoked_at" timestamp NULL,
        "replaced_by_token_hash" varchar(128) NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auth_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_auth_refresh_tokens_token_hash" ON "auth_refresh_tokens" ("token_hash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_auth_refresh_tokens_user_id" ON "auth_refresh_tokens" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_auth_refresh_tokens_expires_at" ON "auth_refresh_tokens" ("expires_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "auth_refresh_tokens"`);
  }

  private async assertRequiredTables(queryRunner: QueryRunner, tableNames: string[]): Promise<void> {
    const rows = await queryRunner.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
      `,
      [tableNames],
    );
    const existing = new Set(rows.map((row: { table_name: string }) => row.table_name));
    const missing = tableNames.filter((tableName) => !existing.has(tableName));

    if (missing.length > 0) {
      throw new Error(
        `Cannot create auth refresh tokens table because required table(s) are missing: ${missing.join(', ')}`,
      );
    }
  }
}
