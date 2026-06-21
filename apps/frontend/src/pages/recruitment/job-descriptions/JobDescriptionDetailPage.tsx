import { useParams } from 'react-router-dom';

export function JobDescriptionDetailPage() {
  const { id } = useParams();

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground">Recruitment workspace</p>
        <h1 className="text-2xl font-semibold">Job Description Detail</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Actor: HR/Admin. Scope: placeholder route only. TODO FE-3: implement JD detail,
        versions and mark-ready flow.
      </p>
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Job description ID</p>
        <p className="text-muted-foreground">{id}</p>
      </div>
    </div>
  );
}
