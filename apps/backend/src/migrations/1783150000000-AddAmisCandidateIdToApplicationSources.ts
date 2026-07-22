import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmisCandidateIdToApplicationSources1783150000000 implements MigrationInterface {
  name = 'AddAmisCandidateIdToApplicationSources1783150000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "application_sources" ADD COLUMN IF NOT EXISTS "amis_candidate_id" varchar NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "application_sources" DROP COLUMN IF EXISTS "amis_candidate_id"',
    );
  }
}
