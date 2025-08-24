import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Datos inválidos' });

    const { rows } = await pool.query(
      'select id,email,password_hash,role from users where email=$1',
      [email]
    );
    const user = rows[0];
    if (!user || !user.password_hash)
      return res.status(401).json({ message: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Credenciales inválidas' });

    const token = jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
      process.env.JWT_SECRET || 'dev',
      { expiresIn: '8h' }
    );
    res.json({ token });
  } catch (e) { next(e); }
}

