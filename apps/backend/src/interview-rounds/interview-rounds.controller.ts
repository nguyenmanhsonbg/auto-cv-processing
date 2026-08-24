import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InterviewRoundsService } from './services/interview-rounds.service';
import { CreateInterviewRoundDto } from './dto/create-interview-round.dto';
import { UpdateInterviewRoundDto } from './dto/update-interview-round.dto';
import { InterviewRoundEntity } from './entities/interview-round.entity';

@ApiTags('Interview Rounds')
@ApiBearerAuth()
@Controller('applications/:applicationId/interview-rounds')
export class InterviewRoundsController {
  constructor(private readonly service: InterviewRoundsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new interview round for an application' })
  async create(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateInterviewRoundDto,
  ): Promise<InterviewRoundEntity> {
    return this.service.create(applicationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all interview rounds for an application' })
  async findByApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<InterviewRoundEntity[]> {
    return this.service.findByApplication(applicationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific interview round' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<InterviewRoundEntity> {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an interview round' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInterviewRoundDto,
  ): Promise<InterviewRoundEntity> {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an interview round' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.delete(id);
  }
}
