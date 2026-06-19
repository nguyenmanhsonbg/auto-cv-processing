import { Outlet } from 'react-router-dom';
import { Separator } from '@/components/ui/separator';

export function CandidateLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-muted/40">
        <div className="container mx-auto px-6 py-4">
          <h1 className="text-xl font-bold">VCS Interview</h1>
        </div>
      </header>
      <Separator />
      <main className="container mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
