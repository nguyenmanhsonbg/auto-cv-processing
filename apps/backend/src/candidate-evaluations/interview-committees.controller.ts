import { UserRole } from '@interview-assistant/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateInterviewCommitteeDto } from './dto/create-interview-committee.dto';
import { UpdateInterviewCommitteeDto } from './dto/update-interview-committee.dto';
import { UpdateInterviewCommitteeMembersDto } from './dto/update-interview-committee-members.dto';
import { CommitteeActor, InterviewCommitteesService } from './interview-committees.service';

type AuthenticatedCommitteeRequest = Request & { user: CommitteeActor };

@ApiTags('Interview committees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('interview-committees')
export class InterviewCommitteesController {
  constructor(private readonly committeesService: InterviewCommitteesService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.HR)
  @ApiOperation({ summary: 'List interview committees and their HĐCM members' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  async list(@Query('activeOnly') activeOnly?: string) {
    return this.committeesService.list(activeOnly === 'true');
  }

  @Get('available-users')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List accounts eligible for HĐCM committee membership' })
  async listAssignableUsers() {
    return this.committeesService.listAssignableUsers();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create an interview committee' })
  async create(@Body() dto: CreateInterviewCommitteeDto, @Req() request: AuthenticatedCommitteeRequest) {
    return this.committeesService.create(dto, request.user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update an interview committee' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInterviewCommitteeDto) {
    return this.committeesService.update(id, dto);
  }

  @Put(':id/members')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Replace interview committee members' })
  async replaceMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInterviewCommitteeMembersDto,
  ) {
    return this.committeesService.replaceMembers(id, dto);
  }
}
