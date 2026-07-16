import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmisCandidateIdToApplicationSources1783310000000 implements MigrationInterface {
  name = 'AddAmisCandidateIdToApplicationSources1783310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "application_sources"
      ADD COLUMN IF NOT EXISTS "amis_candidate_id" varchar NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_application_sources_amis_candidate"
      ON "application_sources" ("amis_candidate_id")
      WHERE "amis_candidate_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_application_sources_amis_candidate"`);
    await queryRunner.query(`
      ALTER TABLE "application_sources"
      DROP COLUMN IF EXISTS "amis_candidate_id"
    `);
  }
}
