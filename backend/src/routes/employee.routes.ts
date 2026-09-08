import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/portal.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listEmployeeCustomerQuerySchema } from '../validators/client.validator.js';
import { taskProgressSchema, updateTaskSchema } from '../validators/task.validator.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const router = Router();
router.use(authenticate, authorize(Role.EMPLOYEE));

router.get('/dashboard', ctrl.employeeDashboard);
router.get('/customers', validate({ query: listEmployeeCustomerQuerySchema }), ctrl.employeeCustomers);
router.get('/licences', ctrl.employeeLicences);

// Task board — mirrors the customer/client task API so the portal reuses the
// same TaskBoard component. Scoped to the tasks the employee is assigned to.
router.get('/tasks', ctrl.employeeTasks);
router.get('/tasks/assignable-users', ctrl.employeeAssignableUsers);
router.get('/tasks/tasks/:taskId', ctrl.employeeGetTask);
router.patch('/tasks/tasks/:taskId/progress', validate({ body: taskProgressSchema }), ctrl.employeeSetProgress);
router.patch('/tasks/tasks/:taskId', validate({ body: updateTaskSchema }), ctrl.employeeUpdateTask);
router.post('/tasks/tasks/:taskId/comments', upload.single('file'), ctrl.employeeAddComment);
router.delete('/tasks/tasks/:taskId/comments/:commentId', ctrl.employeeDeleteComment);
router.post('/tasks/tasks/:taskId/attachments', upload.single('file'), ctrl.employeeAddAttachment);
router.delete('/tasks/tasks/:taskId/attachments/:attachmentId', ctrl.employeeDeleteAttachment);

export default router;
