import { Router } from 'express';
import { verify } from '../controllers/verifyController.js';
const router = Router();

router.get('/', verify);
export default router;

