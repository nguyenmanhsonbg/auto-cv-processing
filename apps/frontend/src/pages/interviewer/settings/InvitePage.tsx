import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/components/ui/use-toast';
import { Copy, Plus, RefreshCw } from 'lucide-react';
import { UserRole } from '@interview-assistant/shared';

interface Invite {
  id: string;
  token: string;
  email: string | null;
  role: UserRole;
  usedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export function InvitePage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.INTERVIEWER);
  const [generatedLink, setGeneratedLink] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchInvites = () => {
    apiClient.get<Invite[]>('/auth/invites').then(setInvites).catch(console.error);
  };

  useEffect(() => { fetchInvites(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    setGeneratedLink('');
    try {
      const result = await apiClient.post<{ inviteUrl: string; token: string }>('/auth/invite', {
        email: email || undefined,
        role,
      });
      setGeneratedLink(result.inviteUrl);
      toast({ title: 'Invite link created' });
      setEmail('');
      fetchInvites();
    } catch (err) {
      toast({ title: 'Failed to create invite', description: err instanceof Error ? err.message : 'Error', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: 'Link copied to clipboard' });
    });
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Invite Users</h1>

      <Card>
        <CardHeader>
          <CardTitle>Generate Invite Link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email (optional — pre-fills registration)</Label>
              <Input
                type="email"
                placeholder="interviewer@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UserRole.INTERVIEWER}>Interviewer</SelectItem>
                  <SelectItem value={UserRole.HR}>HR</SelectItem>
                  <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            <Plus className="h-4 w-4 mr-2" />
            {creating ? 'Generating...' : 'Generate Link'}
          </Button>

          {generatedLink && (
            <div className="flex items-center gap-2 rounded-md bg-muted p-3">
              <code className="flex-1 text-sm break-all">{generatedLink}</code>
              <Button variant="ghost" size="icon" onClick={() => copyToClipboard(generatedLink)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Invite History</h2>
        <Button variant="ghost" size="sm" onClick={fetchInvites}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Link</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invites.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">No invites yet.</TableCell>
            </TableRow>
          ) : (
            invites.map((inv) => {
              const link = `${window.location.origin}/register?token=${inv.token}`;
              return (
                <TableRow key={inv.id}>
                  <TableCell>{inv.email || <span className="text-muted-foreground">Any</span>}</TableCell>
                  <TableCell><Badge variant="outline">{inv.role}</Badge></TableCell>
                  <TableCell>
                    {inv.usedAt ? (
                      <Badge className="bg-green-100 text-green-800">Used</Badge>
                    ) : isExpired(inv.expiresAt) ? (
                      <Badge variant="destructive">Expired</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-800">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{new Date(inv.expiresAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-sm">{new Date(inv.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {!inv.usedAt && !isExpired(inv.expiresAt) && (
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(link)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
