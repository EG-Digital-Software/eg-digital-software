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
  approvalUploadSchema,
  decideApprovalSchema,
  createAppointmentSchema,
  timeEntrySchema,
  updateTimeEntrySchema,
} from '../validators/task.validator.js';

// Chat files and attachments: no size cap. Large files normally skip the API
// entirely (direct-to-storage upload URL); this path serves small fallbacks.
const upload = multer({ storage: multer.memoryStorage() });
// Approval attachments: no size or count cap — admins may upload files of any
// size, as many as they like.
const uploadApproval = multer({ storage: multer.memoryStorage() });
// Archive media: admins store files/images/videos of any type or size, kept
// raw so they download at original quality — no cap, like approval files.
const archiveUpload = multer({ storage: multer.memoryStorage() });

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
  // Who can be @mentioned in this task's chat — admins, team, and the customer's clients.
  router.get('/tasks/:taskId/mentionable-users', ctrl.mentionableUsers);
  // Hours the customer has bought — the Time Sheet tab's summary (read-only).
  router.get('/tasks/:taskId/hour-products', ctrl.hourProducts);
  router.get('/tasks/:taskId/time-entries', ctrl.timeEntries);

  // Collaboration — available to clients too.
  router.patch('/tasks/:taskId/progress', validate({ body: taskProgressSchema }), ctrl.setProgress);
  // Clients may edit a task's content (title, notes, checklist, assignees); the
  // controller strips the fields locked in the portal (start/due/priority).
  router.patch('/tasks/:taskId', validate({ body: updateTaskSchema }), ctrl.updateTask);
  // Direct-to-storage upload URL for one chat/attachment file (any size).
  router.post('/tasks/:taskId/uploads/upload-url', validate({ body: approvalUploadSchema }), ctrl.taskUploadUrl);
  router.post('/tasks/:taskId/comments', upload.single('file'), ctrl.addComment);
  // Emoji reactions on a chat message — anyone in the chat may react (toggle).
  router.post('/tasks/:taskId/comments/:commentId/reactions', ctrl.toggleCommentReaction);
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
  // Direct-to-storage upload URL for one approval file (large videos skip the API).
  router.post('/tasks/:taskId/approvals/upload-url', validate({ body: approvalUploadSchema }), ctrl.approvalUploadUrl);
  // Resubmit a rejected request — nests a new request under it (admin-only, enforced in the controller).
  router.post('/tasks/:taskId/approvals/:approvalId/resubmit', uploadApproval.array('files'), validate({ body: submitApprovalSchema }), ctrl.resubmitApproval);
  router.patch('/tasks/:taskId/approvals/:approvalId', validate({ body: decideApprovalSchema }), ctrl.decideApproval);
  // Re-open a decided approval (admin-only, enforced in the controller).
  router.post('/tasks/:taskId/approvals/:approvalId/reopen', ctrl.reopenApproval);
  // Re-open an expired 48-hour resubmission window (admin-only, enforced in the controller).
  router.post('/tasks/:taskId/approvals/:approvalId/reopen-resubmit', ctrl.reopenResubmitWindow);
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

    // Time sheet — logging time is admin/team only; the client board is readOnly
    // so clients just view entries (the service also checks the role).
    router.post('/tasks/:taskId/time-entries', validate({ body: timeEntrySchema }), ctrl.addTimeEntry);
    router.patch('/tasks/:taskId/time-entries/:entryId', validate({ body: updateTimeEntrySchema }), ctrl.updateTimeEntry);
    router.delete('/tasks/:taskId/time-entries/:entryId', ctrl.deleteTimeEntry);

    router.post('/labels', validate({ body: createLabelSchema }), ctrl.createLabel);
    router.patch('/labels/:labelId', validate({ body: updateLabelSchema }), ctrl.updateLabel);
    router.delete('/labels/:labelId', ctrl.deleteLabel);

    // Archive tab — admin-only. The client board mounts readOnly=true and the
    // team board has its own routes, so only the admin can upload/rename/delete
    // archived media; everyone else views it through the task payload.
    router.post('/tasks/:taskId/archive', archiveUpload.single('file'), ctrl.uploadArchive);
    router.patch('/tasks/:taskId/archive/:attachmentId', ctrl.renameArchive);
    router.delete('/tasks/:taskId/archive/:attachmentId', ctrl.deleteArchive);
  }

  return router;
}
