import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './services/dashboard.service';
import { PipelineDashboardDto, PipelineDashboardQueryDto } from './dto/pipeline-dashboard.dto';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('pipeline')
  @ApiOperation({ summary: 'Get recruitment pipeline dashboard data' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Filter start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Filter end date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'recruiterId', required: false, description: 'Filter by HRBP/Recruiter ID' })
  @ApiQuery({ name: 'jobPostingId', required: false, description: 'Filter by job posting ID' })
  async getPipelineDashboard(
    @Query() query: PipelineDashboardQueryDto,
  ): Promise<PipelineDashboardDto> {
    return this.dashboardService.getPipelineDashboard(query);
  }
}
