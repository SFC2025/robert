import express from 'express';
import pool from '../db.js';

const router = express.Router();

/*
  Tabla tickets:
  - event_id int
  - number int
  - status text ('available' | 'reserved' | 'sold')
  - reserved_until timestamptz NULL
  unique(event_id, number)
*/

router.get('/', async (req, res, next) => {
  try {
    const eventId = Number(req.query.eventId || 1);

    // Limpieza de reservas vencidas
    await pool.query(
      `update tickets
         set status='available', reserved_until=null
       where event_id=$1
         and status='reserved'
         and reserved_until is not null
         and reserved_until < now()`,
      [eventId]
    );

    const rows = await pool.query(
      `select number, status from tickets where event_id=$1`,
      [eventId]
    );

    const sold = [];
    const reserved = [];
    for (const r of rows.rows) {
      if (r.status === 'sold') sold.push(r.number);
      else if (r.status === 'reserved') reserved.push(r.number);
    }
    res.json({ sold, reserved });
  } catch (e) { next(e); }
});

router.post('/reserve', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { eventId = 1, numbers = [], minutes = 15 } = req.body || {};
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ message: 'Faltan números.' });
    }

    await client.query('begin');

    const conflicts = [];
    for (const n of numbers) {
      const q = await client.query(
        `select id, status, reserved_until
           from tickets
          where event_id=$1 and number=$2
          for update`,
        [eventId, n]
      );
      if (q.rowCount === 0) { conflicts.push(n); continue; }
      const t = q.rows[0];

      const stillReserved = t.status === 'reserved' && t.reserved_until && t.reserved_until > new Date();
      if (t.status === 'sold' || stillReserved) {
        conflicts.push(n);
        continue;
      }

      await client.query(
        `update tickets
            set status='reserved',
                reserved_until=now() + ($3)::interval
          where id=$1`,
        [t.id, eventId, `${minutes} minutes`]
      );
    }

    if (conflicts.length) {
      await client.query('rollback');
      return res.status(409).json({ message: 'Conflicto', conflicts });
    }

    await client.query('commit');
    res.json({ message: 'Reservados' });
  } catch (e) {
    await client.query('rollback');
    next(e);
  } finally {
    client.release();
  }
});

router.post('/sell', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { eventId = 1, numbers = [] } = req.body || {};
    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ message: 'Faltan números.' });
    }

    await client.query('begin');

    const conflicts = [];
    for (const n of numbers) {
      const q = await client.query(
        `select id, status
           from tickets
          where event_id=$1 and number=$2
          for update`,
        [eventId, n]
      );
      if (q.rowCount === 0) { conflicts.push(n); continue; }
      if (q.rows[0].status === 'sold') { conflicts.push(n); continue; }

      await client.query(
        `update tickets
            set status='sold', reserved_until=null
          where id=$1`,
        [q.rows[0].id]
      );
    }

    if (conflicts.length) {
      await client.query('rollback');
      return res.status(409).json({ message: 'Conflicto', conflicts });
    }

    await client.query('commit');
    res.json({ message: 'Vendidos' });
  } catch (e) {
    await client.query('rollback');
    next(e);
  } finally {
    client.release();
  }
});

export default router;
