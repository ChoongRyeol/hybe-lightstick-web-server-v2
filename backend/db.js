const mysql = require("mysql2/promise");

const basePoolOptions = {
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "wearable",
  waitForConnections: true,
  connectionLimit: 30,
  queueLimit: 0,
};

const catalogPool = mysql.createPool({
  ...basePoolOptions,
  port: Number(process.env.DB_PORT || 3308),
  database: "lightstickv2_catalog",
});

const dataPool = mysql.createPool({
  ...basePoolOptions,
  port: Number(process.env.DB_PORT || 3308),
  database: "lightstickv2_data",
});

const replicaPool = mysql.createPool({
  ...basePoolOptions,
  host: process.env.REPLICA_DB_HOST || process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.REPLICA_DB_PORT || 3309),
  database: "lightstickv2_data",
});

const authPool = mysql.createPool({
  ...basePoolOptions,
  port: Number(process.env.DB_PORT || 3308),
  database: "lightstickv2_auth",
});

module.exports = {
  dataPool,
  replicaPool,
  authPool,
  catalogPool,
};
