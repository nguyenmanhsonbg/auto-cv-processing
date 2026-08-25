import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  createInterviewCommittee,
  listInterviewCommitteeUsers,
  listInterviewCommittees,
  updateInterviewCommittee,
  updateInterviewCommitteeMembers,
  type AssignableRecruitmentUser,
  type InterviewCommittee,
} from '@/lib/recruitment-api';

type CommitteeForm = {
  name: string;
  description: string;
  isActive: boolean;
  memberIds: string[];
};

const emptyForm: CommitteeForm = {
  name: '',
  description: '',
  isActive: true,
  memberIds: [],
};

export function CommitteesPage() {
  const [committees, setCommittees] = useState<InterviewCommittee[]>([]);
  const [users, setUsers] = useState<AssignableRecruitmentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InterviewCommittee | null>(null);
  const [form, setForm] = useState<CommitteeForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [committeeItems, committeeUsers] = await Promise.all([
        listInterviewCommittees(),
        listInterviewCommitteeUsers(),
      ]);
      setCommittees(committeeItems);
      setUsers(committeeUsers);
    } catch (error) {
      toast({
        title: 'Không tải được hội đồng chuyên môn',
        description: error instanceof Error ? error.message : 'Vui lòng thử lại.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(committee: InterviewCommittee) {
    setEditing(committee);
    setForm({
      name: committee.name,
      description: committee.description ?? '',
      isActive: committee.isActive,
      memberIds: committee.members.map((member) => member.id),
    });
    setDialogOpen(true);
  }

  function toggleMember(userId: string, checked: boolean) {
    setForm((current) => ({
      ...current,
      memberIds: checked
        ? [...current.memberIds, userId]
        : current.memberIds.filter((id) => id !== userId),
    }));
  }

  async function handleSave() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      };
      const committee = editing
        ? await updateInterviewCommittee(editing.id, { ...payload, isActive: form.isActive })
        : await createInterviewCommittee(payload);
      await updateInterviewCommitteeMembers(committee.id, form.memberIds);
      toast({ title: editing ? 'Đã cập nhật hội đồng' : 'Đã tạo hội đồng' });
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast({
        title: 'Không thể lưu hội đồng',
        description: error instanceof Error ? error.message : 'Vui lòng thử lại.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Hội đồng chuyên môn</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tạo nhóm HĐCM dùng lại khi phân công đánh giá từng vòng phỏng vấn.
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo hội đồng
        </Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Đang tải danh sách hội đồng...</p> : null}
      {!loading && committees.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Chưa có hội đồng chuyên môn. Hãy tạo hội đồng đầu tiên và thêm các tài khoản HĐCM.
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {committees.map((committee) => (
          <Card key={committee.id}>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-xl">{committee.name}</CardTitle>
                <CardDescription className="mt-1">
                  {committee.description || 'Chưa có mô tả'}
                </CardDescription>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(committee)} aria-label={`Sửa ${committee.name}`}>
                <Pencil className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Badge variant={committee.isActive ? 'default' : 'secondary'}>
                  {committee.isActive ? 'Đang hoạt động' : 'Đã tắt'}
                </Badge>
                <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {committee.memberCount} thành viên
                </span>
              </div>
              <div className="space-y-2 rounded-md bg-muted/40 p-3">
                {committee.members.length === 0 ? (
                  <p className="text-sm text-amber-700">Chưa có thành viên HĐCM.</p>
                ) : committee.members.map((member) => (
                  <div key={member.id} className="flex flex-col text-sm">
                    <span className="font-medium">{member.name}</span>
                    <span className="text-muted-foreground">{member.email}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa hội đồng chuyên môn' : 'Tạo hội đồng chuyên môn'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="committee-name">Tên hội đồng *</Label>
              <Input
                id="committee-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ví dụ: Hội đồng Backend"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="committee-description">Mô tả</Label>
              <Textarea
                id="committee-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Phạm vi chuyên môn hoặc JD áp dụng"
              />
            </div>
            {editing ? (
              <div className="flex items-center justify-between rounded-md border p-3">
                <Label htmlFor="committee-active">Cho phép phân công</Label>
                <Switch
                  id="committee-active"
                  checked={form.isActive}
                  onCheckedChange={(isActive) => setForm((current) => ({ ...current, isActive }))}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <div>
                <Label>Thành viên HĐCM</Label>
                <p className="text-xs text-muted-foreground">Chỉ tài khoản có role HĐCM mới xuất hiện trong danh sách.</p>
              </div>
              <div className="space-y-2 rounded-md border p-3">
                {users.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có tài khoản HĐCM.</p> : null}
                {users.map((user) => (
                  <label key={user.id} htmlFor={`committee-member-${user.id}`} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted">
                    <Checkbox
                      id={`committee-member-${user.id}`}
                      checked={form.memberIds.includes(user.id)}
                      onCheckedChange={(checked) => toggleMember(user.id, checked)}
                    />
                    <span className="text-sm">
                      <span className="block font-medium">{user.name}</span>
                      <span className="text-muted-foreground">{user.email}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || !form.name.trim()}>
              {saving ? 'Đang lưu...' : 'Lưu hội đồng'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
