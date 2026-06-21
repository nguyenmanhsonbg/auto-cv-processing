import { useParams } from 'react-router-dom';

export function PublicJobApplyPage() {
  const { slug } = useParams();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Public recruitment route</p>
        <h1 className="text-3xl font-semibold">Apply for job</h1>
        <p className="text-sm text-muted-foreground">
          TODO FE-2: implement public apply form and CV upload. FE-1 does not call APIs.
        </p>
      </div>
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Route slug</p>
        <p className="text-muted-foreground">{slug}</p>
      </div>
    </main>
  );
}
