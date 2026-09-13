import mysql.connector
import json

with open('wp-config.json', 'r') as f:
    config = json.load(f)

host = config['DB_HOST']
db   = config['DB_NAME']
user = config['DB_USER']
pw   = config['DB_PASSWORD']
port = config.get('DB_PORT', 3306)

try:
    conn = mysql.connector.connect(
        host=host,
        user=user,
        password=pw,
        database=db,
        port=port
    )
    cursor = conn.cursor()

    # Let's try running the exact SQL statement used in saveSingleSettingRelational
    sKey = "commission_tags_list"
    serialized = json.dumps([{"id": "1", "name": "مهر دو رنگ", "type": "fixed", "value": 2000, "description": "تست"}])
    createdBy = "system"

    setSql = """
        INSERT INTO settings (id, setting_key, setting_value, created_by, updated_at)
        VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          setting_key = VALUES(setting_key),
          setting_value = VALUES(setting_value),
          updated_at = CURRENT_TIMESTAMP
    """

    print("Executing insert...")
    cursor.execute(setSql, (sKey, sKey, serialized, createdBy))
    conn.commit()
    print("SUCCESS!")

except mysql.connector.Error as err:
    print("MySQL Error:", err)
except Exception as e:
    print("Other Exception:", e)
finally:
    if 'conn' in locals() and conn.is_connected():
        cursor.close()
        conn.close()
