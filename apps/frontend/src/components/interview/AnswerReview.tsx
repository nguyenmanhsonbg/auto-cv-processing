import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { QuestionType, TECHNICAL_RATING_LABELS, PERSONALITY_RATING_LABELS } from '@interview-assistant/shared';
import type { ArchitectureAnswer } from '@interview-assistant/shared';
import { CheckCircle, XCircle, Loader2, Check, AlertCircle } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { ArchitectureViewer } from '@/components/interview/ArchitectureViewer';

interface AnswerReviewProps {
  sessionQuestion: any;
  onAutoSave: (sqId: string, data: { interviewerNote?: string; rating?: number }) => Promise<void>;
}

const getRatingLabels = (category: string): Record<number, string> =>
  category === 'PERSONALITY' ? PERSONALITY_RATING_LABELS : TECHNICAL_RATING_LABELS;

export function AnswerReview({ sessionQuestion, onAutoSave }: AnswerReviewProps) {
  const sq = sessionQuestion;
  const question = sq?.question;
  const [note, setNote] = useState(sq?.interviewerNote || '');
  const [rating, setRating] = useState<number>(sq?.rating || 0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setNote(sq?.interviewerNote || '');
    setRating(sq?.rating || 0);
    setSaveStatus('idle');
  }, [sq?.id, sq?.interviewerNote, sq?.rating]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const doSave = useCallback(
    async (data: { interviewerNote?: string; rating?: number }) => {
      if (!sq?.id) return;
      setSaveStatus('saving');
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      try {
        await onAutoSave(sq.id, data);
        setSaveStatus('saved');
        savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
      } catch {
        setSaveStatus('error');
      }
    },
    [sq?.id, onAutoSave],
  );

  const handleNoteChange = useCallback(
    (value: string) => {
      setNote(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        doSave({ interviewerNote: value, rating: rating || undefined });
      }, 800);
    },
    [doSave, rating],
  );

  const handleRatingChange = useCallback(
    (value: number) => {
      setRating(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      doSave({ interviewerNote: note, rating: value });
    },
    [doSave, note],
  );

  if (!sq) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        Select a question from the tree to review.
      </div>
    );
  }

  const questionType = question?.type as QuestionType | undefined;
  const options: { id: string; text: string }[] = question?.options || [];
  const correctAnswers: string[] = question?.correctAnswers || [];
  const candidateAnswer = sq.candidateAnswer;

  // Parse architecture answer if applicable
  let parsedArchitecture: ArchitectureAnswer | null = null;
  if (questionType === QuestionType.ARCHITECTURE && candidateAnswer) {
    try {
      parsedArchitecture = JSON.parse(candidateAnswer);
    } catch {
      // will show raw text
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Answer Review</CardTitle>
          <div className="flex items-center gap-2">
            {/* Save status indicator */}
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <Check className="h-3 w-3" />
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                Error saving
              </span>
            )}
            {questionType && (
              <Badge variant="outline" className="text-xs">{questionType}</Badge>
            )}
            {question?.subcategory && (
              <Badge variant="outline" className="text-xs">{question.subcategory}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Full question text */}
        <div>
          <Label className="text-xs text-muted-foreground">Question</Label>
          <p className="text-sm whitespace-pre-wrap mt-1">{question?.text || 'N/A'}</p>
        </div>

        {/* Expected answer */}
        {question?.expectedAnswer && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
            <Label className="text-xs text-blue-700 font-medium">Expected Answer</Label>
            <p className="text-sm whitespace-pre-wrap mt-1 text-blue-900">
              {question.expectedAnswer}
            </p>
          </div>
        )}

        {/* Scoring guide */}
        {question?.scoringGuide && (
          <div className="rounded-md bg-purple-50 border border-purple-200 p-3">
            <Label className="text-xs text-purple-700 font-medium">Scoring Guide</Label>
            <p className="text-sm whitespace-pre-wrap mt-1 text-purple-900">
              {question.scoringGuide}
            </p>
          </div>
        )}

        {/* Candidate answer */}
        <div>
          <Label className="text-xs text-muted-foreground">Candidate Answer</Label>
          {candidateAnswer ? (
            <>
              {/* Choice-type display */}
              {(questionType === QuestionType.SINGLE_CHOICE ||
                questionType === QuestionType.MULTIPLE_CHOICE) &&
                options.length > 0 ? (
                <div className="mt-1 space-y-1">
                  {options.map((opt) => {
                    const selectedIds = candidateAnswer.split(',');
                    const isSelected = selectedIds.includes(opt.id);
                    const isCorrect = correctAnswers.includes(opt.id);

                    return (
                      <div
                        key={opt.id}
                        className={cn(
                          'text-sm px-2 py-1 rounded flex items-center gap-2',
                          isSelected && isCorrect && 'bg-green-50 border border-green-200',
                          isSelected && !isCorrect && 'bg-red-50 border border-red-200',
                          !isSelected && isCorrect && 'bg-blue-50 border border-blue-200',
                          !isSelected && !isCorrect && 'text-muted-foreground',
                        )}
                      >
                        {isSelected && isCorrect && <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                        {isSelected && !isCorrect && <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                        {!isSelected && isCorrect && <CheckCircle className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                        <span>{opt.text}</span>
                        {isSelected && <Badge variant="outline" className="text-[10px] ml-auto">Selected</Badge>}
                        {isCorrect && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">Correct</Badge>}
                      </div>
                    );
                  })}
                </div>
              ) : questionType === QuestionType.ARCHITECTURE && parsedArchitecture ? (
                <div className="mt-1">
                  <ArchitectureViewer value={parsedArchitecture} />
                </div>
              ) : questionType === QuestionType.CODING ? (
                <div className="mt-1 border rounded-md overflow-hidden">
                  <Editor
                    height="200px"
                    language="javascript"
                    value={candidateAnswer}
                    theme="vs-dark"
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 12,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      domReadOnly: true,
                    }}
                  />
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap mt-1 rounded-md bg-muted p-3">
                  {candidateAnswer}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1 italic">Not answered yet</p>
          )}
        </div>

        {/* Code submission results */}
        {questionType === QuestionType.CODING && sq.codeSubmissions && sq.codeSubmissions.length > 0 && (
          <div>
            <Label className="text-xs text-muted-foreground">Code Submission Results</Label>
            <div className="mt-1 space-y-1">
              {sq.codeSubmissions.map((sub: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant={sub.status === 'PASSED' ? 'default' : 'destructive'} className="text-[10px]">
                    {sub.status}
                  </Badge>
                  <span>{sub.language}</span>
                  {sub.results?.map((r: any, j: number) => (
                    <span key={j} className={r.passed ? 'text-green-600' : 'text-red-600'}>
                      T{r.testCaseIndex + 1}:{r.passed ? 'P' : 'F'}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interviewer note */}
        <div className="space-y-2">
          <Label className="text-xs">Interviewer Note</Label>
          <Textarea
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="Add your notes about this answer..."
            rows={3}
            className="text-sm"
          />
        </div>

        {/* Rating */}
        <div className="space-y-2">
          <Label className="text-xs">Rating</Label>
          <RadioGroup
            value={rating ? rating.toString() : ''}
            onValueChange={(val) => handleRatingChange(Number(val))}
            className="flex flex-wrap gap-3"
          >
            {[1, 2, 3, 4, 5].map((r) => (
              <div key={r} className="flex items-center space-x-1.5">
                <RadioGroupItem value={r.toString()} id={`review-${sq.id}-${r}`} />
                <Label
                  htmlFor={`review-${sq.id}-${r}`}
                  className={cn(
                    'text-xs cursor-pointer',
                    rating === r && 'font-medium',
                  )}
                >
                  {r} - {getRatingLabels(question?.category ?? '')[r]}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
}
