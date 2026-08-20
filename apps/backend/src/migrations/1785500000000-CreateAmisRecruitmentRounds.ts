import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAmisRecruitmentRounds1785500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "amis_recruitment_rounds" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_system" character varying NOT NULL DEFAULT 'AMIS',
        "amis_recruitment_id" character varying NOT NULL,
        "amis_round_id" character varying NOT NULL,
        "round_name" character varying NOT NULL,
        "sort_order" integer NOT NULL,
        "round_type" integer,
        "round_type_id" character varying,
        "color" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "source_url" text,
        "last_synced_at" timestamp without time zone NOT NULL,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_amis_recruitment_rounds_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_amis_recruitment_rounds_source_round"
      ON "amis_recruitment_rounds" ("source_system", "amis_recruitment_id", "amis_round_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_amis_recruitment_rounds_recruitment"
      ON "amis_recruitment_rounds" ("source_system", "amis_recruitment_id", "is_active", "sort_order")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_amis_recruitment_rounds_recruitment"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_amis_recruitment_rounds_source_round"');
    await queryRunner.query('DROP TABLE IF EXISTS "amis_recruitment_rounds"');
  }
}
