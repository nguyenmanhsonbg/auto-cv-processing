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
import { TestRoundsService } from './services/test-rounds.service';
import { CreateTestRoundDto } from './dto/create-test-round.dto';
import { UpdateTestRoundDto } from './dto/update-test-round.dto';
import { TestRoundEntity } from './entities/test-round.entity';

@ApiTags('Test Rounds')
@ApiBearerAuth()
@Controller('applications/:applicationId/test-rounds')
export class TestRoundsController {
  constructor(private readonly service: TestRoundsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new test round for an application' })
  async create(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateTestRoundDto,
  ): Promise<TestRoundEntity> {
    return this.service.create(applicationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all test rounds for an application' })
  async findByApplication(
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ): Promise<TestRoundEntity[]> {
    return this.service.findByApplication(applicationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific test round' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TestRoundEntity> {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a test round' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTestRoundDto,
  ): Promise<TestRoundEntity> {
    return this.service.update(id, dto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit test result' })
  async submitTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { score?: number },
  ): Promise<TestRoundEntity> {
    return this.service.submitTest(id, body.score);
  }

  @Post(':id/evaluate')
  @ApiOperation({ summary: 'Evaluate test' })
  async evaluateTest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { score: number; result: string; comment?: string },
  ): Promise<TestRoundEntity> {
    return this.service.evaluateTest(id, body.score, body.result as any, body.comment);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a test round' })
  async delete(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.service.delete(id);
  }
}
