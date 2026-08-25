import { UserRole } from '@interview-assistant/shared';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DashboardService } from './services/dashboard.service';
import { PipelineDashboardDto, PipelineDashboardQueryDto } from './dto/pipeline-dashboard.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('pipeline')
  @ApiOperation({ summary: 'Get recruitment pipeline dashboard data' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter end date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'recruiterId', required: false, description: 'Filter by HRBP/Recruiter ID' })
  @ApiQuery({ name: 'jobPostingId', required: false, description: 'Filter by job posting ID' })
  @ApiQuery({ name: 'channel', required: false, description: 'Filter by recruitment channel' })
  @ApiQuery({ name: 'ownerType', required: false, enum: ['HR', 'FREELANCER', 'INTERNAL'] })
  @ApiQuery({ name: 'ownerId', required: false, description: 'Filter by HR, freelancer, or internal owner ID' })
  async getPipelineDashboard(
    @Query() query: PipelineDashboardQueryDto,
  ): Promise<PipelineDashboardDto> {
    return this.dashboardService.getPipelineDashboard(query);
  }
}
