import { TaskBoard } from '@/components/tasks/TaskBoard';
import { employeeTaskApi } from '@/api/tasks';

/**
 * Employee portal — the same task board the admin/client use, scoped to the
 * tasks assigned to the signed-in staff member. Read-only (view, complete,
 * comment and attach); columns are grouped per customer.
 */
export default function EmployeeTasksPage() {
  return (
    <div className="ec-page">
      <div className="up">
        <div className="eyebrow">Task board</div>
        <h1 className="disp ec-h1">Your tasks</h1>
        <p className="muted" style={{ margin: 0 }}>
          Tasks assigned to you across all customers. Open any task to see files, approvals and chat.
        </p>
      </div>
      <section className="glass up" style={{ animationDelay: '.1s', padding: 16, overflow: 'hidden' }}>
        <TaskBoard api={employeeTaskApi()} scopeKey="employee" readOnly groupTabs />
      </section>
    </div>
  );
}
