import { Router } from 'express';
import authRoutes from './auth.routes.js';
import customerRoutes from './customer.routes.js';
import productRoutes from './product.routes.js';
import invoiceRoutes from './invoice.routes.js';
import paymentRoutes from './payment.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import clientRoutes from './client.routes.js';
import supplierRoutes from './supplier.routes.js';
import employeeRoutes from './employee.routes.js';
import adminRoutes from './admin.routes.js';
import notificationRoutes from './notification.routes.js';
import geoRoutes from './geo.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, message: 'ok', data: { up: true } }));

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/products', productRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/payments', paymentRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/client', clientRoutes);
router.use('/supplier', supplierRoutes);
router.use('/employee', employeeRoutes);
router.use('/admin', adminRoutes);
router.use('/notifications', notificationRoutes);
router.use('/geo', geoRoutes);

export default router;
