import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { ApplicationStage } from '../../recruitment-common';
import { AmisWebhookPayloadDto, AmisRecruitmentRoundTime } from '../dto/amis-webhook.dto';

@Injectable()
export class AmisSyncService {
  private readonly logger = new Logger(AmisSyncService.name);

  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
  ) {}

  /**
   * Handle webhook từ AMIS - bắt response khi user chuyển round
   * Payload format: response từ /api/RecruitmentDetail/updateRound
   */
  async handleAmisWebhook(payload: AmisWebhookPayloadDto): Promise<{ success: boolean; message: string; syncedCount: number }> {
    this.logger.log(`Received AMIS webhook: RecruitmentID=${payload.RecruitmentID}, Candidates=${payload.CandidateIDs}`);

    try {
      const results = await this.syncRoundChanges(payload);

      return {
        success: true,
        message: `Synced ${results.synced} candidates, ${results.errors} errors`,
        syncedCount: results.synced,
      };
    } catch (error) {
      this.logger.error(`Webhook error: ${(error as Error).message}`, (error as Error).stack);
      return {
        success: false,
        message: (error as Error).message,
        syncedCount: 0,
      };
    }
  }

  /**
   * Sync round changes từ AMIS payload
   */
  private async syncRoundChanges(payload: AmisWebhookPayloadDto): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    // Lấy danh sách candidate IDs
    const candidateIds = this.extractCandidateIds(payload);

    // Xử lý từng candidate
    for (const candidateIdStr of candidateIds) {
      try {
        const roundInfo = this.getRoundInfoForCandidate(payload, candidateIdStr);
        await this.syncCandidateStage(candidateIdStr, roundInfo);
        synced++;
      } catch (error) {
        this.logger.error(`Failed to sync candidate ${candidateIdStr}: ${(error as Error).message}`);
        errors++;
      }
    }

    this.logger.log(`Sync complete: ${synced} synced, ${errors} errors`);
    return { synced, errors };
  }

  /**
   * Extract candidate IDs từ payload
   */
  private extractCandidateIds(payload: AmisWebhookPayloadDto): string[] {
    // Ưu tiên RecruitmentRoundTimes (format mới)
    if (payload.RecruitmentRoundTimes && payload.RecruitmentRoundTimes.length > 0) {
      return payload.RecruitmentRoundTimes.map(rt => rt.CandidateID.toString());
    }

    // Fallback: CandidateIDs comma-separated
    if (payload.CandidateIDs) {
      return payload.CandidateIDs.split(',').map(id => id.trim());
    }

    // Fallback: Single CandidateID
    if (payload.CandidateID) {
      return [payload.CandidateID.toString()];
    }

    return [];
  }

  /**
   * Get round info cho 1 candidate từ payload
   */
  private getRoundInfoForCandidate(payload: AmisWebhookPayloadDto, candidateId: string): { roundId: number; roundName: string; sortOrder: number } {
    // Tìm trong RecruitmentRoundTimes
    if (payload.RecruitmentRoundTimes) {
      const roundTime = payload.RecruitmentRoundTimes.find(
        rt => rt.CandidateID.toString() === candidateId
      );

      if (roundTime) {
        return {
          roundId: roundTime.RecruitmentRoundID,
          roundName: roundTime.RecruitmentRoundName,
          sortOrder: roundTime.SortOrder,
        };
      }
    }

    // Fallback: dùng thông tin chung
    return {
      roundId: payload.RecruitmentRoundID ?? 0,
      roundName: payload.RecruitmentRoundName ?? '',
      sortOrder: payload.SortOrder ?? 0,
    };
  }

  /**
   * Sync stage cho 1 candidate
   */
  private async syncCandidateStage(candidateId: string, roundInfo: { roundId: number; roundName: string; sortOrder: number }): Promise<void> {
    // Map AMIS Round → Internal Stage
    const currentStage = this.mapAmisRoundToStage(roundInfo.roundId, roundInfo.sortOrder);

    if (!currentStage) {
      this.logger.warn(`Unknown AMIS round ID: ${roundInfo.roundId} (${roundInfo.roundName})`);
      return;
    }

    // Tìm application theo externalApplicationId
    let application = await this.applicationRepo.findOne({
      where: { externalApplicationId: candidateId },
    });

    // Fallback: tìm theo candidate relationship
    if (!application) {
      // Thử tìm application của candidate này
      // Bạn có thể cần điều chỉnh query này dựa trên cách bạn lưu AMIS candidate ID
      application = await this.applicationRepo
        .createQueryBuilder('app')
        .innerJoinAndSelect('app.candidate', 'candidate')
        .where('candidate.email LIKE :pattern', { pattern: `%${candidateId}%` })
        .orWhere('candidate.name LIKE :pattern', { pattern: `%${candidateId}%` })
        .getOne();
    }

    if (!application) {
      this.logger.debug(`Application not found for AMIS candidate: ${candidateId}`);
      return;
    }

    // Update stage nếu thay đổi
    if (application.currentStage !== currentStage) {
      const oldStage = application.currentStage;
      application.currentStage = currentStage;

      // Nếu là HIRED, set hiredAt
      if (currentStage === ApplicationStage.HIRED && !application.hiredAt) {
        application.hiredAt = new Date();
      }

      await this.applicationRepo.save(application);

      this.logger.log(
        `Updated stage: ${application.candidate?.name ?? candidateId}: ${oldStage ?? 'null'} → ${currentStage}`
      );
    }
  }

  /**
   * Map AMIS RecruitmentRoundID → Internal ApplicationStage
   */
  private mapAmisRoundToStage(roundId: number, sortOrder: number): ApplicationStage | null {
    // Round ID cố định từ AMIS (từ response bạn gửi)
    switch (roundId) {
      // Ứng tuyển
      case 514401:
      case 262917: // Có thể là ID khác
        return ApplicationStage.APPLIED;

      // Test trước pv1
      case 514911:
      case 262918:
        return ApplicationStage.PRE_TEST_1;

      // Screen CV
      case 514909:
        return ApplicationStage.SCREEN_CV;

      // Phỏng vấn vòng 1
      case 514910:
      case 262919:
        return ApplicationStage.INTERVIEW_1;

      // Test trước pv2
      case 514912:
      case 262920:
        return ApplicationStage.PRE_TEST_2;

      // Phỏng vấn vòng 2
      case 514913:
      case 262921:
        return ApplicationStage.INTERVIEW_2;

      // Offer
      case 514404:
      case 262922:
        return ApplicationStage.OFFER_PENDING;

      // Đã tuyển
      case 514405:
      case 262923:
        return ApplicationStage.HIRED;

      default:
        // Fallback theo SortOrder
        return this.mapBySortOrder(sortOrder);
    }
  }

  /**
   * Fallback: Map theo SortOrder
   */
  private mapBySortOrder(sortOrder: number): ApplicationStage | null {
    switch (sortOrder) {
      case 1: return ApplicationStage.APPLIED;
      case 2: return ApplicationStage.PRE_TEST_1;
      case 3: return ApplicationStage.SCREEN_CV;
      case 4: return ApplicationStage.INTERVIEW_1;
      case 5: return ApplicationStage.PRE_TEST_2;
      case 6: return ApplicationStage.INTERVIEW_2;
      case 8: return ApplicationStage.OFFER_PENDING;
      case 9: return ApplicationStage.HIRED;
      default: return null;
    }
  }
}
