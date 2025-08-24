import pool from "../db.js";
import { sendMail } from "../services/mailer.js"; // para pruebas; si después no quiero enviar desde aquí, se borra

const mask = (n) => "****" + String(n).padStart(4, "0");

export async function verify(req, res, next) {
  try {
    const { phone, ticket, to } = req.query; // lee "to" opcional

    if (!phone && !ticket) {
      return res.status(400).json({ message: "Enviar phone o ticket" });
    }

    if (phone) {
      const q = await pool.query(
        `select id, status, updated_at, masked_numbers
           from purchases
          where phone = $1
          order by created_at desc
          limit 1`,
        [phone]
      );
      if (!q.rowCount) return res.json({ status: "not_found" });

      const p = q.rows[0];

      if (
        p.status === "approved" ||
        (p.masked_numbers && p.masked_numbers.length)
      ) {
        const payload = {
          status: "assigned",
          masked_numbers: p.masked_numbers || [],
          updated_at: p.updated_at,
        };

        // --- solo envía si ?to=... o hay TEST_TO en .env ---
        if (to || process.env.TEST_TO) {
          await sendMail({
            to,
            subject: "Bólidos Rifas: números asignados",
            html: `<p>Tu compra está <b>ASIGNADA</b>.</p>
                   <p>Números (enmascarados): ${
                     payload.masked_numbers.join(", ") || "(sin lista)"
                   }
                   <br/>Actualizado: ${new Date(
                     payload.updated_at
                   ).toLocaleString()}</p>`,
            text: "Tu compra está ASIGNADA.",
          });
        }

        return res.json(payload);
      }

      const payload = {
        status: "received",
        masked_numbers: [],
        updated_at: p.updated_at,
      };

      // --- solo envía si ?to=... o hay TEST_TO en .env ---
      if (to || process.env.TEST_TO) {
        await sendMail({
          to,
          subject: "Bólidos Rifas: recibimos tu pago",
          html: `<p>Recibimos tu pago. Aún no están asignados los números.</p>
                 <p>Actualizado: ${new Date(
                   payload.updated_at
                 ).toLocaleString()}</p>`,
          text: "Recibimos tu pago. Aún no están asignados los números.",
        });
      }

      return res.json(payload);
    }

    // ticket
    const n = Number(ticket);
    const t = await pool.query(
      "select status from tickets where number=$1 limit 1",
      [n]
    );
    if (!t.rowCount) return res.json({ status: "invalid" });
    const st = t.rows[0].status;
    return res.json({ status: st === "sold" ? "assigned" : st });
  } catch (e) {
    next(e);
  }
}
