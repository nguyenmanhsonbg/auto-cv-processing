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
import { CategoriesService } from './categories.service';

@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  // ── Categories ──

  @Get('categories')
  @ApiQuery({ name: 'position', required: false })
  @ApiOperation({ summary: 'List all categories, optionally filtered by position name' })
  findAllCategories(@Query('position') position?: string) {
    return this.service.findAllCategories(position);
  }

  @Post('categories')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a category (admin only)' })
  createCategory(@Body() body: { name: string; displayName: string; description?: string; orderIndex?: number; positions?: string[] | null }) {
    return this.service.createCategory(body);
  }

  @Put('categories/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a category (admin only)' })
  updateCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string; displayName?: string; description?: string; orderIndex?: number; positions?: string[] | null },
  ) {
    return this.service.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a category and its subcategories (admin only)' })
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeCategory(id);
  }

  @Post('categories/:id/reset')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reset a category to its seed default (admin only)' })
  resetCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.resetCategory(id);
  }

  @Post('categories/seed')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Seed default categories and subcategories (admin only)' })
  seed() {
    return this.service.seed();
  }

  // ── SubCategories ──

  @Get('sub-categories')
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiOperation({ summary: 'List subcategories, optionally filtered by categoryId' })
  findAllSubCategories(@Query('categoryId') categoryId?: string) {
    return this.service.findAllSubCategories(categoryId);
  }

  @Post('sub-categories')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a subcategory (admin only)' })
  createSubCategory(@Body() body: { categoryId: string; name: string; orderIndex?: number; competencyType?: string }) {
    return this.service.createSubCategory(body);
  }

  @Put('sub-categories/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a subcategory (admin only)' })
  updateSubCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string; orderIndex?: number; categoryId?: string; competencyType?: string },
  ) {
    return this.service.updateSubCategory(id, body);
  }

  @Delete('sub-categories/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a subcategory (admin only)' })
  removeSubCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeSubCategory(id);
  }

  @Post('sub-categories/:id/reset')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reset a subcategory to its seed default (admin only)' })
  resetSubCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.resetSubCategory(id);
  }
}
