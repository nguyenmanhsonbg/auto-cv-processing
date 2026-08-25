import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInterviewCommittees1785800000000 implements MigrationInterface {
  name = 'CreateInterviewCommittees1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_committees" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "description" character varying,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_id" uuid NOT NULL,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_committees_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_committees_created_by" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_interview_committees_name"
      ON "interview_committees" ("name")
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "interview_committee_members" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "committee_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "created_at" timestamp without time zone NOT NULL DEFAULT now(),
        "updated_at" timestamp without time zone NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interview_committee_members_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_interview_committee_members_committee" FOREIGN KEY ("committee_id") REFERENCES "interview_committees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_interview_committee_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_interview_committee_members_committee_user"
      ON "interview_committee_members" ("committee_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_interview_committee_members_user"
      ON "interview_committee_members" ("user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "interview_evaluation_rounds"
      ADD COLUMN IF NOT EXISTS "committee_id" uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_interview_evaluation_rounds_committee_id"
      ON "interview_evaluation_rounds" ("committee_id")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_interview_evaluation_rounds_committee'
        ) THEN
          ALTER TABLE "interview_evaluation_rounds"
          ADD CONSTRAINT "FK_interview_evaluation_rounds_committee"
          FOREIGN KEY ("committee_id") REFERENCES "interview_committees"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "interview_evaluation_rounds" DROP CONSTRAINT IF EXISTS "FK_interview_evaluation_rounds_committee"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_interview_evaluation_rounds_committee_id"');
    await queryRunner.query('ALTER TABLE "interview_evaluation_rounds" DROP COLUMN IF EXISTS "committee_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_interview_committee_members_user"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_interview_committee_members_committee_user"');
    await queryRunner.query('DROP TABLE IF EXISTS "interview_committee_members"');
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_interview_committees_name"');
    await queryRunner.query('DROP TABLE IF EXISTS "interview_committees"');
  }
}
