import { MigrationInterface, QueryRunner } from 'typeorm';
import { ApplicationStatus, FormSessionStatus, HrReviewDecisionType } from '../recruitment-common';

/**
 * Migration script để backfill current_stage cho các application cũ
 * 
 * Logic xác định currentStage:
 * 1. hiredAt IS NOT NULL → HIRED
 * 2. hrReviewStatus = TALENT_POOL → TALENT_POOL  
 * 3. status = HR_REJECTED hoặc hrReviewStatus = REJECT → REJECTED
 * 4. AI_SCREENING_DONE hoặc WAITING_HR_REVIEW → SCREEN_CV
 * 5. formStatus = SUBMITTED → SCREEN_CV
 * 6. formStatus = SENT + form chưa expire → PRE_TEST_1
 * 7. formStatus = EXPIRED hoặc không có form → APPLIED
 */
export class BackfillRecruitmentPipelineStages1700000000000 implements MigrationInterface {
  name = 'BackfillRecruitmentPipelineStages1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========================================
    // 1. Xác định và update HIRED applications
    // ========================================
    // Applications có hrReviewStatus = APPROVE hoặc đã có hiredAt → HIRED
    await queryRunner.query(`
      UPDATE "applications"
      SET 
        "current_stage" = 'HIRED',
        "hired_at" = COALESCE("hired_at", "updated_at")
      WHERE 
        ("hr_review_status" = 'APPROVE' OR "hired_at" IS NOT NULL)
        AND "current_stage" IS NULL
    `);

    // ========================================
    // 2. Xác định TALENT_POOL
    // ========================================
    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'TALENT_POOL'
      WHERE 
        "hr_review_status" = 'TALENT_POOL'
        AND "current_stage" IS NULL
    `);

    // ========================================
    // 3. Xác định REJECTED
    // ========================================
    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'REJECTED'
      WHERE 
        ("status" = 'HR_REJECTED' OR "hr_review_status" = 'REJECT')
        AND "current_stage" IS NULL
    `);

    // ========================================
    // 4. Xác định SCREEN_CV
    // (AI screening done hoặc form submitted)
    // ========================================
    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'SCREEN_CV'
      WHERE 
        ("status" = 'AI_SCREENING_DONE' OR "status" = 'WAITING_HR_REVIEW' OR "form_status" = 'SUBMITTED')
        AND "current_stage" IS NULL
    `);

    // ========================================
    // 5. Xác định PRE_TEST_1
    // (Form sent + chưa expire + chưa submit)
    // ========================================
    // Update những application có form đã sent nhưng chưa expire
    await queryRunner.query(`
      UPDATE "applications" a
      SET "current_stage" = 'PRE_TEST_1'
      WHERE 
        "form_status" = 'SENT'
        AND "current_stage" IS NULL
        AND EXISTS (
          SELECT 1 FROM "form_sessions" fs
          WHERE fs."application_id" = a."id"
          AND fs."expires_at" > NOW()
        )
    `);

    // ========================================
    // 6. Xác định APPLIED
    // (Form expired hoặc không có form)
    // ========================================
    await queryRunner.query(`
      UPDATE "applications"
      SET "current_stage" = 'APPLIED'
      WHERE "current_stage" IS NULL
    `);

    // ========================================
    // 7. Log summary
    // ========================================
    const summary = await queryRunner.query(`
      SELECT "current_stage", COUNT(*) as count
      FROM "applications"
      WHERE "current_stage" IS NOT NULL
      GROUP BY "current_stage"
      ORDER BY count DESC
    `);
    
    console.log('Backfill Summary:', summary);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback - set all to NULL
    await queryRunner.query(`
      UPDATE "applications"
      SET 
        "current_stage" = NULL,
        "hired_at" = NULL,
        "offer_status" = NULL,
        "assigned_recruiter_id" = NULL
      WHERE "current_stage" IS NOT NULL
    `);
  }
}
