import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import pool from '../db.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadReceipt = upload.single('receipt');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function createPurchase(req, res, next) {
  try {
    const {
      full_name, document, country_code, phone,
      state, account_holder, payment_ref_last4,
      qty, price, method, email
    } = req.body;

    if (!full_name || !document || !country_code || !phone || !qty || !price)
      return res.status(400).json({ message: 'Faltan campos obligatorios' });

    let receipt_url = null;
    if (req.file) {
      const ft = await fileTypeFromBuffer(req.file.buffer);
      const allow = ['image/jpeg','image/png','image/webp'];
      if (!ft || !allow.includes(ft.mime))
        return res.status(400).json({ message: 'Archivo no permitido' });

      const { Readable } = await import('stream');
      await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'bolidos/receipts', resource_type: 'image' },
          (error, result) => {
            if (error) return reject(error);
            receipt_url = result.secure_url;
            resolve();
          }
        );
        Readable.from(req.file.buffer).pipe(stream);
      });
    }

    const { rows } = await pool.query(
      `insert into purchases
        (full_name,document,country_code,phone,state,account_holder,payment_ref_last4,qty,price,method,receipt_url,status,email)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'received',$12)
       returning id`,
      [full_name, document, country_code, phone, state || null, account_holder || null,
       payment_ref_last4 || null, qty, price, method || null, receipt_url || null, email || null]
    );

    res.status(201).json({ id: rows[0].id, message: 'Recibido' });
  } catch (e) { next(e); }
}
