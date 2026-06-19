import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InterviewWebSocketGateway } from './websocket.gateway';
import { AntiCheatEventEntity } from '../sessions/entities/anti-cheat-event.entity';
import { SessionEntity } from '../sessions/entities/session.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AntiCheatEventEntity, SessionEntity])],
  providers: [InterviewWebSocketGateway],
  exports: [InterviewWebSocketGateway],
})
export class WebSocketModule {}
