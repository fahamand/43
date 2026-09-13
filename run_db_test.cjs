const mysql = require('mysql2/promise');
const fs = require('fs');

async function test() {
  const config = JSON.parse(fs.readFileSync('wp-config.json', 'utf8'));
  const pool = mysql.createPool({
    host: config.DB_HOST,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    port: config.DB_PORT || 3306,
  });

  try {
    const conn = await pool.getConnection();
    const sKey = "commission_tags_list";
    const serialized = JSON.stringify([{"id": "1", "name": "مهر دو رنگ", "type": "fixed", "value": 2000, "description": "تست"}]);
    const createdBy = "system";

    const setSql = `
        INSERT INTO settings (id, setting_key, setting_value, created_by, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          setting_key = VALUES(setting_key),
          setting_value = VALUES(setting_value),
          updated_at = CURRENT_TIMESTAMP
    `;

    console.log("Executing insert...");
    await conn.execute(setSql, [sKey, sKey, serialized, createdBy]);
    console.log("SUCCESS!");
    conn.release();
  } catch (err) {
    console.error("Error executing:", err);
  } finally {
    await pool.end();
  }
}

test();
