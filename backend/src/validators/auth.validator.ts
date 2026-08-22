import { z } from 'zod';

const portalEnum = z.enum(['SUPER_ADMIN', 'CLIENT', 'SUPPLIER', 'EMPLOYEE']);

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
  // When present, scopes the login to a single portal's accounts table so a
  // user of one portal cannot sign in on another portal's page.
  portal: portalEnum.optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  portal: portalEnum.optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z
  .object({
    role: z.enum(['CLIENT', 'SUPPLIER', 'EMPLOYEE']),
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    clientId: z.string().optional(),
  })
  .refine((d) => d.role !== 'CLIENT' || !!d.clientId, {
    message: 'Client ID is required',
    path: ['clientId'],
  })
  .refine((d) => d.role === 'CLIENT' || (!!d.firstName && !!d.lastName), {
    message: 'First and last name are required',
    path: ['firstName'],
  });

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(80).optional(),
  lastName: z.string().min(1, 'Last name is required').max(80).optional(),
  email: z.string().email('Enter a valid email').optional(),
});
