import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/task.controller.js';
import { validate } from '../middleware/validate.js';
import {
  createBucketSchema,
  updateBucketSchema,
  reorderBucketsSchema,
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  taskProgressSchema,
  createLabelSchema,
  updateLabelSchema,
  submitApprovalSchema,
  decideApprovalSchema,
  createAppointmentSchema,
} from '../validators/task.validator.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
// Approval attachments: no size or count cap — admins may upload files of any
// size, as many as they like.
const uploadApproval = multer({ storage: multer.memoryStorage() });

/**
 * Full task board — used by the admin (mounted under /customers/:clientId/tasks)
 * and the client portal (mounted under /client/tasks). mergeParams lets the
 * admin mount see :clientId; the controller resolves the customer either way.
 *
 * `readOnly` trims the client portal down to viewing plus collaboration
 * (comments and attachments) — clients cannot restructure the board.
 */
export function buildTaskRouter(readOnly = false): Router {
  const router = Router({ mergeParams: true });

  // Board + reference data
  router.get('/', ctrl.board);
  router.get('/assignable-users', ctrl.assignableUsers);
  router.get('/labels', ctrl.listLabels);

  // Appointments (Schedule calendar) — available to clients too, so anyone
  // viewing the board can book a meeting with the task assignees.
  router.get('/appointments', ctrl.listAppointments);
  router.post('/appointments', validate({ body: createAppointmentSchema }), ctrl.createAppointment);
  router.delete('/appointments/:appointmentId', ctrl.deleteAppointment);

  router.get('/tasks/:taskId', ctrl.getTask);

  // Collaboration — available to clients too.
  router.patch('/tasks/:taskId/progress', validate({ body: taskProgressSchema }), ctrl.setProgress);
  // Clients may edit a task's content (title, notes, checklist, assignees); the
  // controller strips the fields locked in the portal (start/due/priority).
  router.patch('/tasks/:taskId', validate({ body: updateTaskSchema }), ctrl.updateTask);
  router.post('/tasks/:taskId/comments', upload.single('file'), ctrl.addComment);
  // Notes thread — available to clients too, like comments. Editing is limited
  // to your own notes (enforced in the controller/service).
  router.post('/tasks/:taskId/notes', ctrl.addNote);
  router.patch('/tasks/:taskId/notes/:noteId', ctrl.editNote);
  router.delete('/tasks/:taskId/notes/:noteId', ctrl.deleteNote);
  router.post('/tasks/:taskId/attachments', upload.single('file'), ctrl.addAttachment);
  router.delete('/tasks/:taskId/attachments/:attachmentId', ctrl.deleteAttachment);

  // Approvals — admins and the customer submit requests and decide them; the
  // decision itself is role-gated inside the controller (team members view only).
  router.post('/tasks/:taskId/approvals', uploadApproval.array('files'), validate({ body: submitApprovalSchema }), ctrl.submitApproval);
  router.patch('/tasks/:taskId/approvals/:approvalId', validate({ body: decideApprovalSchema }), ctrl.decideApproval);
  // Re-open a decided approval (admin-only, enforced in the controller).
  router.post('/tasks/:taskId/approvals/:approvalId/reopen', ctrl.reopenApproval);
  router.delete('/tasks/:taskId/approvals/:approvalId', ctrl.deleteApproval);

  if (!readOnly) {
    router.post('/buckets', validate({ body: createBucketSchema }), ctrl.createBucket);
    router.patch('/buckets/reorder', validate({ body: reorderBucketsSchema }), ctrl.reorderBuckets);
    router.patch('/buckets/:bucketId', validate({ body: updateBucketSchema }), ctrl.updateBucket);
    router.delete('/buckets/:bucketId', ctrl.deleteBucket);

    router.post('/tasks', validate({ body: createTaskSchema }), ctrl.createTask);
    router.patch('/tasks/:taskId/move', validate({ body: moveTaskSchema }), ctrl.moveTask);
    router.delete('/tasks/:taskId', ctrl.deleteTask);
    // Deleting a chat message is admin-only. The client board mounts this router
    // with readOnly=true, so clients never get this route; only the admin does.
    router.delete('/tasks/:taskId/comments/:commentId', ctrl.deleteComment);

    router.post('/labels', validate({ body: createLabelSchema }), ctrl.createLabel);
    router.patch('/labels/:labelId', validate({ body: updateLabelSchema }), ctrl.updateLabel);
    router.delete('/labels/:labelId', ctrl.deleteLabel);
  }

  return router;
}
