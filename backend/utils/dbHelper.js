// utils/dbHelper.js

function validateRequest(req, res, requiredKey = "mac_address") {
  if (!req.zk || !req.zk.isConnected()) {
    res.status(503).json({ error: "ZooKeeper not connected yet" });
    return false;
  }

  if (!req.body || !req.body[requiredKey]) {
    res.status(400).json({ error: `${requiredKey} is required` });
    return false;
  }

  return true;
}

async function withDbConnection(pool, callback) {
  const conn = await pool.getConnection();
  try {
    return await callback(conn);
  } finally {
    conn.release();
  }
}

function buildInsertQuery(tableName, data) {
  const keys = Object.keys(data);
  const values = keys.map((k) => data[k]);
  const placeholders = keys.map(() => "?").join(", ");
  const sql = `INSERT INTO ${tableName} (${keys.join(
    ", "
  )}) VALUES (${placeholders})`;
  return { sql, values };
}

function buildUpdateQuery(tableName, data, whereClause = "mac_address = ?") {
  const keys = Object.keys(data).filter((k) => k !== "mac_address");
  const values = keys.map((k) => data[k]);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const sql = `UPDATE ${tableName} SET ${setClause}, updated_at = NOW() WHERE ${whereClause}`;
  return { sql, values };
}

module.exports = {
  validateRequest,
  withDbConnection,
  buildInsertQuery,
  buildUpdateQuery,
};
