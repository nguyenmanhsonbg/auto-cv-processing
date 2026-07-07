import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { ApiError } from '@/lib/api-client';
import { getPublicSafeErrorMessage } from '@/lib/api-errors';
import {
  getPublicJobPosting,
  submitPublicApplication,
  type PublicApplyResponse,
  type PublicJobPostingDetail,
} from '@/lib/recruitment-public-api';
import {
  CvUploadField,
  validateCvFile,
} from '@/components/recruitment/CvUploadField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ApplyFormState {
  fullName: string;
  email: string;
  phone: string;
  note: string;
  consent: boolean;
}

interface ApplyResultState {
  type: 'success' | 'error';
  title: string;
  message: string;
  applicationId?: string;
}

const INITIAL_FORM: ApplyFormState = {
  fullName: '',
  email: '',
  phone: '',
  note: '',
  consent: false,
};

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `apply_${crypto.randomUUID()}`;
  }

  return `apply_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isApplyOpen(job: PublicJobPostingDetail) {
  const now = Date.now();
  const openAt = job.openAt ? new Date(job.openAt).getTime() : null;
  const closeAt = job.closeAt ? new Date(job.closeAt).getTime() : null;

  if (job.status !== 'PUBLISHED') return false;
  if (openAt && openAt > now) return false;
  if (closeAt && closeAt <= now) return false;
  return true;
}

function toSuccessResult(response: PublicApplyResponse): ApplyResultState {
  return {
    type: 'success',
    title: 'Ung tuyen thanh cong',
    message: 'CV cua ban da duoc kiem tra an toan va tiep nhan.',
    applicationId: response.applicationId,
  };
}

export function PublicJobApplyPage() {
  const { slug } = useParams();
  const [job, setJob] = useState<PublicJobPostingDetail | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [jobError, setJobError] = useState<string | null>(null);
  const [form, setForm] = useState<ApplyFormState>(INITIAL_FORM);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ApplyFormState | 'cvFile', string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ApplyResultState | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);

  useEffect(() => {
    let active = true;

    async function loadJob() {
      if (!slug) {
        setJobError('Khong tim thay tin tuyen dung.');
        setLoadingJob(false);
        return;
      }

      setLoadingJob(true);
      setJobError(null);

      try {
        const data = await getPublicJobPosting(slug);
        if (active) setJob(data);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setJobError('Khong tim thay tin tuyen dung hoac tin da ngung nhan ho so.');
        } else {
          setJobError(getPublicSafeErrorMessage(err));
        }
      } finally {
        if (active) setLoadingJob(false);
      }
    }

    void loadJob();

    return () => {
      active = false;
    };
  }, [slug]);

  const applyOpen = useMemo(() => (job ? isApplyOpen(job) : false), [job]);

  const updateForm = (field: keyof ApplyFormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setResult(null);
  };

  const validateForm = () => {
    const nextErrors: Partial<Record<keyof ApplyFormState | 'cvFile', string>> = {};

    if (!form.fullName.trim()) {
      nextErrors.fullName = 'Vui long nhap ho ten.';
    }
    if (!form.email.trim()) {
      nextErrors.email = 'Vui long nhap email.';
    } else if (!isEmail(form.email.trim())) {
      nextErrors.email = 'Email chua hop le.';
    }
    if (!form.phone.trim()) {
      nextErrors.phone = 'Vui long nhap so dien thoai.';
    }
    if (!cvFile) {
      nextErrors.cvFile = 'Vui long tai len CV.';
    } else {
      const fileError = validateCvFile(cvFile);
      if (fileError) nextErrors.cvFile = fileError;
    }
    if (!form.consent) {
      nextErrors.consent = 'Vui long xac nhan thong tin truoc khi gui ho so.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(null);

    if (!job || !applyOpen || !validateForm() || !cvFile) return;

    setSubmitting(true);
    try {
      const response = await submitPublicApplication(
        job.jobPostingId,
        {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          note: form.note.trim() || undefined,
        },
        cvFile,
        idempotencyKey,
      );

      setResult(toSuccessResult(response));
      setForm(INITIAL_FORM);
      setCvFile(null);
      setFieldErrors({});
      setIdempotencyKey(createIdempotencyKey());
    } catch (err) {
      setResult({
        type: 'error',
        title: 'Chua the gui ho so',
        message: getPublicSafeErrorMessage(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingJob) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <div className="space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </main>
    );
  }

  if (jobError || !job) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="flex gap-3 pt-6">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Khong the mo form ung tuyen</h1>
              <p className="text-sm text-muted-foreground">
                {jobError ?? 'Khong co du lieu tin tuyen dung.'}
              </p>
              {slug && (
                <Button asChild variant="outline">
                  <Link to={`/jobs/${slug}`}>Quay lai tin tuyen dung</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-6">
        <div className="space-y-2">
          <Link to={`/jobs/${job.publicSlug}`} className="text-sm font-medium text-primary hover:underline">
            Quay lai tin tuyen dung
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Ung tuyen {job.title}</h1>
          <p className="text-sm text-muted-foreground">
            Ho so chi duoc tiep nhan sau khi CV PDF duoc quet an toan, tao ban CV sach va doc thong tin thanh cong.
          </p>
        </div>

        {!applyOpen && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 text-sm text-amber-900">
              Tin tuyen dung hien chua nhan ho so.
            </CardContent>
          </Card>
        )}

        {result && (
          <Card className={result.type === 'success' ? 'border-green-200 bg-green-50' : undefined}>
            <CardContent className="flex gap-3 pt-6">
              {result.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              )}
              <div className="space-y-1">
                <h2 className="font-semibold">{result.title}</h2>
                <p className="text-sm text-muted-foreground">{result.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Thong tin ung tuyen</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="fullName">Ho ten</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(event) => updateForm('fullName', event.target.value)}
                    disabled={submitting || !applyOpen}
                    autoComplete="name"
                  />
                  {fieldErrors.fullName && (
                    <p className="text-sm text-destructive">{fieldErrors.fullName}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => updateForm('email', event.target.value)}
                    disabled={submitting || !applyOpen}
                    autoComplete="email"
                  />
                  {fieldErrors.email && (
                    <p className="text-sm text-destructive">{fieldErrors.email}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">So dien thoai</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(event) => updateForm('phone', event.target.value)}
                    disabled={submitting || !applyOpen}
                    autoComplete="tel"
                  />
                  {fieldErrors.phone && (
                    <p className="text-sm text-destructive">{fieldErrors.phone}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">Ghi chu</Label>
                <Textarea
                  id="note"
                  value={form.note}
                  onChange={(event) => updateForm('note', event.target.value)}
                  disabled={submitting || !applyOpen}
                  placeholder="Thong tin bo sung neu can"
                />
              </div>

              <CvUploadField
                file={cvFile}
                error={fieldErrors.cvFile}
                disabled={submitting || !applyOpen}
                onFileChange={(file, error) => {
                  setCvFile(file);
                  setFieldErrors((prev) => ({ ...prev, cvFile: error }));
                  setResult(null);
                }}
              />

              <div className="flex items-start gap-3 rounded-md border p-3">
                <Checkbox
                  checked={form.consent}
                  onCheckedChange={(checked) => updateForm('consent', checked)}
                  disabled={submitting || !applyOpen}
                  aria-label="Consent"
                />
                <div className="space-y-1">
                  <p className="text-sm">
                    Toi xac nhan thong tin da cung cap la chinh xac va dong y de he thong xu ly ho so ung tuyen.
                  </p>
                  {fieldErrors.consent && (
                    <p className="text-sm text-destructive">{fieldErrors.consent}</p>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting || !applyOpen}
                className="max-w-full whitespace-normal text-left"
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />}
                <span>
                  {submitting
                    ? 'Dang tai CV, quet an toan, tao CV sach va doc thong tin CV...'
                    : 'Gui ho so'}
                </span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{job.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {job.position?.name && <p>Vi tri: {job.position.name}</p>}
            {(job.level?.displayName ?? job.level?.name) && (
              <p>Cap do: {job.level?.displayName ?? job.level?.name}</p>
            )}
            {job.location && <p>Dia diem: {job.location}</p>}
            {job.workingMode && <p>Hinh thuc: {job.workingMode}</p>}
            <p>
              CV duoc ho tro: PDF. He thong can tao CV sach thanh cong truoc khi tiep nhan ho so.
            </p>
          </CardContent>
        </Card>
      </aside>
    </main>
  );
}
