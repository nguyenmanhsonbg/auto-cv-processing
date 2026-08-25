import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfferEntity } from '../entities/offer.entity';
import { ApplicationEntity } from '../../applications/entities/application.entity';
import { ApplicationStage, OfferStatus } from '../../recruitment-common';
import { CreateOfferDto } from '../dto/create-offer.dto';
import { UpdateOfferDto } from '../dto/update-offer.dto';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(OfferEntity)
    private readonly offerRepo: Repository<OfferEntity>,
    @InjectRepository(ApplicationEntity)
    private readonly applicationRepo: Repository<ApplicationEntity>,
  ) {}

  async create(applicationId: string, dto: CreateOfferDto, hrUserId: string): Promise<OfferEntity> {
    // Verify application exists
    const application = await this.applicationRepo.findOne({ where: { id: applicationId } });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Get latest offer version for this application
    const latestOffer = await this.offerRepo.findOne({
      where: { applicationId },
      order: { version: 'DESC' },
    });
    const nextVersion = latestOffer ? latestOffer.version + 1 : 1;

    // Check if there's already a pending/sent offer
    if (latestOffer) {
      const activeStatuses = [OfferStatus.PENDING, OfferStatus.SENT, OfferStatus.REVISED];
      if (activeStatuses.includes(latestOffer.status as OfferStatus)) {
        throw new BadRequestException(
          'There is already an active offer for this application. Please update or cancel the existing one.',
        );
      }
    }

    const offer = this.offerRepo.create({
      applicationId,
      version: nextVersion,
      status: OfferStatus.PENDING,
      jobTitle: dto.jobTitle,
      department: dto.department ?? null,
      level: dto.level ?? null,
      grossSalary: dto.grossSalary ?? null,
      startDate: dto.startDate ?? null,
      contractType: dto.contractType ?? null,
      workLocation: dto.workLocation ?? null,
      benefits: dto.benefits ? JSON.parse(JSON.stringify(dto.benefits)) : null,
      notes: dto.notes ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      externalOfferId: dto.externalOfferId ?? null,
      hrCreatedById: hrUserId,
    });

    const savedOffer = await this.offerRepo.save(offer);

    // Update application stage to OFFER_PENDING
    await this.applicationRepo.update(applicationId, {
      currentStage: ApplicationStage.OFFER_PENDING,
      offerStatus: OfferStatus.PENDING,
    });

    return savedOffer;
  }

  async findByApplication(applicationId: string): Promise<OfferEntity[]> {
    return this.offerRepo.find({
      where: { applicationId },
      order: { version: 'ASC' },
      relations: ['hrCreatedBy'],
    });
  }

  async findLatestByApplication(applicationId: string): Promise<OfferEntity | null> {
    return this.offerRepo.findOne({
      where: { applicationId },
      order: { version: 'DESC' },
      relations: ['hrCreatedBy'],
    });
  }

  async findOne(id: string): Promise<OfferEntity> {
    const offer = await this.offerRepo.findOne({
      where: { id },
      relations: ['application', 'hrCreatedBy', 'previousOffer'],
    });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }
    return offer;
  }

  async update(id: string, dto: UpdateOfferDto): Promise<OfferEntity> {
    const offer = await this.findOne(id);

    // Update fields
    if (dto.status !== undefined) {
      offer.status = dto.status;
    }
    if (dto.jobTitle !== undefined) offer.jobTitle = dto.jobTitle;
    if (dto.department !== undefined) offer.department = dto.department;
    if (dto.level !== undefined) offer.level = dto.level;
    if (dto.grossSalary !== undefined) offer.grossSalary = dto.grossSalary;
    if (dto.startDate !== undefined) offer.startDate = dto.startDate;
    if (dto.contractType !== undefined) offer.contractType = dto.contractType;
    if (dto.workLocation !== undefined) offer.workLocation = dto.workLocation;
    if (dto.benefits !== undefined) offer.benefits = dto.benefits as any;
    if (dto.notes !== undefined) offer.notes = dto.notes;
    if (dto.sentAt !== undefined) offer.sentAt = new Date(dto.sentAt);
    if (dto.respondedAt !== undefined) offer.respondedAt = new Date(dto.respondedAt);
    if (dto.expiresAt !== undefined) offer.expiresAt = new Date(dto.expiresAt);

    const savedOffer = await this.offerRepo.save(offer);

    // Update application stage based on status
    await this.updateApplicationStage(offer.applicationId, offer.status);

    return savedOffer;
  }

  async sendOffer(id: string): Promise<OfferEntity> {
    const offer = await this.findOne(id);

    if (offer.status !== OfferStatus.PENDING && offer.status !== OfferStatus.REVISED) {
      throw new BadRequestException('Only pending or revised offers can be sent');
    }

    offer.status = OfferStatus.SENT;
    offer.sentAt = new Date();
    if (!offer.expiresAt) {
      // Default expiration: 7 days
      offer.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const savedOffer = await this.offerRepo.save(offer);

    // Update application
    await this.applicationRepo.update(offer.applicationId, {
      currentStage: ApplicationStage.OFFER_SENT,
      offerStatus: OfferStatus.SENT,
    });

    return savedOffer;
  }

  async reviseOffer(id: string, dto: CreateOfferDto): Promise<OfferEntity> {
    const oldOffer = await this.findOne(id);

    if (oldOffer.status === OfferStatus.ACCEPTED) {
      throw new BadRequestException('Cannot revise an accepted offer');
    }

    // Create new offer version
    const newOffer = this.offerRepo.create({
      applicationId: oldOffer.applicationId,
      version: oldOffer.version + 1,
      previousOfferId: oldOffer.id,
      status: OfferStatus.REVISED,
      jobTitle: dto.jobTitle ?? oldOffer.jobTitle,
      department: dto.department ?? oldOffer.department,
      level: dto.level ?? oldOffer.level,
      grossSalary: dto.grossSalary ?? oldOffer.grossSalary,
      startDate: dto.startDate ?? oldOffer.startDate,
      contractType: dto.contractType ?? oldOffer.contractType,
      workLocation: dto.workLocation ?? oldOffer.workLocation,
      benefits: dto.benefits ? JSON.parse(JSON.stringify(dto.benefits)) : oldOffer.benefits,
      notes: dto.notes ?? oldOffer.notes,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      externalOfferId: oldOffer.externalOfferId,
      hrCreatedById: oldOffer.hrCreatedById,
    });

    const savedOffer = await this.offerRepo.save(newOffer);

    // Mark old offer as cancelled
    oldOffer.status = OfferStatus.CANCELLED;
    await this.offerRepo.save(oldOffer);

    // Update application
    await this.applicationRepo.update(oldOffer.applicationId, {
      currentStage: ApplicationStage.OFFER_REVISED,
      offerStatus: OfferStatus.REVISED,
    });

    return savedOffer;
  }

  async acceptOffer(id: string): Promise<OfferEntity> {
    const offer = await this.findOne(id);

    if (offer.status !== OfferStatus.SENT) {
      throw new BadRequestException('Only sent offers can be accepted');
    }

    offer.status = OfferStatus.ACCEPTED;
    offer.respondedAt = new Date();

    const savedOffer = await this.offerRepo.save(offer);

    // Update application - mark as HIRED
    await this.applicationRepo.update(offer.applicationId, {
      currentStage: ApplicationStage.HIRED,
      offerStatus: OfferStatus.ACCEPTED,
      hiredAt: new Date(),
    });

    return savedOffer;
  }

  async rejectOffer(id: string): Promise<OfferEntity> {
    const offer = await this.findOne(id);

    if (offer.status !== OfferStatus.SENT) {
      throw new BadRequestException('Only sent offers can be rejected');
    }

    offer.status = OfferStatus.REJECTED_BY_CANDIDATE;
    offer.respondedAt = new Date();

    const savedOffer = await this.offerRepo.save(offer);

    // Update application
    await this.applicationRepo.update(offer.applicationId, {
      currentStage: ApplicationStage.REJECTED,
      offerStatus: OfferStatus.REJECTED_BY_CANDIDATE,
    });

    return savedOffer;
  }

  async cancelOffer(id: string): Promise<OfferEntity> {
    const offer = await this.findOne(id);

    offer.status = OfferStatus.CANCELLED;

    const savedOffer = await this.offerRepo.save(offer);

    // Update application
    await this.applicationRepo.update(offer.applicationId, {
      offerStatus: OfferStatus.CANCELLED,
    });

    return savedOffer;
  }

  private async updateApplicationStage(applicationId: string, status: OfferStatus): Promise<void> {
    let stage: ApplicationStage | null = null;

    switch (status) {
      case OfferStatus.PENDING:
        stage = ApplicationStage.OFFER_PENDING;
        break;
      case OfferStatus.SENT:
        stage = ApplicationStage.OFFER_SENT;
        break;
      case OfferStatus.REVISED:
        stage = ApplicationStage.OFFER_REVISED;
        break;
      case OfferStatus.ACCEPTED:
        stage = ApplicationStage.HIRED;
        break;
      case OfferStatus.REJECTED_BY_CANDIDATE:
      case OfferStatus.CANCELLED:
      case OfferStatus.EXPIRED:
        stage = ApplicationStage.REJECTED;
        break;
    }

    if (stage) {
      await this.applicationRepo.update(applicationId, {
        currentStage: stage,
        offerStatus: status,
      });
    }
  }

  async delete(id: string): Promise<void> {
    const offer = await this.findOne(id);

    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('Only pending offers can be deleted');
    }

    await this.offerRepo.remove(offer);
  }
}
