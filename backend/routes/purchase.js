import { Router } from 'express';
import { uploadReceipt, createPurchase } from '../controllers/purchaseController.js';
const router = Router();

router.post('/', uploadReceipt, createPurchase);
export default router;

