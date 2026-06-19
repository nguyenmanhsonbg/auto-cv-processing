export enum WebSocketEvents {
  // Room management
  SESSION_JOIN = 'session:join',

  // Candidate -> Interviewer (real-time)
  CANDIDATE_CONNECTED = 'candidate:connected',
  CANDIDATE_TYPING = 'candidate:typing',
  CANDIDATE_CODE_CHANGED = 'candidate:code_changed',
  CANDIDATE_ANSWER_SUBMITTED = 'candidate:answer_submitted',
  CANDIDATE_CODE_SUBMITTED = 'candidate:code_submitted',
  CANDIDATE_ARCHITECTURE_CHANGED = 'candidate:architecture_changed',
  CANDIDATE_QUESTION_CHANGED = 'candidate:question_changed',
  CANDIDATE_SESSION_COMPLETED = 'candidate:session_completed',
  CANDIDATE_TAB_HIDDEN = 'candidate:tab_hidden',
  CANDIDATE_COPY_ATTEMPT = 'candidate:copy_attempt',
  CANDIDATE_MULTI_DEVICE_DETECTED = 'candidate:multi_device_detected',
  CANDIDATE_SESSION_KICKED = 'candidate:session_kicked',

  // Interviewer -> Candidate (real-time)
  INTERVIEWER_WATCHING = 'interviewer:watching',
  INTERVIEWER_QUESTIONS_ACTIVATED = 'interviewer:questions_activated',
  INTERVIEWER_QUESTIONS_DEACTIVATED = 'interviewer:questions_deactivated',
  INTERVIEWER_CANDIDATE_VIEW_TOGGLED = 'interviewer:candidate_view_toggled',

  // Code execution
  CODE_EXECUTION_STARTED = 'code:execution_started',
  CODE_EXECUTION_COMPLETED = 'code:execution_completed',

  // Session events
  SESSION_STATUS_CHANGED = 'session:status_changed',

  // Interviewer tracking
  INTERVIEWERS_UPDATED = 'interviewers:updated',

  // Upload progress
  UPLOAD_PROGRESS = 'candidate:upload_progress',

  // Re-analyze progress
  CANDIDATE_ANALYZE_PROGRESS = 'candidate:analyze_progress',

  // Survey events
  SURVEY_GENERATING = 'survey:generating',
  SURVEY_GENERATED = 'survey:generated',
  SURVEY_GENERATE_FAILED = 'survey:generate_failed',
  SURVEY_ACTIVATED = 'survey:activated',

  // Next-question AI suggestion
  NEXT_QUESTION_GENERATING = 'session:next_question_generating',
  NEXT_QUESTION_SUGGESTED = 'session:next_question_suggested',

  // Survey suggestions (suggest-from-survey flow)
  SURVEY_SUGGEST_GENERATING = 'survey:suggest_generating',
  SURVEY_SUGGEST_READY = 'survey:suggest_ready',
  SURVEY_SUGGEST_FAILED = 'survey:suggest_failed',

  // Evaluation AI summary
  EVAL_SUMMARY_GENERATING = 'eval:summary_generating',
  EVAL_SUMMARY_READY = 'eval:summary_ready',

  // Full AI evaluation (BM04 ratings)
  EVAL_ANALYZING = 'eval:analyzing',
  EVAL_ANALYSIS_READY = 'eval:analysis_ready',
}
