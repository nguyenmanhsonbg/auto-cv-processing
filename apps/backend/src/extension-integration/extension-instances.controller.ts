import { UserRole } from '@interview-assistant/shared';
import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiErrorResponses } from '../common/swagger/api-envelope.schema';
import {
  ExtensionInstanceResponseDto,
  HeartbeatExtensionInstanceDto,
  RegisterExtensionInstanceDto,
} from './dto';
import { ExtensionInstancesService } from './extension-instances.service';

type HeaderValue = string | string[] | undefined;

interface ExtensionInstanceRequest {
  user: {
    id: string;
    email?: string;
    role: UserRole;
  };
}

@ApiTags('Extension Instances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.HR)
@Controller('extension/instances')
@ApiErrorResponses([400, 401, 403, 500])
export class ExtensionInstancesController {
  constructor(private readonly extensionInstancesService: ExtensionInstancesService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register or refresh a browser extension instance' })
  @ApiBody({ type: RegisterExtensionInstanceDto })
  @ApiResponse({ status: 201, type: ExtensionInstanceResponseDto })
  async register(
    @Body() dto: RegisterExtensionInstanceDto,
    @Request() req: ExtensionInstanceRequest,
  ) {
    const instance = await this.extensionInstancesService.register({
      ownerUserId: req.user.id,
      dto,
    });

    return {
      success: true,
      data: this.extensionInstancesService.toResponse(instance),
      meta: { timestamp: new Date().toISOString() },
    };
  }

  @Post('heartbeat')
  @ApiOperation({ summary: 'Mark an extension instance online' })
  @ApiHeader({ name: 'X-Extension-Instance-Id', required: true })
  @ApiBody({ type: HeartbeatExtensionInstanceDto })
  @ApiResponse({ status: 201, type: ExtensionInstanceResponseDto })
  async heartbeat(
    @Body() dto: HeartbeatExtensionInstanceDto,
    @Request() req: ExtensionInstanceRequest,
    @Headers('x-extension-instance-id') extensionInstanceId: HeaderValue,
  ) {
    const instance = await this.extensionInstancesService.heartbeat({
      ownerUserId: req.user.id,
      extensionInstanceId: this.requireHeader(extensionInstanceId, 'X-Extension-Instance-Id'),
      dto,
    });

    return {
      success: true,
      data: this.extensionInstancesService.toResponse(instance),
      meta: { timestamp: new Date().toISOString() },
    };
  }

  @Get()
  @ApiOperation({ summary: 'List extension instances visible to the current account' })
  @ApiResponse({ status: 200, type: [ExtensionInstanceResponseDto] })
  async list(@Request() req: ExtensionInstanceRequest) {
    const instances = await this.extensionInstancesService.listForUser({
      actorUserId: req.user.id,
      actorRole: req.user.role,
    });

    return {
      success: true,
      data: instances.map((instance) => this.extensionInstancesService.toResponse(instance)),
      meta: { timestamp: new Date().toISOString() },
    };
  }

  @Patch(':id/disable')
  @ApiOperation({ summary: 'Disable an extension instance' })
  @ApiResponse({ status: 200, type: ExtensionInstanceResponseDto })
  async disable(
    @Param('id') id: string,
    @Request() req: ExtensionInstanceRequest,
  ) {
    const instance = await this.extensionInstancesService.disable({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      extensionInstanceId: id,
    });

    return {
      success: true,
      data: this.extensionInstancesService.toResponse(instance),
      meta: { timestamp: new Date().toISOString() },
    };
  }

  private requireHeader(value: HeaderValue, headerName: string) {
    const headerValue = Array.isArray(value) ? value[0] : value;
    const normalizedValue = headerValue?.trim();
    if (!normalizedValue) {
      throw new BadRequestException({
        code: 'EXTENSION_INSTANCE_REQUIRED',
        message: `${headerName} header is required.`,
      });
    }

    return normalizedValue;
  }
}
