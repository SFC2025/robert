import pool from '../db.js';

/**
 * GET /api/tickets?eventId=1
 * Devuelve { sold: [..], reserved: [..] } (reserved solo si reserved_until > now)
 */
export async function getAvailability(req, res, next) {
  try {
    const eventId = Number(req.query.eventId || 1);
    const { rows } = await pool.query(
      `select number, status, reserved_until
         from tickets
        where event_id = $1`,
      [eventId]
    );

    const now = Date.now();
    const sold = [];
    const reserved = [];
    for (const r of rows) {
      if (r.status === 'sold') sold.push(r.number);
      else if (r.status === 'reserved' && r.reserved_until && new Date(r.reserved_until).getTime() > now)
        reserved.push(r.number);
    }

    res.json({ sold, reserved });
  } catch (e) { next(e); }
}

/**
 * POST /api/tickets/reserve
 * body: { eventId: 1, numbers: [123,124], minutes: 15 }
 * Reserva atómicamente los disponibles; si alguno no está libre, devuelve conflicts.
 */
export async function reserve(req, res, next) {
  const client = await pool.connect();
  try {
    const { eventId = 1, numbers = [], minutes = 15 } = req.body || {};
    if (!Array.isArray(numbers) || numbers.length === 0)
      return res.status(400).json({ message: 'numbers vacío' });

    await client.query('begin');

    // Sólo los disponibles y no vencidos
    const { rows } = await client.query(
      `select id, number
         from tickets
        where event_id = $1
          and number = any($2::int[])
          and (
               status = 'available'
            or (status = 'reserved' and (reserved_until is null or reserved_until < now()))
          )
        for update skip locked`,
      [eventId, numbers]
    );

    if (rows.length === 0) {
      await client.query('rollback');
      return res.status(409).json({ conflicts: numbers });
    }

    const ids = rows.map(r => r.id);
    const okNumbers = rows.map(r => r.number);
    const until = minutes > 0 ? `${minutes} minutes` : '15 minutes';

    await client.query(
      `update tickets
          set status='reserved',
              reserved_until = now() + interval '${until}'
        where id = any($1::bigint[])`,
      [ids]
    );

    await client.query('commit');

    // Conflictos: los que pediste menos los que se pudieron reservar
    const conflicts = numbers.filter(n => !okNumbers.includes(n));
    if (conflicts.length) return res.status(207).json({ reserved: okNumbers, conflicts });

    res.status(200).json({ reserved: okNumbers });
  } catch (e) {
    await pool.query('rollback').catch(()=>{});
    next(e);
  } finally {
    client.release();
  }
}

/**
 * POST /api/tickets/sell
 * body: { eventId: 1, numbers: [123,124] }
 * Marca como vendidos (se usa cuando confirmás el pago).
 */
export async function sell(req, res, next) {
  try {
    const { eventId = 1, numbers = [] } = req.body || {};
    if (!Array.isArray(numbers) || numbers.length === 0)
      return res.status(400).json({ message: 'numbers vacío' });

    const { rowCount } = await pool.query(
      `update tickets
          set status='sold', reserved_until = null
        where event_id = $1
          and number = any($2::int[])`,
      [eventId, numbers]
    );

    res.json({ updated: rowCount });
  } catch (e) { next(e); }
}
