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
  commentSchema,
  createLabelSchema,
  updateLabelSchema,
} from '../validators/task.validator.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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
  router.get('/tasks/:taskId', ctrl.getTask);

  // Collaboration — available to clients too.
  router.post('/tasks/:taskId/comments', validate({ body: commentSchema }), ctrl.addComment);
  router.delete('/tasks/:taskId/comments/:commentId', ctrl.deleteComment);
  router.post('/tasks/:taskId/attachments', upload.single('file'), ctrl.addAttachment);
  router.delete('/tasks/:taskId/attachments/:attachmentId', ctrl.deleteAttachment);

  if (!readOnly) {
    router.post('/buckets', validate({ body: createBucketSchema }), ctrl.createBucket);
    router.patch('/buckets/reorder', validate({ body: reorderBucketsSchema }), ctrl.reorderBuckets);
    router.patch('/buckets/:bucketId', validate({ body: updateBucketSchema }), ctrl.updateBucket);
    router.delete('/buckets/:bucketId', ctrl.deleteBucket);

    router.post('/tasks', validate({ body: createTaskSchema }), ctrl.createTask);
    router.patch('/tasks/:taskId/move', validate({ body: moveTaskSchema }), ctrl.moveTask);
    router.patch('/tasks/:taskId', validate({ body: updateTaskSchema }), ctrl.updateTask);
    router.delete('/tasks/:taskId', ctrl.deleteTask);

    router.post('/labels', validate({ body: createLabelSchema }), ctrl.createLabel);
    router.patch('/labels/:labelId', validate({ body: updateLabelSchema }), ctrl.updateLabel);
    router.delete('/labels/:labelId', ctrl.deleteLabel);
  }

  return router;
}
