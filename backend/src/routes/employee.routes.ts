import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/portal.controller.js';
import * as teamRoles from '../controllers/teamRole.controller.js';
import * as social from '../controllers/social.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listEmployeeCustomerQuerySchema } from '../validators/client.validator.js';
import { taskProgressSchema, updateTaskSchema, createAppointmentSchema, submitApprovalSchema, approvalUploadSchema, timeEntrySchema, updateTimeEntrySchema, timeSheetEntrySchema } from '../validators/task.validator.js';

// Chat files and attachments: no size cap — mirrors the admin task board.
const upload = multer({ storage: multer.memoryStorage() });
// Approval attachments carry no size/count cap — mirrors the admin task board.
const uploadApproval = multer({ storage: multer.memoryStorage() });

const router = Router();
router.use(authenticate, authorize(Role.EMPLOYEE));

// Admin tabs this team member's roles grant — drives their portal navigation.
router.get('/access', teamRoles.myAccess);
router.get('/dashboard', ctrl.employeeDashboard);
router.get('/customers', validate({ query: listEmployeeCustomerQuerySchema }), ctrl.employeeCustomers);
router.get('/licences', ctrl.employeeLicences);

// Task board — mirrors the customer/client task API so the portal reuses the
// same TaskBoard component. Scoped to the tasks the employee is assigned to.
router.get('/tasks', ctrl.employeeTasks);
router.get('/tasks/assignable-users', ctrl.employeeAssignableUsers);
// Appointments (Schedule calendar) for the employee's board.
router.get('/tasks/appointments', ctrl.employeeListAppointments);
router.post('/tasks/appointments', validate({ body: createAppointmentSchema }), ctrl.employeeCreateAppointment);
router.delete('/tasks/appointments/:appointmentId', ctrl.employeeDeleteAppointment);
// Board Time Sheet — pools covering the employee's tasks; they log time on their own tasks.
router.get('/tasks/timesheet', ctrl.employeeTimeSheet);
router.post('/tasks/timesheet/pools/:poolId/entries', validate({ body: timeSheetEntrySchema }), ctrl.employeeAddTimeSheetEntry);
router.get('/tasks/tasks/:taskId', ctrl.employeeGetTask);
router.get('/tasks/tasks/:taskId/mentionable-users', ctrl.employeeMentionableUsers);
router.get('/tasks/tasks/:taskId/hour-products', ctrl.employeeHourProducts);
// Time sheet — the team logs time on their tasks and can change their own entries.
router.get('/tasks/tasks/:taskId/time-entries', ctrl.employeeTimeEntries);
router.post('/tasks/tasks/:taskId/time-entries', validate({ body: timeEntrySchema }), ctrl.employeeAddTimeEntry);
router.patch('/tasks/tasks/:taskId/time-entries/:entryId', validate({ body: updateTimeEntrySchema }), ctrl.employeeUpdateTimeEntry);
router.delete('/tasks/tasks/:taskId/time-entries/:entryId', ctrl.employeeDeleteTimeEntry);
router.patch('/tasks/tasks/:taskId/progress', validate({ body: taskProgressSchema }), ctrl.employeeSetProgress);
router.patch('/tasks/tasks/:taskId', validate({ body: updateTaskSchema }), ctrl.employeeUpdateTask);
router.post('/tasks/tasks/:taskId/uploads/upload-url', validate({ body: approvalUploadSchema }), ctrl.employeeTaskUploadUrl);
router.post('/tasks/tasks/:taskId/comments', upload.single('file'), ctrl.employeeAddComment);
router.post('/tasks/tasks/:taskId/comments/:commentId/reactions', ctrl.employeeToggleCommentReaction);
// Deleting a chat message is admin-only — employees cannot delete any message.
router.post('/tasks/tasks/:taskId/notes', ctrl.employeeAddNote);
router.patch('/tasks/tasks/:taskId/notes/:noteId', ctrl.employeeEditNote);
router.delete('/tasks/tasks/:taskId/notes/:noteId', ctrl.employeeDeleteNote);
// Access Point tab: locked behind the team member's own PIN, like the admin board.
router.post('/tasks/tasks/:taskId/access-point/unlock', ctrl.employeeUnlockAccessPoint);
router.get('/tasks/tasks/:taskId/access-point', ctrl.employeeGetAccessPoint);
// Social Media Dashboard — same as the admin board, scoped to the member's tasks.
router.get('/tasks/tasks/:taskId/social', social.employee.get);
router.put('/tasks/tasks/:taskId/social', social.employee.save);
router.put('/tasks/tasks/:taskId/social/metrics', social.employee.saveMetrics);
router.post('/tasks/tasks/:taskId/social/sync', social.employee.sync);
router.post('/tasks/tasks/:taskId/social/connect/:provider', social.employee.connect);
router.patch('/tasks/tasks/:taskId/social/connections/:connectionId', social.employee.select);
router.delete('/tasks/tasks/:taskId/social/connections/:connectionId', social.employee.disconnect);
router.post('/tasks/tasks/:taskId/attachments', upload.single('file'), ctrl.employeeAddAttachment);
router.delete('/tasks/tasks/:taskId/attachments/:attachmentId', ctrl.employeeDeleteAttachment);
// Raise an approval request (subject/message + optional files). Deciding stays admin/customer-only.
router.post('/tasks/tasks/:taskId/approvals', uploadApproval.array('files'), validate({ body: submitApprovalSchema }), ctrl.employeeSubmitApproval);
router.post('/tasks/tasks/:taskId/approvals/upload-url', validate({ body: approvalUploadSchema }), ctrl.employeeApprovalUploadUrl);
// Resubmit a rejected request — nests a new request under the rejected one.
router.post('/tasks/tasks/:taskId/approvals/:approvalId/resubmit', uploadApproval.array('files'), validate({ body: submitApprovalSchema }), ctrl.employeeResubmitApproval);

export default router;
