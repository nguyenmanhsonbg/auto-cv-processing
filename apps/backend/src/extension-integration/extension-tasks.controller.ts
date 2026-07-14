import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import {
  CompleteExtensionTaskDto,
  CreateExtensionTaskDto,
  ExtensionTaskProgressDto,
  ExtensionTaskResponseDto,
  FailExtensionTaskDto,
} from './dto';
import { ExtensionTasksService } from './extension-tasks.service';

type HeaderValue = string | string[] | undefined;

interface ExtensionTaskRequest {
  user: {
    id: string;
    email?: string;
    role: UserRole;
  };
}

@ApiTags('Extension Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('extension/tasks')
@ApiErrorResponses([400, 401, 403, 500])
export class ExtensionTasksController {
  constructor(private readonly extensionTasksService: ExtensionTasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a task for an extension instance or extension pool' })
  @ApiBody({ type: CreateExtensionTaskDto })
  @ApiResponse({ status: 201, type: ExtensionTaskResponseDto })
  async create(
    @Body() dto: CreateExtensionTaskDto,
    @Request() req: ExtensionTaskRequest,
  ) {
    const task = await this.extensionTasksService.create({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      dto,
    });

    return this.envelope(this.extensionTasksService.toResponse(task));
  }

  @Get('next')
  @ApiOperation({ summary: 'Claim the next pending task available to the current extension instance' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: true })
  @ApiResponse({ status: 200, type: ExtensionTaskResponseDto })
  async next(
    @Request() req: ExtensionTaskRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const task = await this.extensionTasksService.claimNext({
      ownerUserId: req.user.id,
      extensionInstanceId: this.requireHeader(extensionInstanceId),
    });

    return this.envelope(this.extensionTasksService.toResponse(task));
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Mark a claimed extension task as running' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: true })
  async start(
    @Param('id') id: string,
    @Request() req: ExtensionTaskRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const task = await this.extensionTasksService.start({
      ownerUserId: req.user.id,
      extensionInstanceId: this.requireHeader(extensionInstanceId),
      taskId: id,
    });

    return this.envelope(this.extensionTasksService.toResponse(task));
  }

  @Post(':id/progress')
  @ApiOperation({ summary: 'Append task progress from an extension instance' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: true })
  @ApiBody({ type: ExtensionTaskProgressDto })
  async progress(
    @Param('id') id: string,
    @Body() dto: ExtensionTaskProgressDto,
    @Request() req: ExtensionTaskRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const task = await this.extensionTasksService.progress({
      ownerUserId: req.user.id,
      extensionInstanceId: this.requireHeader(extensionInstanceId),
      taskId: id,
      dto,
    });

    return this.envelope(this.extensionTasksService.toResponse(task));
  }

  @Post(':id/complete')
  @ApiOperation({ summary: 'Complete a task claimed by the current extension instance' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: true })
  @ApiBody({ type: CompleteExtensionTaskDto })
  async complete(
    @Param('id') id: string,
    @Body() dto: CompleteExtensionTaskDto,
    @Request() req: ExtensionTaskRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const task = await this.extensionTasksService.complete({
      ownerUserId: req.user.id,
      extensionInstanceId: this.requireHeader(extensionInstanceId),
      taskId: id,
      dto,
    });

    return this.envelope(this.extensionTasksService.toResponse(task));
  }

  @Post(':id/fail')
  @ApiOperation({ summary: 'Fail a task claimed by the current extension instance' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: true })
  @ApiBody({ type: FailExtensionTaskDto })
  async fail(
    @Param('id') id: string,
    @Body() dto: FailExtensionTaskDto,
    @Request() req: ExtensionTaskRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const task = await this.extensionTasksService.fail({
      ownerUserId: req.user.id,
      extensionInstanceId: this.requireHeader(extensionInstanceId),
      taskId: id,
      dto,
    });

    return this.envelope(this.extensionTasksService.toResponse(task));
  }

  private requireHeader(value: HeaderValue) {
    const headerValue = Array.isArray(value) ? value[0] : value;
    const normalizedValue = headerValue?.trim();
    if (!normalizedValue) {
      throw new BadRequestException({
        code: 'EXTENSION_INSTANCE_REQUIRED',
        message: 'X-Extension-Instance-Id header is required.',
      });
    }

    return normalizedValue;
  }

  private envelope(data: unknown) {
    return {
      success: true,
      data,
      meta: { timestamp: new Date().toISOString() },
    };
  }
}
