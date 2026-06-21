import { useParams } from 'react-router-dom';

export function PublicApplyResultPage() {
  const { applicationId } = useParams();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Optional public recruitment route</p>
        <h1 className="text-3xl font-semibold">Application status</h1>
        {/* Optional route. Public status API/policy needs confirmation before production use. */}
        <p className="text-sm text-muted-foreground">
          TODO FE-2: confirm public status policy before implementing this route.
        </p>
      </div>
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Application ID</p>
        <p className="text-muted-foreground">{applicationId}</p>
      </div>
    </main>
  );
}
