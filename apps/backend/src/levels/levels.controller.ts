import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@interview-assistant/shared';
import { LevelsService } from './levels.service';

@ApiTags('Levels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('levels')
export class LevelsController {
  constructor(private readonly service: LevelsService) {}

  @Get()
  @ApiOperation({ summary: 'List levels (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, description: 'ACTIVE | INACTIVE' })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    const statuses = status ? status.split(',').filter(Boolean) : [];
    const isActive = statuses.length === 1 ? (statuses[0] === 'ACTIVE' ? true : statuses[0] === 'INACTIVE' ? false : undefined) : undefined;
    return this.service.findPaginated({
      page: page ? Number(page) : undefined, limit: limit ? Number(limit) : undefined,
      search, isActive, sortBy, sortOrder,
    });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a level (admin only)' })
  create(@Body() body: { name: string; displayName: string; orderIndex?: number }) {
    return this.service.create(body);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a level (admin only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string; displayName?: string; orderIndex?: number; isActive?: boolean },
  ) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a level (admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }

  @Post(':id/reset')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reset a level to its seed default (admin only)' })
  resetOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.resetOne(id);
  }
}
