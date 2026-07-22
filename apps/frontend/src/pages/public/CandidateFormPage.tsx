import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  FileText,
  Send,
} from 'lucide-react';
import {
  getPublicForm,
  submitPublicForm,
  type FormSessionDetails,
} from '@/lib/forms-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function CandidateFormPage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<FormSessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Answers state keyed by questionSetItemId
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  // Time remaining states
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    let active = true;

    async function loadForm() {
      if (!token) {
        setError('Không tìm thấy token hợp lệ.');
        setLoading(false);
        return;
      }

      try {
        const data = await getPublicForm(token);
        if (!active) return;
        setSession(data);

        // Prepopulate answers
        const initialAnswers: Record<string, any> = {};
        data.questions.forEach((q) => {
          if (q.type === 'MULTIPLE_CHOICE') {
            initialAnswers[q.questionSetItemId] = [];
          } else {
            initialAnswers[q.questionSetItemId] = '';
          }
        });
        setAnswers(initialAnswers);

        // Set up timer
        const expiry = new Date(data.expiresAt).getTime();
        const calcTimeLeft = () => Math.max(0, Math.floor((expiry - Date.now()) / 1000));
        const initialTimeLeft = calcTimeLeft();
        setTimeLeft(initialTimeLeft);

        if (initialTimeLeft > 0) {
          timerRef.current = setInterval(() => {
            const nextTime = calcTimeLeft();
            setTimeLeft(nextTime);
            if (nextTime <= 0) {
              if (timerRef.current) clearInterval(timerRef.current);
              setError('Form trả lời câu hỏi đã hết hạn (giới hạn 5 phút).');
            }
          }, 1000);
        } else {
          setError('Form trả lời câu hỏi đã hết hạn (giới hạn 5 phút).');
        }
      } catch (err: any) {
        if (!active) return;
        setError(err.message || 'Không thể tải bộ câu hỏi.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadForm();

    return () => {
      active = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token]);

  const handleTextChange = (itemId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: val }));
    setValidationError(null);
  };

  const handleRadioChange = (itemId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: optionId }));
    setValidationError(null);
  };

  const handleCheckboxChange = (itemId: string, optionId: string, checked: boolean) => {
    setAnswers((prev) => {
      const currentList = prev[itemId] || [];
      const updatedList = checked
        ? [...currentList, optionId]
        : currentList.filter((id: string) => id !== optionId);
      return { ...prev, [itemId]: updatedList };
    });
    setValidationError(null);
  };

  const validate = () => {
    if (!session) return false;
    for (const q of session.questions) {
      if (q.required) {
        const val = answers[q.questionSetItemId];
        const isEmpty =
          val == null ||
          (typeof val === 'string' && val.trim() === '') ||
          (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          setValidationError(`Vui lòng trả lời câu hỏi: "${q.text}"`);
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !session || submitting) return;

    if (!validate()) {
      return;
    }

    setSubmitting(true);
    setValidationError(null);

    // Format payload
    const formattedAnswers = Object.entries(answers).map(([questionSetItemId, val]) => {
      let finalVal: any = val;
      // Wrap single answer in object structure expected by backend schema if necessary, or pass raw
      if (typeof val === 'string') {
        finalVal = { text: val };
      } else if (Array.isArray(val)) {
        finalVal = { selectedIds: val };
      } else {
        finalVal = { answer: val };
      }
      return {
        questionSetItemId,
        answer: finalVal,
      };
    });

    try {
      await submitPublicForm(token, formattedAnswers);
      setSubmitted(true);
      if (timerRef.current) clearInterval(timerRef.current);
    } catch (err: any) {
      setValidationError(err.message || 'Có lỗi xảy ra khi gửi câu trả lời.');
    } finally {
      setSubmitting(false);
    }
  };

  // Timer rendering helpers
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerColor = (seconds: number) => {
    if (seconds > 120) return 'text-green-500 bg-green-500/10 border-green-500/20';
    if (seconds > 60) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-red-500 bg-red-500/10 border-red-500/20 animate-pulse';
  };

  const getTimerProgressWidth = () => {
    if (timeLeft == null) return '0%';
    const pct = Math.min(100, (timeLeft / 300) * 100);
    return `${pct}%`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-sm text-slate-400 font-medium">Đang tải bộ câu hỏi đánh giá...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <Card className="max-w-md w-full border-slate-800 bg-slate-900/50 backdrop-blur-xl">
          <CardContent className="pt-8 text-center space-y-6">
            <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
              <AlertCircle className="h-8 w-8 text-red-500" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-xl text-slate-200">Không thể thực hiện đánh giá</CardTitle>
              <CardDescription className="text-slate-400">
                {error || 'Đường dẫn không hợp lệ hoặc đã hết hạn.'}
              </CardDescription>
            </div>
            <p className="text-xs text-slate-500">
              Vui lòng liên hệ với HR hoặc người gửi để nhận liên kết mới.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <Card className="max-w-md w-full border-slate-800 bg-slate-900/50 backdrop-blur-xl">
          <CardContent className="pt-8 text-center space-y-6">
            <div className="h-16 w-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto border border-green-500/20">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-xl text-slate-200">Gửi câu trả lời thành công</CardTitle>
              <CardDescription className="text-slate-400">
                Cảm ơn bạn đã hoàn thành phần trả lời câu hỏi đánh giá ngành nghề.
              </CardDescription>
            </div>
            <p className="text-sm text-slate-500">
              Thông tin của bạn đã được ghi nhận vào hồ sơ tuyển dụng. Chúng tôi sẽ liên hệ lại với bạn sớm nhất.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Sticky Countdown Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-semibold text-slate-200">Đánh giá Ứng viên</span>
          </div>

          {timeLeft !== null && (
            <div className={`flex items-center space-x-2 border rounded-full px-4 py-1.5 text-xs font-semibold ${getTimerColor(timeLeft)}`}>
              <Clock className="h-3.5 w-3.5" />
              <span>Thời gian còn lại: {formatTime(timeLeft)}</span>
            </div>
          )}
        </div>
        {/* Progress bar visual timer */}
        {timeLeft !== null && (
          <div className="h-1 w-full bg-slate-900">
            <div
              className={`h-full transition-all duration-1000 ${
                timeLeft > 120 ? 'bg-green-500' : timeLeft > 60 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: getTimerProgressWidth() }}
            />
          </div>
        )}
      </header>

      {/* Main Questionnaire */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
            Chào {session.candidateName},
          </h1>
          <p className="text-slate-400 text-sm">
            Vui lòng trả lời 5 câu hỏi khảo sát dưới đây cho vị trí{' '}
            <strong className="text-slate-200">{session.jobTitle}</strong>.
          </p>
        </div>

        {validationError && (
          <div className="flex items-center gap-3 border border-red-500/30 bg-red-500/10 rounded-lg p-4 text-sm text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {session.questions.map((q, idx) => (
            <Card key={q.questionSetItemId} className="border-slate-800 bg-slate-900/30">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-slate-300">{idx + 1}</span>
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base text-slate-200 leading-relaxed">
                      {q.text}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400 uppercase tracking-wider">
                      {(q.type === 'OPEN_ENDED' || q.type === 'ARCHITECTURE' || q.type === 'SCENARIO') && 'Câu hỏi tự luận'}
                      {q.type === 'SINGLE_CHOICE' && 'Chọn một đáp án'}
                      {q.type === 'MULTIPLE_CHOICE' && 'Chọn nhiều đáp án'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                {/* OPEN ENDED */}
                {(q.type === 'OPEN_ENDED' || q.type === 'ARCHITECTURE' || q.type === 'SCENARIO') && (
                  <Textarea
                    placeholder={
                      q.type === 'ARCHITECTURE'
                        ? 'Mô tả kiến trúc, các thành phần và luồng dữ liệu của bạn...'
                        : 'Nhập câu trả lời của bạn ở đây...'
                    }
                    className="min-h-[120px] bg-slate-950 border-slate-800 focus-visible:ring-primary text-slate-200"
                    value={answers[q.questionSetItemId] || ''}
                    onChange={(e) => handleTextChange(q.questionSetItemId, e.target.value)}
                    disabled={submitting}
                  />
                )}

                {/* SINGLE CHOICE */}
                {q.type === 'SINGLE_CHOICE' && q.options && (
                  <RadioGroup
                    value={answers[q.questionSetItemId] || ''}
                    onValueChange={(val) => handleRadioChange(q.questionSetItemId, val)}
                    disabled={submitting}
                    className="space-y-3"
                  >
                    {q.options.map((opt) => (
                      <div key={opt.id} className="flex items-center space-x-3 rounded-lg border border-slate-800/60 bg-slate-950/30 p-3 hover:bg-slate-900/20 transition-colors">
                        <RadioGroupItem value={opt.id} id={`${q.questionSetItemId}-${opt.id}`} />
                        <Label htmlFor={`${q.questionSetItemId}-${opt.id}`} className="text-sm text-slate-300 font-medium cursor-pointer w-full">
                          {opt.text}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}

                {/* MULTIPLE CHOICE */}
                {q.type === 'MULTIPLE_CHOICE' && q.options && (
                  <div className="space-y-3">
                    {q.options.map((opt) => {
                      const checked = (answers[q.questionSetItemId] || []).includes(opt.id);
                      return (
                        <div key={opt.id} className="flex items-center space-x-3 rounded-lg border border-slate-800/60 bg-slate-950/30 p-3 hover:bg-slate-900/20 transition-colors">
                          <Checkbox
                            id={`${q.questionSetItemId}-${opt.id}`}
                            checked={checked}
                            onCheckedChange={(isChecked) =>
                              handleCheckboxChange(q.questionSetItemId, opt.id, Boolean(isChecked))
                            }
                            disabled={submitting}
                          />
                          <Label htmlFor={`${q.questionSetItemId}-${opt.id}`} className="text-sm text-slate-300 font-medium cursor-pointer w-full">
                            {opt.text}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="pt-4 flex justify-end">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-primary hover:bg-primary/90 text-white font-semibold px-6 py-5 rounded-lg flex items-center space-x-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang gửi...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span>Gửi câu trả lời</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
