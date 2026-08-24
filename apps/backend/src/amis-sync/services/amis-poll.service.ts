import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { ApplicationStage } from '../../recruitment-common';
import axios, { AxiosInstance } from 'axios';

interface AmisApiConfig {
  baseUrl: string;
  username: string;
  password: string;
  recruitmentRoundId: string; // ID của JD trên AMIS
}

interface AmisRoundTemplate {
  RecruitmentRoundID: number;
  RecruitmentRoundName: string;
  RoundTypeID: number;
  SortOrder: number;
}

interface AmisCandidate {
  CandidateID: string | number;
  CandidateName: string;
  Email: string;
  Phone: string;
  RecruitmentRoundID: number;
  RecruitmentRoundName: string;
  // Thêm các field khác nếu có trong response
  Status?: number;
  Result?: string;
  [key: string]: any;
}

interface AmisApiResponse<T> {
  Success: boolean;
  Data: T;
  Code: number;
  Message?: string;
}

@Injectable()
export class AmisPollService {
  private readonly logger = new Logger(AmisPollService.name);
  private axiosInstance: AxiosInstance | null = null;
  private isLoggedIn = false;

  constructor(
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
  ) {}

  /**
   * Khởi tạo axios instance với auth AMIS
   * Cần gọi API login trước để lấy token/cookie
   */
  private async initAmisClient(): Promise<AxiosInstance | null> {
    const config = this.getAmisConfig();
    if (!config) {
      this.logger.warn('AMIS config not found, skipping poll');
      return null;
    }

    if (this.axiosInstance && this.isLoggedIn) {
      return this.axiosInstance;
    }

    try {
      const client = axios.create({
        baseURL: config.baseUrl,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Login to AMIS
      await client.post('/api/auth/login', {
        username: config.username,
        password: config.password,
      });

      this.axiosInstance = client;
      this.isLoggedIn = true;
      this.logger.log('AMIS login successful');

      return client;
    } catch (error) {
      this.logger.error(`AMIS login failed: ${(error as Error).message}`);
      return null;
    }
  }

  private getAmisConfig(): AmisApiConfig | null {
    const baseUrl = process.env.AMIS_API_BASE_URL;
    const username = process.env.AMIS_API_USERNAME;
    const password = process.env.AMIS_API_PASSWORD;
    const recruitmentRoundId = process.env.AMIS_RECRUITMENT_ROUND_ID;

    if (!baseUrl || !username || !password || !recruitmentRoundId) {
      return null;
    }

    return { baseUrl, username, password, recruitmentRoundId };
  }

  /**
   * Cron job: Chạy mỗi 5 phút
   * Lấy danh sách ứng viên từ AMIS → Map round → Update currentStage
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async pollAmisAndSync() {
    this.logger.log('Starting AMIS poll...');
    
    try {
      await this.syncApplicationsFromAmis();
    } catch (error) {
      this.logger.error(`AMIS poll failed: ${(error as Error).message}`, (error as Error).stack);
    }
  }

  /**
   * Sync tất cả applications từ AMIS
   */
  async syncApplicationsFromAmis(): Promise<{ synced: number; errors: number }> {
    const config = this.getAmisConfig();
    if (!config) {
      this.logger.warn('AMIS config not configured');
      return { synced: 0, errors: 0 };
    }

    const client = await this.initAmisClient();
    if (!client) {
      return { synced: 0, errors: 1 };
    }

    try {
      // 1. Lấy danh sách round templates (để map tên)
      const roundTemplates = await this.getRoundTemplates(client);

      // 2. Lấy danh sách ứng viên từ AMIS
      const amisCandidates = await this.getCandidatesByRound(client, config.recruitmentRoundId);

      this.logger.log(`Found ${amisCandidates.length} candidates in AMIS`);

      // 3. Sync từng candidate
      let synced = 0;
      let errors = 0;

      for (const candidate of amisCandidates) {
        try {
          await this.syncCandidateStage(candidate, roundTemplates);
          synced++;
        } catch (error) {
          this.logger.error(`Failed to sync candidate ${candidate.CandidateID}: ${(error as Error).message}`);
          errors++;
        }
      }

      this.logger.log(`AMIS sync completed: ${synced} synced, ${errors} errors`);
      return { synced, errors };

    } catch (error) {
      this.logger.error(`AMIS sync error: ${(error as Error).message}`, (error as Error).stack);
      // Reset login state để thử lại lần sau
      this.isLoggedIn = false;
      throw error;
    }
  }

  /**
   * Lấy danh sách round templates từ AMIS
   */
  private async getRoundTemplates(client: AxiosInstance): Promise<Map<number, AmisRoundTemplate>> {
    try {
      const response = await client.get<AmisApiResponse<AmisRoundTemplate[]>>(
        '/api/RecruitmentRoundTemplate/getAllRecruitmentRound',
      );

      const roundMap = new Map<number, AmisRoundTemplate>();
      if (response.data.Success && response.data.Data) {
        for (const round of response.data.Data) {
          roundMap.set(round.RecruitmentRoundID, round);
        }
      }

      return roundMap;
    } catch (error) {
      this.logger.error(`Failed to get round templates: ${(error as Error).message}`);
      return new Map();
    }
  }

  /**
   * Lấy danh sách ứng viên theo round
   */
  private async getCandidatesByRound(client: AxiosInstance, recruitmentRoundId: string): Promise<AmisCandidate[]> {
    try {
      // API: /api/recruitment/v2/paging_candidate/{recruitmentRoundId}
      const response = await client.get<AmisApiResponse<AmisCandidate[]>>(
        `/api/recruitment/v2/paging_candidate/${recruitmentRoundId}`,
        {
          params: {
            recruitmentRoundID: recruitmentRoundId,
          },
        },
      );

      if (response.data.Success && response.data.Data) {
        return Array.isArray(response.data.Data) 
          ? response.data.Data 
          : [response.data.Data];
      }

      return [];
    } catch (error) {
      this.logger.error(`Failed to get candidates: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Sync stage cho 1 candidate từ AMIS
   */
  private async syncCandidateStage(
    candidate: AmisCandidate,
    roundTemplates: Map<number, AmisRoundTemplate>,
  ): Promise<void> {
    const { RecruitmentRoundID, CandidateID, CandidateName } = candidate;

    // Map AMIS round → Internal stage
    const currentStage = this.mapAmisRoundToStage(RecruitmentRoundID, roundTemplates);

    if (!currentStage) {
      this.logger.warn(`Unknown AMIS round ${RecruitmentRoundID} for candidate ${CandidateID}`);
      return;
    }

    // Tìm application theo externalApplicationId
    const application = await this.applicationRepo.findOne({
      where: { externalApplicationId: CandidateID.toString() },
    });

    if (!application) {
      // Thử tìm theo email hoặc tên
      const byEmail = await this.applicationRepo.findOne({
        where: { candidate: { email: candidate.Email } as any },
        relations: ['candidate'],
      });

      if (byEmail && byEmail.currentStage !== currentStage) {
        await this.applicationRepo.update(byEmail.id, { currentStage });
        this.logger.log(`Updated stage for ${CandidateName}: ${byEmail.currentStage} → ${currentStage}`);
      } else {
        this.logger.debug(`Application not found for AMIS candidate ${CandidateID}`);
      }
      return;
    }

    // Update nếu stage thay đổi
    if (application.currentStage !== currentStage) {
      await this.applicationRepo.update(application.id, { currentStage });
      this.logger.log(`Updated stage for ${CandidateName}: ${application.currentStage} → ${currentStage}`);
    }
  }

  /**
   * Map AMIS RecruitmentRoundID → Internal ApplicationStage
   * Dựa trên SortOrder và RoundType từ API
   */
  private mapAmisRoundToStage(
    recruitmentRoundId: number,
    roundTemplates: Map<number, AmisRoundTemplate>,
  ): ApplicationStage | null {
    const round = roundTemplates.get(recruitmentRoundId);

    if (!round) {
      // Fallback: map theo ID cố định (từ response bạn gửi)
      return this.mapByRoundIdFallback(recruitmentRoundId);
    }

    // Map theo RoundType và SortOrder
    switch (round.SortOrder) {
      case 1:
        return ApplicationStage.APPLIED;
      case 2:
        return ApplicationStage.PRE_TEST_1;
      case 3:
        return ApplicationStage.SCREEN_CV;
      case 4:
        return ApplicationStage.INTERVIEW_1;
      case 5:
        return ApplicationStage.PRE_TEST_2;
      case 6:
        return ApplicationStage.INTERVIEW_2;
      case 8:
        return ApplicationStage.OFFER_PENDING;
      case 9:
        return ApplicationStage.HIRED;
      default:
        return null;
    }
  }

  /**
   * Fallback map theo round ID cố định (từ response mẫu bạn gửi)
   */
  private mapByRoundIdFallback(recruitmentRoundId: number): ApplicationStage | null {
    switch (recruitmentRoundId) {
      case 514401: // Ứng tuyển
        return ApplicationStage.APPLIED;
      case 514911: // Test trước pv1
        return ApplicationStage.PRE_TEST_1;
      case 514909: // Screen CV
        return ApplicationStage.SCREEN_CV;
      case 514910: // Phỏng vấn vòng 1
        return ApplicationStage.INTERVIEW_1;
      case 514912: // Test trước pv2
        return ApplicationStage.PRE_TEST_2;
      case 514913: // Phỏng vấn vòng 2
        return ApplicationStage.INTERVIEW_2;
      case 514404: // Offer
        return ApplicationStage.OFFER_PENDING;
      case 514405: // Đã tuyển
        return ApplicationStage.HIRED;
      default:
        return null;
    }
  }

  /**
   * Manual trigger sync (có thể gọi từ API)
   */
  async triggerSync(): Promise<{ synced: number; errors: number }> {
    this.isLoggedIn = false; // Reset login state
    return this.syncApplicationsFromAmis();
  }
}
