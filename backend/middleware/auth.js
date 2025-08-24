import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev');
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ message: 'No autorizado' });
  }
}
