import type { AdminRoute } from '../types';
import ProductsListScreen from './ProductsListScreen';
import ProductDetailScreen from './ProductDetailScreen';
import ProductFormScreen from './ProductFormScreen';
import BulkUploadScreen from './BulkUploadScreen';

/**
 * Products routes (root stack):
 *   ProductsHome        —                     catalogue list (search, status, category)
 *   ProductsDetail      { id }
 *   ProductsForm        { id? }  (no id = new product)
 *   ProductsBulkUpload  —                     CSV / XLS / XLSX import
 */
export const routes: AdminRoute[] = [
  { name: 'ProductsHome', component: ProductsListScreen },
  { name: 'ProductsDetail', component: ProductDetailScreen },
  { name: 'ProductsForm', component: ProductFormScreen },
  { name: 'ProductsBulkUpload', component: BulkUploadScreen },
];
