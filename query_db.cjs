const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
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
    
    // List tables
    const [tables] = await conn.query("SHOW TABLES");
    console.log("Tables in DB:", tables.map(t => Object.values(t)[0]));

    // Query app_state
    const [rows] = await conn.query("SELECT state_key, LENGTH(state_value) as len, SUBSTRING(state_value, 1, 100) as excerpt, updated_at FROM app_state");
    console.log("\nRows in app_state:");
    rows.forEach(r => {
      console.log(`- ${r.state_key}: length=${r.len}, excerpt=${r.excerpt}, updated_at=${r.updated_at}`);
    });

    // Query specifically commission_tags_list
    const [tagRows] = await conn.query("SELECT * FROM app_state WHERE state_key = 'commission_tags_list'");
    console.log("\ncommission_tags_list entry:");
    console.log(tagRows);

    conn.release();
  } catch (err) {
    console.error("Error executing:", err);
  } finally {
    await pool.end();
  }
}

main();
