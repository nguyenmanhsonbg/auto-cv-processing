import { useParams } from 'react-router-dom';

export function JobPostingDetailPage() {
  const { id } = useParams();

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground">Recruitment workspace</p>
        <h1 className="text-2xl font-semibold">Job Posting Detail</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Actor: HR/Admin. Scope: placeholder route only. TODO FE-4: implement posting detail,
        edit, publish and close actions.
      </p>
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Job posting ID</p>
        <p className="text-muted-foreground">{id}</p>
      </div>
    </div>
  );
}
