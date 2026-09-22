import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { UsersRound, UserCheck, ShieldCheck, Eye } from 'lucide-react';
import { adminApi } from '@/api/resources';
import { apiErrorMessage } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage, Skeleton } from '@/components/ui/misc';
import { EmptyState } from '@/components/shared/states';
import { initials, mediaUrl, formatDate, formatNumber } from '@/lib/utils';

function Kpi({
  title,
  icon: Icon,
  value,
  tone,
}: {
  title: string;
  icon: typeof UsersRound;
  value: string;
  tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone ?? 'bg-primary/10 text-primary'}`}
          >
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function TeamDashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const startImpersonation = useAuth((s) => s.startImpersonation);

  const { data, isLoading } = useQuery({
    queryKey: ['team', 'employees'],
    queryFn: () => adminApi.registrations({ role: 'EMPLOYEE', status: 'APPROVED', pageSize: 100 }),
  });
  const employees = data?.items ?? [];
  const activeCount = employees.filter((e) => e.isActive).length;

  const viewPortal = useMutation({
    mutationFn: (id: string) => adminApi.impersonateEmployee(id),
    onSuccess: (session) => {
      startImpersonation({
        user: session.user,
        accessToken: session.accessToken,
        meta: { kind: 'employee', label: session.employee.name, returnTo: '/admin/team' },
      });
      // Drop admin-scoped cache so the team portal fetches fresh as the employee.
      qc.clear();
      navigate('/employee/tasks');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your team, and open any member’s portal to view it as them.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="portals">Employee Portals</TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi
              title="Team Members"
              icon={UsersRound}
              value={isLoading ? '—' : formatNumber(employees.length)}
            />
            <Kpi
              title="Active"
              icon={UserCheck}
              value={isLoading ? '—' : formatNumber(activeCount)}
              tone="bg-success/10 text-success"
            />
            <Kpi
              title="Inactive"
              icon={ShieldCheck}
              value={isLoading ? '—' : formatNumber(employees.length - activeCount)}
              tone="bg-warning/10 text-[hsl(30_90%_38%)]"
            />
          </div>
        </TabsContent>

        {/* ── Employee Portals ─────────────────────────── */}
        <TabsContent value="portals">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team Members</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !employees.length ? (
                <div className="p-6">
                  <EmptyState
                    title="No team members yet"
                    description="Approved team members will appear here. Add them from Approvals → Manage Team."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Last login</TableHead>
                      <TableHead className="text-right">Portal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((emp) => (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              {emp.avatarUrl && <AvatarImage src={mediaUrl(emp.avatarUrl)} alt="" />}
                              <AvatarFallback>{initials(emp.firstName, emp.lastName)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {emp.firstName} {emp.lastName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">{emp.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {emp.designation || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {emp.lastLoginAt ? formatDate(emp.lastLoginAt) : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={viewPortal.isPending}
                            onClick={() => viewPortal.mutate(emp.id)}
                          >
                            <Eye className="h-4 w-4" />
                            View portal
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
