import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OffersService } from './services/offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { OfferEntity } from './entities/offer.entity';

@ApiTags('Offers')
@ApiBearerAuth()
@Controller('applications/:applicationId/offers')
export class OffersController {
  constructor(private readonly service: OffersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new offer for an application' })
  async create(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateOfferDto,
    @Request() req: any,
  ): Promise<OfferEntity> {
    const hrUserId = req.user?.id ?? 'system';
    return this.service.create(applicationId, dto, hrUserId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all offers for an application' })
  async findByApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<OfferEntity[]> {
    return this.service.findByApplication(applicationId);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest offer for an application' })
  async findLatest(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<OfferEntity | null> {
    return this.service.findLatestByApplication(applicationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific offer' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<OfferEntity> {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an offer' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfferDto,
  ): Promise<OfferEntity> {
    return this.service.update(id, dto);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send an offer to candidate' })
  async sendOffer(@Param('id', ParseUUIDPipe) id: string): Promise<OfferEntity> {
    return this.service.sendOffer(id);
  }

  @Post(':id/revise')
  @ApiOperation({ summary: 'Revise an offer (creates new version)' })
  async reviseOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOfferDto,
  ): Promise<OfferEntity> {
    return this.service.reviseOffer(id, dto);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept an offer (marks application as HIRED)' })
  async acceptOffer(@Param('id', ParseUUIDPipe) id: string): Promise<OfferEntity> {
    return this.service.acceptOffer(id);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject an offer by candidate' })
  async rejectOffer(@Param('id', ParseUUIDPipe) id: string): Promise<OfferEntity> {
    return this.service.rejectOffer(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an offer' })
  async cancelOffer(@Param('id', ParseUUIDPipe) id: string): Promise<OfferEntity> {
    return this.service.cancelOffer(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a pending offer' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.delete(id);
  }
}
