import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebSocketEvents } from '@interview-assistant/shared';
import { AntiCheatEventEntity } from '../sessions/entities/anti-cheat-event.entity';
import { SessionEntity } from '../sessions/entities/session.entity';

export interface ClientInfo {
  ip: string;
  userAgent: string;
  connectedAt: Date;
}

export interface InterviewerInfo {
  socketId: string;
  name: string;
  email: string;
  joinedAt: string;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:4000' },
  namespace: '/',
})
export class InterviewWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(InterviewWebSocketGateway.name);

  // Track all simultaneous candidate connections per session: sessionId → Map<socketId, ClientInfo>
  private readonly candidateSocketMap = new Map<string, Map<string, ClientInfo>>();

  // Track interviewer connections: sessionId → Map<socketId, InterviewerInfo>
  private readonly interviewerMap = new Map<string, Map<string, InterviewerInfo>>();

  constructor(
    @InjectRepository(AntiCheatEventEntity)
    private readonly antiCheatEventRepo: Repository<AntiCheatEventEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
  ) {}

  getClientInfo(sessionId: string): ClientInfo | undefined {
    const map = this.candidateSocketMap.get(sessionId);
    if (!map || map.size === 0) return undefined;
    return Array.from(map.values())[0];
  }

  private broadcastInterviewers(sessionId: string) {
    const map = this.interviewerMap.get(sessionId);
    const interviewers = map ? Array.from(map.values()) : [];
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.INTERVIEWERS_UPDATED, { sessionId, interviewers });
  }

  handleConnection(client: Socket) {
    const sessionId = client.handshake.query.sessionId as string;
    const role = client.handshake.query.role as string;
    const name = (client.handshake.query.name as string) || 'Interviewer';

    if (!sessionId) return;

    if (role === 'candidate') {
      const accessToken = client.handshake.query.accessToken as string;
      if (!accessToken) {
        this.logger.warn(`Candidate rejected for session:${sessionId} — missing accessToken`);
        client.disconnect(true);
        return;
      }
      // Validate async; disconnect if invalid. Join the room optimistically so the
      // client doesn't miss early events, then kick if the token is wrong.
      client.join(`session:${sessionId}`);
      void this.sessionRepo
        .findOne({ where: { accessToken, id: sessionId } })
        .then((session) => {
          if (!session) {
            this.logger.warn(`Candidate rejected for session:${sessionId} — invalid accessToken`);
            client.disconnect(true);
          }
        });
    } else {
      client.join(`session:${sessionId}`);
      // Late-joiner catch-up: re-emit in-progress AI generation events to this specific socket
      void this.sessionRepo
        .findOne({ where: { id: sessionId }, select: ['id', 'isSurveyGenerating', 'isSurveySuggestGenerating'] })
        .then((s) => {
          if (!s) return;
          if (s.isSurveyGenerating)
            client.emit(WebSocketEvents.SURVEY_GENERATING, { sessionId });
          if (s.isSurveySuggestGenerating)
            client.emit(WebSocketEvents.SURVEY_SUGGEST_GENERATING, { sessionId });
        });
    }

    if (role === 'candidate') {
      const ip =
        (client.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        client.handshake.address;
      const userAgent = client.handshake.headers['user-agent'] || '';
      const info: ClientInfo = { ip, userAgent, connectedAt: new Date() };

      if (!this.candidateSocketMap.has(sessionId)) {
        this.candidateSocketMap.set(sessionId, new Map());
      }
      const sessionCandidates = this.candidateSocketMap.get(sessionId)!;

      // Kick any previously connected tabs/devices for this session
      if (sessionCandidates.size > 0) {
        for (const [oldSocketId] of sessionCandidates) {
          this.server.to(oldSocketId).emit(WebSocketEvents.CANDIDATE_SESSION_KICKED, {
            sessionId,
            reason: 'Another device or tab joined this session.',
          });
          const oldSocket = this.server.sockets?.sockets?.get(oldSocketId);
          if (oldSocket) oldSocket.disconnect(true);
        }
        sessionCandidates.clear();
        void this.antiCheatEventRepo.save({ sessionId, type: 'MULTI_DEVICE_DETECTED', metadata: { ip, userAgent } });
        this.server.to(`session:${sessionId}`).emit(WebSocketEvents.CANDIDATE_MULTI_DEVICE_DETECTED, {
          sessionId,
          timestamp: new Date().toISOString(),
        });
      }

      sessionCandidates.set(client.id, info);
      client.to(`session:${sessionId}`).emit(WebSocketEvents.CANDIDATE_CONNECTED, {
        sessionId,
        ip,
        userAgent,
        connectedAt: info.connectedAt.toISOString(),
      });
      this.logger.log(`Candidate connected to session:${sessionId} from ${ip}`);
    } else if (role === 'interviewer') {
      const email = (client.handshake.query.email as string) || '';
      if (!this.interviewerMap.has(sessionId)) {
        this.interviewerMap.set(sessionId, new Map());
      }
      const info: InterviewerInfo = {
        socketId: client.id,
        name,
        email,
        joinedAt: new Date().toISOString(),
      };
      this.interviewerMap.get(sessionId)!.set(client.id, info);
      this.broadcastInterviewers(sessionId);
      this.logger.log(`Interviewer "${name}" joined session:${sessionId}`);
    } else {
      this.logger.log(`Client ${client.id} joined session:${sessionId}`);
    }

    // Store sessionId on socket for disconnect cleanup
    (client as any)._sessionId = sessionId;
    (client as any)._role = role;
  }

  handleDisconnect(client: Socket) {
    const sessionId = (client as any)._sessionId as string | undefined;
    const role = (client as any)._role as string | undefined;
    if (sessionId && role === 'candidate') {
      const map = this.candidateSocketMap.get(sessionId);
      if (map) {
        map.delete(client.id);
        if (map.size === 0) this.candidateSocketMap.delete(sessionId);
      }
    } else if (sessionId && role === 'interviewer') {
      const map = this.interviewerMap.get(sessionId);
      if (map) {
        map.delete(client.id);
        if (map.size === 0) this.interviewerMap.delete(sessionId);
      }
      this.broadcastInterviewers(sessionId);
    }
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage(WebSocketEvents.SESSION_JOIN)
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; role?: string; name?: string; email?: string },
  ) {
    client.join(`session:${data.sessionId}`);

    // Handle late role assignment (when SESSION_JOIN is emitted after connection)
    if (data.role === 'interviewer') {
      const sessionId = data.sessionId;
      const name = data.name || 'Interviewer';
      const email = data.email || '';
      if (!this.interviewerMap.has(sessionId)) {
        this.interviewerMap.set(sessionId, new Map());
      }
      const existing = this.interviewerMap.get(sessionId)!.get(client.id);
      if (!existing) {
        this.interviewerMap.get(sessionId)!.set(client.id, {
          socketId: client.id,
          name,
          email,
          joinedAt: new Date().toISOString(),
        });
        (client as any)._sessionId = sessionId;
        (client as any)._role = 'interviewer';
        this.broadcastInterviewers(sessionId);
      }
    }
  }

  @SubscribeMessage(WebSocketEvents.CANDIDATE_TYPING)
  handleCandidateTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; sessionQuestionId: string; text: string },
  ) {
    client.to(`session:${data.sessionId}`).emit(WebSocketEvents.CANDIDATE_TYPING, data);
  }

  @SubscribeMessage(WebSocketEvents.CANDIDATE_CODE_CHANGED)
  handleCandidateCodeChanged(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; sessionQuestionId: string; code: string; language: string },
  ) {
    client.to(`session:${data.sessionId}`).emit(WebSocketEvents.CANDIDATE_CODE_CHANGED, data);
  }

  @SubscribeMessage(WebSocketEvents.CANDIDATE_ANSWER_SUBMITTED)
  handleCandidateAnswerSubmitted(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; sessionQuestionId: string; answer: string },
  ) {
    client.to(`session:${data.sessionId}`).emit(WebSocketEvents.CANDIDATE_ANSWER_SUBMITTED, data);
  }

  @SubscribeMessage(WebSocketEvents.CANDIDATE_ARCHITECTURE_CHANGED)
  handleCandidateArchitectureChanged(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; sessionQuestionId: string; architecture: unknown },
  ) {
    client.to(`session:${data.sessionId}`).emit(WebSocketEvents.CANDIDATE_ARCHITECTURE_CHANGED, data);
  }

  @SubscribeMessage(WebSocketEvents.CANDIDATE_QUESTION_CHANGED)
  handleCandidateQuestionChanged(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { sessionId: string; sessionQuestionId: string },
  ) {
    client.to(`session:${data.sessionId}`).emit(WebSocketEvents.CANDIDATE_QUESTION_CHANGED, data);
  }

  @SubscribeMessage(WebSocketEvents.CANDIDATE_TAB_HIDDEN)
  async handleCandidateTabHidden(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    await this.antiCheatEventRepo.save({ sessionId: data.sessionId, type: 'TAB_HIDDEN', metadata: null });
    const count = await this.antiCheatEventRepo.count({ where: { sessionId: data.sessionId, type: 'TAB_HIDDEN' } });
    client.to(`session:${data.sessionId}`).emit(WebSocketEvents.CANDIDATE_TAB_HIDDEN, {
      sessionId: data.sessionId,
      count,
      timestamp: new Date().toISOString(),
    });
  }

  @SubscribeMessage(WebSocketEvents.CANDIDATE_COPY_ATTEMPT)
  async handleCandidateCopyAttempt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string },
  ) {
    await this.antiCheatEventRepo.save({ sessionId: data.sessionId, type: 'COPY_ATTEMPT', metadata: null });
    const count = await this.antiCheatEventRepo.count({ where: { sessionId: data.sessionId, type: 'COPY_ATTEMPT' } });
    client.to(`session:${data.sessionId}`).emit(WebSocketEvents.CANDIDATE_COPY_ATTEMPT, {
      sessionId: data.sessionId,
      count,
      timestamp: new Date().toISOString(),
    });
  }

  emitQuestionsActivated(sessionId: string, questionIds: string[]) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.INTERVIEWER_QUESTIONS_ACTIVATED, {
      sessionId,
      questionIds,
    });
  }

  emitQuestionsDeactivated(sessionId: string, questionIds: string[]) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.INTERVIEWER_QUESTIONS_DEACTIVATED, {
      sessionId,
      questionIds,
    });
  }

  emitCandidateViewToggled(sessionId: string, enabled: boolean) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.INTERVIEWER_CANDIDATE_VIEW_TOGGLED, {
      sessionId,
      enabled,
    });
  }

  emitCodeExecutionCompleted(sessionId: string, payload: { sessionQuestionId: string; submissionId: string; status: string }) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.CODE_EXECUTION_COMPLETED, payload);
  }

  emitSurveyGenerating(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.SURVEY_GENERATING, { sessionId });
  }

  emitSurveyGenerated(sessionId: string, questions: unknown[]) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.SURVEY_GENERATED, { sessionId, questions });
  }

  emitSurveyGenerateFailed(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.SURVEY_GENERATE_FAILED, { sessionId });
  }

  emitSurveyActivated(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.SURVEY_ACTIVATED, { sessionId });
  }

  emitNextQuestionGenerating(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.NEXT_QUESTION_GENERATING, { sessionId });
  }

  emitNextQuestionSuggested(sessionId: string, suggestion: unknown) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.NEXT_QUESTION_SUGGESTED, { sessionId, suggestion });
  }

  emitSurveySuggestGenerating(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.SURVEY_SUGGEST_GENERATING, { sessionId });
  }

  emitSurveySuggestReady(sessionId: string, suggestions: unknown[]) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.SURVEY_SUGGEST_READY, { sessionId, suggestions });
  }

  emitSurveySuggestFailed(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.SURVEY_SUGGEST_FAILED, { sessionId });
  }

  emitEvalSummaryGenerating(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.EVAL_SUMMARY_GENERATING, { sessionId });
  }

  emitEvalSummaryReady(sessionId: string, summary: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.EVAL_SUMMARY_READY, { sessionId, summary });
  }

  emitEvalAnalyzing(sessionId: string) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.EVAL_ANALYZING, { sessionId });
  }

  emitEvalAnalysisReady(sessionId: string, suggestion: unknown) {
    this.server.to(`session:${sessionId}`).emit(WebSocketEvents.EVAL_ANALYSIS_READY, { sessionId, suggestion });
  }

  emitAnalyzeProgress(socketId: string, payload: {
    stage: 'parsing' | 'analyzing' | 'saving' | 'done' | 'error';
    error?: string;
  }) {
    this.server.to(socketId).emit(WebSocketEvents.CANDIDATE_ANALYZE_PROGRESS, payload);
  }

  emitUploadProgress(socketId: string, payload: {
    fileIndex: number;
    fileName: string;
    stage: 'parsing' | 'analyzing' | 'saving' | 'done' | 'error';
    totalFiles: number;
    candidateId?: string;
    error?: string;
  }) {
    this.server.to(socketId).emit(WebSocketEvents.UPLOAD_PROGRESS, payload);
  }
}
