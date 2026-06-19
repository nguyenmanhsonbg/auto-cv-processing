import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSchedulingFieldsToSession1776308195039 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum type for meeting platform
        await queryRunner.query(`
            CREATE TYPE "meetingplatform_enum" AS ENUM ('MS_TEAMS', 'GOOGLE_MEET')
        `);

        // Add scheduledAt column
        await queryRunner.query(`
            ALTER TABLE "interview_sessions"
            ADD COLUMN "scheduledAt" TIMESTAMP NULL
        `);

        // Add meetingPlatform column
        await queryRunner.query(`
            ALTER TABLE "interview_sessions"
            ADD COLUMN "meetingPlatform" "meetingplatform_enum" NULL
        `);

        // Add meetingLink column
        await queryRunner.query(`
            ALTER TABLE "interview_sessions"
            ADD COLUMN "meetingLink" VARCHAR NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop columns in reverse order
        await queryRunner.query(`
            ALTER TABLE "interview_sessions"
            DROP COLUMN "meetingLink"
        `);

        await queryRunner.query(`
            ALTER TABLE "interview_sessions"
            DROP COLUMN "meetingPlatform"
        `);

        await queryRunner.query(`
            ALTER TABLE "interview_sessions"
            DROP COLUMN "scheduledAt"
        `);

        // Drop enum type
        await queryRunner.query(`
            DROP TYPE "meetingplatform_enum"
        `);
    }

}
