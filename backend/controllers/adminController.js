import pool from '../db.js';
import nodemailer from 'nodemailer';

const mask = (n) => '****' + String(n).padStart(4, '0');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

export async function confirm(req, res, next) {
  const client = await pool.connect();
  try {
    const { purchase_id, status } = req.body || {};
    if (!purchase_id || !['approved','rejected'].includes(status))
      return res.status(400).json({ message: 'Datos inválidos' });

    await client.query('begin');

    // compra
    const p = await client.query('select * from purchases where id=$1 for update', [purchase_id]);
    if (!p.rowCount) { await client.query('rollback'); return res.status(404).json({ message: 'Compra no encontrada' }); }
    const purchase = p.rows[0];

    if (status === 'rejected') {
      await client.query('update purchases set status=$1 where id=$2', ['rejected', purchase_id]);
      await client.query('commit');
      return res.json({ message: 'Actualizado' });
    }

    // idempotencia: si ya se asignaron antes
    const already = await client.query(
      'select number from tickets where purchase_id=$1 order by number',
      [purchase_id]
    );
    if (already.rowCount) {
      const list = already.rows.map(r => String(r.number).padStart(4,'0'));
      await client.query('commit');
      return res.json({ message: `Ya asignados: ${list.join(', ')}` });
    }

    // cantidad pedida
    const q = Number(purchase.qty || 1);

    // tomar N disponibles aleatoriamente (estado actual: 'available')
    const sel = await client.query(
      `select id, number from tickets
         where status='available'
         order by random()
         limit $1
         for update skip locked`,
      [q]
    );
    if (sel.rowCount < q) {
      await client.query('rollback');
      return res.status(409).json({ message: 'No hay suficientes tickets disponibles' });
    }

    const ids = sel.rows.map(r => r.id);
    await client.query(
      `update tickets
          set status='sold', reserved_until=null, purchase_id=$1, assigned_at=now()
        where id = any($2::bigint[])`,
      [purchase_id, ids]
    );

    const nums = sel.rows.map(r => r.number);
    const masked = nums.map(n => mask(n));

    await client.query(
      'update purchases set status=$1, masked_numbers=$2 where id=$3',
      ['approved', masked, purchase_id]
    );

    await client.query('commit');

    // email opcional
    if (purchase.email) {
      const html = `
        <p>¡Hola ${purchase.full_name}!</p>
        <p>Aprobamos tu compra (${purchase.method || 'transferencia'}) por $${purchase.price}.</p>
        <p>Tus números asignados: <strong>${masked.join(', ')}</strong></p>`;
      transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: purchase.email,
        subject: 'Confirmación de compra - Números asignados',
        html,
      }).catch(console.error);
    }

    res.json({ message: `Asignados: ${nums.map(n => String(n).padStart(4,'0')).join(', ')}` });
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    next(e);
  } finally {
    client.release();
  }
}
