import { z } from 'zod';

export const createProductSchema = z.object({
  productCode: z.string().min(1, 'Product code is required'),
  sku: z.string().optional(),
  type: z.string().optional(),
  name: z.string().min(1, 'Product name is required'),
  description: z.string().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
  pricePerQty: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  totalStock: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(10),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const updateProductSchema = createProductSchema.partial();

export const listProductQuerySchema = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().or(z.literal('')),
  stock: z.enum(['low', 'out']).optional().or(z.literal('')),
  category: z.string().optional(),
  sortBy: z
    .enum(['name', 'productCode', 'availableStock', 'pricePerQty', 'createdAt'])
    .optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
});
