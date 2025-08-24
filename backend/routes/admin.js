import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { confirm } from '../controllers/adminController.js';
const router = Router();

router.post('/confirm', requireAuth, confirm);
export default router;
