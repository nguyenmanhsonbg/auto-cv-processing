import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token') ?? '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteInfo, setInviteInfo] = useState<{ email: string | null; role: string; expiresAt: string } | null>(null);
  const [inviteError, setInviteError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return;
    apiClient.get<any>(`/auth/invite/${inviteToken}`)
      .then((info) => {
        setInviteInfo(info);
        if (info.email) setEmail(info.email);
      })
      .catch((err) => {
        setInviteError(err instanceof Error ? err.message : 'Invalid invite token');
      });
  }, [inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiClient.post('/auth/register', {
        name,
        email,
        password,
        ...(inviteToken ? { inviteToken } : {}),
      });
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            {inviteToken ? 'Register with your invite' : 'Create a new account'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inviteToken && inviteError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive mb-4">
              {inviteError}
            </div>
          )}
          {inviteInfo && (
            <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm mb-4 flex items-center gap-2">
              <span className="text-green-700">Valid invite</span>
              <Badge variant="outline">{inviteInfo.role}</Badge>
              {inviteInfo.email && <span className="text-muted-foreground">for {inviteInfo.email}</span>}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={!!(inviteInfo?.email)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={submitting || (!!inviteToken && !!inviteError)}>
              {submitting ? 'Creating account...' : 'Create Account'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
