/**
 * One-time fix: recalculate tax and totalAmount for all existing invoices
 * using Indiana 7% tax rate (tax = amount * 0.07, totalAmount = amount + tax).
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  const result = await client.query(`
    UPDATE "Invoice"
    SET
      tax          = ROUND("amount" * 0.07, 2),
      "totalAmount" = ROUND("amount" * 1.07, 2)
    WHERE "archivedAt" IS NULL
    RETURNING id, "invoiceNumber", "amount", tax, "totalAmount"
  `);

  console.log(`Updated ${result.rowCount} invoice(s):`);
  for (const row of result.rows) {
    console.log(
      `  ${row.invoiceNumber}: subtotal=$${row.amount}  tax=$${row.tax}  total=$${row.totalAmount}`
    );
  }
} catch (err) {
  console.error('Error updating invoices:', err.message);
  process.exit(1);
} finally {
  await client.end();
}
