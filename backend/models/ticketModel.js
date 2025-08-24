const { pool } = require('../db');

const clearExpiredReservations = async (client) => {
  await client.query(
    `UPDATE tickets
     SET status='free', reserved_until=NULL
     WHERE status='reserved' AND reserved_until IS NOT NULL AND reserved_until < NOW()`
  );
};

exports.getAvailability = async (eventId) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await clearExpiredReservations(client);

    const sold = await client.query(
      `SELECT number FROM tickets WHERE event_id=$1 AND status='sold' ORDER BY number`,
      [eventId]
    );
    const reserved = await client.query(
      `SELECT number FROM tickets WHERE event_id=$1 AND status='reserved' ORDER BY number`,
      [eventId]
    );

    await client.query('COMMIT');
    return { sold: sold.rows.map(r=>r.number), reserved: reserved.rows.map(r=>r.number) };
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); }
};

exports.reserve = async (eventId, numbers, minutes=15) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await clearExpiredReservations(client);

    // ¿Cuáles NO están libres ahora?
    const q1 = await client.query(
      `SELECT number FROM tickets
       WHERE event_id=$1 AND number = ANY($2)
       AND (status<>'free' OR (reserved_until IS NOT NULL AND reserved_until > NOW()))`,
      [eventId, numbers]
    );
    const conflicts = q1.rows.map(r=>r.number);
    if (conflicts.length) { await client.query('ROLLBACK'); return { ok:false, conflicts }; }

    // Reservar
    await client.query(
      `UPDATE tickets
       SET status='reserved', reserved_until = NOW() + ($3 || ' minutes')::interval
       WHERE event_id=$1 AND number = ANY($2)`,
      [eventId, numbers, String(minutes)]
    );

    await client.query('COMMIT');
    return { ok:true };
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); }
};

exports.sell = async (eventId, numbers) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await clearExpiredReservations(client);

    // Solo se venden si no están sold ya
    await client.query(
      `UPDATE tickets
       SET status='sold', reserved_until=NULL
       WHERE event_id=$1 AND number = ANY($2)`,
      [eventId, numbers]
    );

    await client.query('COMMIT');
    return { ok:true };
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); }
};
