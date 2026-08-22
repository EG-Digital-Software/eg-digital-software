import { Link } from 'react-router-dom';
import { ShieldX, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

function Shell({
  icon,
  code,
  title,
  description,
}: {
  icon: React.ReactNode;
  code: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        {icon}
      </div>
      <p className="text-sm font-medium text-muted-foreground">{code}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-2">
        <Link to="/admin/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <Shell
      icon={<ShieldX className="h-8 w-8" />}
      code="403"
      title="Access forbidden"
      description="You don't have permission to view this page. Contact an administrator if you believe this is an error."
    />
  );
}

export function NotFoundPage() {
  return (
    <Shell
      icon={<FileQuestion className="h-8 w-8" />}
      code="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
    />
  );
}
