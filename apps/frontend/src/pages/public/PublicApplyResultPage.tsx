import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function PublicApplyResultPage() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card>
        <CardContent className="flex gap-3 pt-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-3">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Application status is not public yet</h1>
              <p className="text-sm text-muted-foreground">
                Status tracking will be available only after the public status token policy is approved.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/">Back</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
