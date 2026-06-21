import { useParams } from 'react-router-dom';

export function ApplicationDetailPage() {
  const { applicationId } = useParams();

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-muted-foreground">Recruitment workspace</p>
        <h1 className="text-2xl font-semibold">Application Detail</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Actor: HR/Admin. Scope: placeholder route only. TODO FE-5: implement application
        overview. TODO FE-6: add CV processing, clean CV, parsed profile and CV versions as
        detail sections or tabs.
      </p>
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Application ID</p>
        <p className="text-muted-foreground">{applicationId}</p>
      </div>
    </div>
  );
}
