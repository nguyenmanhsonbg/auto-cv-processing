import { Link, useParams } from 'react-router-dom';

export function PublicJobDetailPage() {
  const { slug } = useParams();

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Public recruitment route</p>
        <h1 className="text-3xl font-semibold">Public job detail</h1>
        <p className="text-sm text-muted-foreground">
          TODO FE-2: fetch published job detail by slug and render the public job page.
        </p>
      </div>
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-medium">Route slug</p>
        <p className="text-muted-foreground">{slug}</p>
      </div>
      <Link className="inline-flex text-sm font-medium text-primary hover:underline" to="apply">
        Continue to apply placeholder
      </Link>
    </main>
  );
}
