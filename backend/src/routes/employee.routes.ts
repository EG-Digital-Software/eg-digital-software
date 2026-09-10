import { Router } from 'express';
import multer from 'multer';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/portal.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listEmployeeCustomerQuerySchema } from '../validators/client.validator.js';
import { taskProgressSchema, updateTaskSchema, createAppointmentSchema } from '../validators/task.validator.js';

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
// Appointments (Schedule calendar) for the employee's board.
router.get('/tasks/appointments', ctrl.employeeListAppointments);
router.post('/tasks/appointments', validate({ body: createAppointmentSchema }), ctrl.employeeCreateAppointment);
router.delete('/tasks/appointments/:appointmentId', ctrl.employeeDeleteAppointment);
router.get('/tasks/tasks/:taskId', ctrl.employeeGetTask);
router.patch('/tasks/tasks/:taskId/progress', validate({ body: taskProgressSchema }), ctrl.employeeSetProgress);
router.patch('/tasks/tasks/:taskId', validate({ body: updateTaskSchema }), ctrl.employeeUpdateTask);
router.post('/tasks/tasks/:taskId/comments', upload.single('file'), ctrl.employeeAddComment);
// Deleting a chat message is admin-only — employees cannot delete any message.
router.post('/tasks/tasks/:taskId/notes', ctrl.employeeAddNote);
router.patch('/tasks/tasks/:taskId/notes/:noteId', ctrl.employeeEditNote);
router.delete('/tasks/tasks/:taskId/notes/:noteId', ctrl.employeeDeleteNote);
router.post('/tasks/tasks/:taskId/attachments', upload.single('file'), ctrl.employeeAddAttachment);
router.delete('/tasks/tasks/:taskId/attachments/:attachmentId', ctrl.employeeDeleteAttachment);

export default router;
