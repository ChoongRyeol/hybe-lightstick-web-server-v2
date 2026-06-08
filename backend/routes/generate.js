// routes/mac.js
const express = require("express");
const router = express.Router();
const { dataPool } = require("../db");
const requireAuth = require("../middleware/auth");

/**
 *
 */
function toInt(v, def, min, max) {
  const n = parseInt(v, 10);
  const x = Number.isNaN(n) ? def : n;
  return Math.min(Math.max(x, min), max);
}

/**
 *
 *
 */
router.get("/groups", async (req, res) => {
  try {
    const [rows] = await dataPool.query(
      `
      SELECT g.generator_name
      FROM process_generated_macs g
      INNER JOIN (
        SELECT generator_name, MAX(id) AS max_id
        FROM process_generated_macs
        WHERE is_hidden = 0
        GROUP BY generator_name
      ) t
        ON g.id = t.max_id
      ORDER BY g.id DESC;
      `,
    );

    return res.json({
      success: true,
      message: "",
      data: rows.map((r) => r.generator_name),
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      errorCode: 500,
    });
  }
});

/**
 * ??generator_name + lightstick 목록
 */
router.get("/groups/with-lightstick", async (req, res) => {
  try {
    const [rows] = await dataPool.query(`
      SELECT g.generator_name, g.lightstick
      FROM process_generated_macs g
      INNER JOIN (
        SELECT generator_name, MAX(id) AS max_id
        FROM process_generated_macs
        WHERE is_hidden = 0
        GROUP BY generator_name
      ) t
        ON g.id = t.max_id
      ORDER BY g.generator_name ASC
    `);

    return res.json({
      success: true,
      message: "",
      data: rows.map((r) => ({
        generator_name: r.generator_name,
        lightstick: r.lightstick,
      })),
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      errorCode: 500,
    });
  }
});

/**
 *
 *
 *
 */
router.get("/", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name query is required",
      data: null,
      errorCode: 1,
    });
  }


  const limitRaw = req.query.limit;
  const useLimit =
    limitRaw !== undefined &&
    limitRaw !== null &&
    String(limitRaw).trim() !== "";
  const limit = useLimit ? toInt(limitRaw, 1000, 1, 100000) : null;

  try {
    const [rows] = await dataPool.query(
      `
      SELECT *
      FROM process_generated_macs
      WHERE generator_name = ?
      ORDER BY id ASC
      ${useLimit ? "LIMIT ?" : ""}
      `,
      useLimit ? [generator_name, limit] : [generator_name],
    );


    const enriched = rows.map((row, index) => ({
      ...row,
      QR_Code: `${row.lightstick}_${row.mac_address}`,
      No: index + 1,
    }));

    return res.json({
      success: true,
      message: "",
      data: enriched,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
      errorCode: 500,
    });
  }
});

/**
 *
 */
router.post("/backup", requireAuth, async (req, res) => {
  const { generator_name } = req.body;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name is required",
      errorCode: 1,
    });
  }

  const TABLES_IN_ORDER = [
    "cartonbox_label_print_exceptions",
    "cartonbox_label_print_logs",
    "device_label_print_logs",
    "giftbox_label_print_logs",
    "process_compare_log",
    "process_device_test_log",
    "process_mac_check_log",
    "process_compare",
    "process_device_test",
    "process_mac_check",
    "mac_delete_logs",
    "process_generated_macs",
  ];

  let conn;
  try {
    conn = await dataPool.getConnection();
    await conn.beginTransaction();

    const detail = {};
    let totalDeleted = 0;
    let totalBackedUp = 0;

    for (const tableName of TABLES_IN_ORDER) {
      const backupTable = `${tableName}_backup`;

      const [backupResult] = await conn.query(
        `
        INSERT INTO ${backupTable}
        SELECT *
        FROM ${tableName}
        WHERE generator_name = ?
        `,
        [generator_name],
      );

      const [deleteResult] = await conn.query(
        `
        DELETE FROM ${tableName}
        WHERE generator_name = ?
        `,
        [generator_name],
      );

      detail[tableName] = {
        backupCount: backupResult.affectedRows,
        deletedCount: deleteResult.affectedRows,
      };

      totalBackedUp += backupResult.affectedRows;
      totalDeleted += deleteResult.affectedRows;
    }

    await conn.commit();

    return res.json({
      success: true,
      message: `Backup and delete completed (backup ${totalBackedUp}, delete ${totalDeleted})`,
      generator_name,
      detail,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("[generated] error:", rollbackErr);
      }
    }
    return res.status(500).json({
      success: false,
      message: "Server error",
      errorCode: 500,
    });
  } finally {
    if (conn) conn.release();
  }
});
router.post("/delete", requireAuth, async (req, res) => {
  const { generator_name } = req.body;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name is required",
      errorCode: 1,
    });
  }

  const TABLES_IN_ORDER = [
    "cartonbox_label_print_exceptions",
    "cartonbox_label_print_logs",
    "device_label_print_logs",
    "giftbox_label_print_logs",
    "process_compare_log",
    "process_device_test_log",
    "process_mac_check_log",
    "process_compare",
    "process_device_test",
    "process_mac_check",
    "mac_delete_logs",
    "process_generated_macs",
  ];

  let conn;
  try {
    conn = await dataPool.getConnection();
    await conn.beginTransaction();

    const detail = {};
    let totalDeleted = 0;

    for (const tableName of TABLES_IN_ORDER) {
      const [deleteResult] = await conn.query(
        `
        DELETE FROM ${tableName}
        WHERE generator_name = ?
        `,
        [generator_name],
      );

      detail[tableName] = {
        deletedCount: deleteResult.affectedRows,
      };

      totalDeleted += deleteResult.affectedRows;
    }

    await conn.commit();

    return res.json({
      success: true,
      message: `Delete completed (${totalDeleted})`,
      generator_name,
      detail,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("[generated] error:", rollbackErr);
      }
    }
    return res.status(500).json({
      success: false,
      message: "Server error",
      errorCode: 500,
    });
  } finally {
    if (conn) conn.release();
  }
});
/**
 *
 */
router.get("/by-mac", async (req, res) => {
  const { mac_address } = req.query;

  if (!mac_address) {
    return res.status(400).json({
      success: false,
      message: "mac_address query is required",
      data: null,
      errorCode: 1,
    });
  }

  try {
    const [rows] = await dataPool.query(
      `
      SELECT *
      FROM process_generated_macs
      WHERE mac_address = ?
      LIMIT 1
      `,
      [mac_address],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid request",
        data: null,
        errorCode: 404,
      });
    }

    const row = rows[0];
    const enriched = {
      ...row,
      QR_Code: `${row.lightstick}_${row.mac_address}`,
    };

    return res.json({
      success: true,
      message: "",
      data: enriched,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
      errorCode: 500,
    });
  }
});

/**
 *
 *
 */
router.get("/page", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name query is required",
      data: null,
      errorCode: 1,
    });
  }

  const limit = toInt(req.query.page_size, 100, 1, 1000);
  const currentPage = toInt(req.query.page, 1, 1, 1000000000);
  const offset = (currentPage - 1) * limit;

  try {
    const [rows] = await dataPool.query(
      `
      SELECT *
      FROM process_generated_macs
      WHERE generator_name = ?
      ORDER BY id ASC
      LIMIT ? OFFSET ?
      `,
      [generator_name, limit, offset],
    );

    const enriched = rows.map((row, index) => ({
      ...row,
      QR_Code: `${row.lightstick}_${row.mac_address}`,
      No: offset + index + 1,
    }));

    return res.json({
      success: true,
      message: "",
      data: enriched,
      errorCode: 0,
      page: currentPage,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
      errorCode: 500,
    });
  }
});

/**
 *
 */
router.get("/last-serial", async (req, res) => {
  const { lightstick } = req.query;

  if (!lightstick) {
    return res.status(400).json({
      success: false,
      message: "lightstick query is required",
      data: null,
      errorCode: 1,
    });
  }

  try {
    const [rows] = await dataPool.query(
      `
      SELECT serial
      FROM process_generated_macs
      WHERE lightstick = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [lightstick],
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: "Invalid request",
        data: null,
        errorCode: 0,
      });
    }

    return res.json({
      success: true,
      message: "",
      data: rows[0].serial,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
      errorCode: 500,
    });
  }
});


router.post("/by_start_serial", async (req, res) => {
  const { startSerial, count, generator_name } = req.body;


  if (!generator_name || typeof generator_name !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "generator_name is required" });
  }

  if (!startSerial || typeof startSerial !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "startSerial is required" });
  }

  const n = parseInt(count, 10);
  if (Number.isNaN(n) || n <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid request" });
  }


  if (n > 5000) {
    return res
      .status(400)
      .json({ success: false, message: "count max is 5000" });
  }

  const gen = generator_name.trim();
  const start = startSerial.trim();

  try {
    const [rows] = await dataPool.query(
      `
      SELECT 
        mac_address,
        serial,
        generator_name,
        artist,
        model,
        device_name,
        lightstick,
        certification_info
      FROM process_generated_macs
      WHERE generator_name = ?
        AND serial >= ?
      ORDER BY serial ASC
      LIMIT ?
      `,
      [gen, start, n],
    );

    const data = rows.map((row) => ({
      MacAddress: row.mac_address,
      Serial: row.serial,
      GeneratorName: row.generator_name,
      Artist: row.artist,
      Model: row.model,
      DeviceName: row.device_name,
      Lightstick: row.lightstick,
      CertificationInfo: row.certification_info,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});
/**
 *
 *
 */
router.post("/by_serials", async (req, res) => {
  const { serials, generator_name } = req.body;

  if (!serials || !Array.isArray(serials)) {
    return res
      .status(400)
      .json({ success: false, message: "serials array is required" });
  }

  if (!generator_name || typeof generator_name !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "generator_name is required" });
  }

  if (serials.length === 0) return res.json({ success: true, data: [] });

  if (serials.length > 5000) {
    return res
      .status(400)
      .json({ success: false, message: "serials max is 5000" });
  }

  try {
    const [rows] = await dataPool.query(
      `
      SELECT 
        mac_address, 
        serial, 
        generator_name, 
        artist, 
        model, 
        device_name, 
        lightstick, 
        certification_info
      FROM process_generated_macs
      WHERE generator_name = ?
        AND serial IN (?)
      `,
      [generator_name, serials],
    );

    const dict = new Map();
    for (const row of rows) {
      dict.set(row.serial, {
        MacAddress: row.mac_address,
        Serial: row.serial,
        GeneratorName: row.generator_name,
        Artist: row.artist,
        Model: row.model,
        DeviceName: row.device_name,
        Lightstick: row.lightstick,
        CertificationInfo: row.certification_info,
      });
    }

    const ordered = [];
    for (const s of serials) {
      const info = dict.get(s);
      if (info) ordered.push(info);
    }

    return res.json({ success: true, data: ordered });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 *
 */
router.post("/by_macs", async (req, res) => {
  const { macs } = req.body;

  if (!macs || !Array.isArray(macs)) {
    return res.status(400).json({ success: false, message: "macs array is required" });
  }
  if (macs.length === 0) return res.json({ success: true, data: [] });
  if (macs.length > 5000) {
    return res
      .status(400)
      .json({ success: false, message: "macs max is 5000" });
  }

  try {
    const [rows] = await dataPool.query(
      `
      SELECT mac_address, serial, generator_name, artist, model, device_name, lightstick, certification_info
      FROM process_generated_macs
      WHERE mac_address IN (?)
      `,
      [macs],
    );

    return res.json({
      success: true,
      data: rows.map((row) => ({
        MacAddress: row.mac_address,
        Serial: row.serial,
        GeneratorName: row.generator_name,
        Artist: row.artist,
        Model: row.model,
        DeviceName: row.device_name,
        Lightstick: row.lightstick,
        CertificationInfo: row.certification_info,
      })),
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 *
 *
 *
 * - page = ceil(rownum/pageSize)
 */
router.get("/find_serial_page", async (req, res) => {
  const { generator_name, serial } = req.query;
  const pageSize = toInt(req.query.page_size, 100, 1, 1000);

  if (!generator_name || !serial) {
    return res.status(400).json({
      success: false,
      message: "generator_name or serial is required",
      errorCode: 1,
    });
  }

  try {

    const [[rowSerial]] = await dataPool.query(
      `
      SELECT id, mac_address
      FROM process_generated_macs
      WHERE generator_name = ?
        AND serial = ?
      LIMIT 1
      `,
      [generator_name, serial],
    );

    if (!rowSerial) {
      return res.status(404).json({
        success: false,
        message: "Invalid request",
        errorCode: 404,
      });
    }

    const targetId = rowSerial.id;


    const [[cnt]] = await dataPool.query(
      `
      SELECT COUNT(*) AS rownum
      FROM process_generated_macs
      WHERE generator_name = ?
        AND id <= ?
      `,
      [generator_name, targetId],
    );

    const rownum = cnt?.rownum || 0;
    if (rownum === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid request",
        errorCode: 404,
      });
    }

    const page = Math.ceil(rownum / pageSize);

    return res.json({
      success: true,
      page,
      rownum,
      mac: rowSerial.mac_address,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      errorCode: 500,
    });
  }
});

/**
 *
 */
router.get("/find_mac_page", async (req, res) => {
  const { generator_name, mac } = req.query;
  const pageSize = toInt(req.query.page_size, 100, 1, 1000);

  if (!generator_name || !mac) {
    return res.status(400).json({
      success: false,
      message: "generator_name or mac is required",
      errorCode: 1,
    });
  }

  try {
    const [[rowMac]] = await dataPool.query(
      `
      SELECT id, serial
      FROM process_generated_macs
      WHERE generator_name = ?
        AND mac_address = ?
      LIMIT 1
      `,
      [generator_name, mac],
    );

    if (!rowMac) {
      return res.status(404).json({
        success: false,
        message: "Invalid request",
        errorCode: 404,
      });
    }

    const targetId = rowMac.id;
    const serial = rowMac.serial;

    const [[cnt]] = await dataPool.query(
      `
      SELECT COUNT(*) AS rownum
      FROM process_generated_macs
      WHERE generator_name = ?
        AND id <= ?
      `,
      [generator_name, targetId],
    );

    const rownum = cnt.rownum || 0;
    if (rownum === 0) {
      return res.status(404).json({
        success: false,
        message: "Invalid request",
        errorCode: 404,
      });
    }

    const page = Math.ceil(rownum / pageSize);

    return res.json({
      success: true,
      page,
      rownum,
      serial,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      errorCode: 500,
    });
  }
});

/**
 *
 *
 *
 *
 */
router.post("/", requireAuth, async (req, res) => {
  const {
    artist,
    lightstick,
    macs,
    start_serial,
    generator_name,
    fw_version,
    device_name,
    model,
    certification_info,
  } = req.body;

  if (
    !artist ||
    !lightstick ||
    !macs ||
    !Array.isArray(macs) ||
    macs.length === 0 ||
    !start_serial ||
    !generator_name ||
    !fw_version ||
    !device_name
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid request" });
  }

  try {
    const macAddresses = macs.map((m) => m.mac);


    const [existingMacs] = await dataPool.query(
      `SELECT mac_address FROM process_generated_macs WHERE mac_address IN (?) LIMIT 1`,
      [macAddresses],
    );

    if (existingMacs.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Invalid request",
        duplicates: existingMacs.map((m) => m.mac_address),
      });
    }


    const chunkSize = 10000;
    let insertCount = 0;

    for (let i = 0; i < macs.length; i += chunkSize) {
      const chunk = macs
        .slice(i, i + chunkSize)
        .map(({ mac, serial }) => [
          generator_name,
          artist,
          lightstick,
          mac,
          serial,
          fw_version,
          device_name,
          model,
          certification_info,
        ]);

      await dataPool.query(
        `
        INSERT INTO process_generated_macs
          (generator_name, artist, lightstick, mac_address, serial, fw_version, device_name, model, certification_info)
        VALUES ?
        `,
        [chunk],
      );

      insertCount += chunk.length;
    }

    return res.json({
      success: true,
      message: "Invalid request",
      count: insertCount,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * ??generator_name 중복 체크
 */
router.get("/check-generator", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid request" });
  }

  try {
    const [rows] = await dataPool.query(
      `SELECT 1 FROM process_generated_macs WHERE generator_name = ? LIMIT 1`,
      [generator_name],
    );

    if (rows.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: "Invalid request" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/range-summary", async (req, res) => {
  const page = toInt(req.query.page, 0, 0, 1000000000);
  const limit = toInt(req.query.limit, 50, 1, 200);
  const parsedOffset = page * limit;

  try {

    const [countRows] = await dataPool.query(`
      SELECT COUNT(DISTINCT generator_name) AS total
      FROM process_generated_macs
    `);
    const totalCount = countRows[0]?.total ?? 0;


    const [pageGenerators] = await dataPool.query(
      `
      SELECT generator_name, MAX(created_at) AS last_created_at
      FROM process_generated_macs
      GROUP BY generator_name
      ORDER BY last_created_at DESC
      LIMIT ? OFFSET ?
      `,
      [limit, parsedOffset],
    );

    if (pageGenerators.length === 0) {
      return res.json({
        success: true,
        data: [],
        totalCount,
        errorCode: 0,
      });
    }

    const generatorNames = pageGenerators.map((g) => g.generator_name);


    const MAC_DEC_SQL = (expr) =>
      `CAST(CONV(REPLACE(${expr}, ':', ''), 16, 10) AS UNSIGNED)`;


    const SERIAL_NUM_SQL = (expr) =>
      `CAST(REGEXP_SUBSTR(${expr}, '[0-9]+$') AS UNSIGNED)`;

    /**
     * ??목표
     *
     *
     *
     *
     *
     */
    const [rows] = await dataPool.query(
      `
      WITH mac_with_decimal AS (
        SELECT
          generator_name,
          mac_address,
          ${MAC_DEC_SQL("mac_address")} AS mac_decimal
        FROM process_generated_macs
        WHERE generator_name IN (?)
      ),
      mac_agg AS (
        SELECT
          generator_name,
          MIN(mac_decimal) AS min_dec,
          MAX(mac_decimal) AS max_dec,
          COUNT(*) AS total_count,
          COUNT(DISTINCT mac_decimal) AS distinct_count
        FROM mac_with_decimal
        GROUP BY generator_name
      ),
      mac_start_end AS (
        SELECT
          a.generator_name,
          (
            SELECT m.mac_address
            FROM mac_with_decimal m
            WHERE m.generator_name = a.generator_name
              AND m.mac_decimal = a.min_dec
            LIMIT 1
          ) AS start_mac,
          (
            SELECT m.mac_address
            FROM mac_with_decimal m
            WHERE m.generator_name = a.generator_name
              AND m.mac_decimal = a.max_dec
            LIMIT 1
          ) AS end_mac,
          a.min_dec AS start_decimal,
          a.max_dec AS end_decimal,
          (a.max_dec - a.min_dec + 1) AS expected_count,
          a.total_count,
          a.distinct_count,
          (a.total_count - a.distinct_count) AS duplicate_count,
          ((a.max_dec - a.min_dec + 1) - a.distinct_count) AS missing_count,
          CASE
            WHEN a.distinct_count = (a.max_dec - a.min_dec + 1)
              THEN '??YES'
            ELSE '??NO'
          END AS is_continuous
        FROM mac_agg a
      ),


      serial_with_num AS (
        SELECT
          generator_name,
          serial,
          ${SERIAL_NUM_SQL("serial")} AS serial_num
        FROM process_generated_macs
        WHERE generator_name IN (?)
          AND serial IS NOT NULL
          AND TRIM(serial) <> ''
          AND REGEXP_SUBSTR(serial, '[0-9]+$') IS NOT NULL
      ),
      serial_agg AS (
        SELECT
          generator_name,
          MIN(serial_num) AS min_serial_num,
          MAX(serial_num) AS max_serial_num
        FROM serial_with_num
        GROUP BY generator_name
      ),
      serial_start_end AS (
        SELECT
          a.generator_name,
          (
            SELECT s.serial
            FROM serial_with_num s
            WHERE s.generator_name = a.generator_name
              AND s.serial_num = a.min_serial_num
            LIMIT 1
          ) AS serial_start,
          (
            SELECT s.serial
            FROM serial_with_num s
            WHERE s.generator_name = a.generator_name
              AND s.serial_num = a.max_serial_num
            LIMIT 1
          ) AS serial_end
        FROM serial_agg a
      ),

      latest_meta AS (
        SELECT
          t.generator_name,
          MIN(t.artist) AS artist,
          MIN(t.lightstick) AS lightstick,
          MIN(t.fw_version) AS fw_version,
          MIN(t.device_name) AS device_name,
          MIN(t.model) AS model,
          MIN(t.certification_info) AS certification_info,
          MAX(t.created_at) AS created_at,
          MAX(t.is_hidden) AS is_hidden
        FROM process_generated_macs t
        WHERE t.generator_name IN (?)
        GROUP BY t.generator_name
      )

      SELECT
        mse.generator_name,
        mse.start_mac,
        mse.end_mac,


        mse.expected_count,
        mse.total_count,
        mse.distinct_count,
        mse.duplicate_count,
        mse.missing_count,

        mse.is_continuous,


        sse.serial_start,
        sse.serial_end,

        lm.artist,
        lm.lightstick,
        lm.fw_version,
        lm.device_name,
        lm.model,
        lm.certification_info,
        lm.created_at,
        lm.is_hidden

      FROM mac_start_end mse
      LEFT JOIN serial_start_end sse
        ON mse.generator_name = sse.generator_name
      LEFT JOIN latest_meta lm
        ON mse.generator_name = lm.generator_name
      ORDER BY lm.created_at DESC;
      `,

      [generatorNames, generatorNames, generatorNames],
    );

    return res.json({
      success: true,
      data: rows,
      totalCount,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
      errorCode: 500,
    });
  }
});

/**
 * ??병합
 */
router.post("/merge", requireAuth, async (req, res) => {
  const { source_generators, target_generator, note } = req.body;

  if (
    !Array.isArray(source_generators) ||
    source_generators.length < 2 ||
    !target_generator
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid request" });
  }


  const sources = [
    ...new Set(
      source_generators.map((v) => String(v || "").trim()).filter(Boolean),
    ),
  ];

  const target = String(target_generator || "").trim();

  if (sources.length < 2 || !target) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid request" });
  }


  if (sources.includes(target)) {
    return res.status(400).json({
      success: false,
      message: "Invalid request",
    });
  }



  const role = String(req.user?.role || "")
    .trim()
    .toUpperCase();
  if (role !== "ADMIN") {
    return res
      .status(403)
      .json({ success: false, message: "Invalid request" });
  }

  const conn = await dataPool.getConnection();

  try {
    await conn.beginTransaction();


    const [[{ cnt }]] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM process_generated_macs WHERE generator_name IN (?)`,
      [sources],
    );

    if (!cnt) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }


    const [existRows] = await conn.query(
      `SELECT DISTINCT generator_name FROM process_generated_macs WHERE generator_name IN (?)`,
      [sources],
    );
    const exists = new Set(existRows.map((r) => r.generator_name));
    const missing = sources.filter((g) => !exists.has(g));
    if (missing.length > 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }


    const [rows] = await conn.query(
      `
      SELECT DISTINCT artist, lightstick
      FROM process_generated_macs
      WHERE generator_name IN (?)
      `,
      [sources],
    );

    if (rows.length > 1) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid request",
      });
    }


    const tables = [
      "process_generated_macs",
      "cartonbox_label_print_exceptions",
      "cartonbox_label_print_logs",
      "device_label_print_logs",
      "giftbox_label_print_logs",
      "mac_delete_logs",
      "process_compare",
      "process_compare_log",
      "process_device_test",
      "process_mac_check",
      "process_device_test_log",
      "process_mac_check_log",
    ];


    const mergedBy = req.user?.id || req.user?.name || null;


    const [logResult] = await conn.query(
      `
      INSERT INTO generator_merge_logs (target_generator, source_generators, merged_by, note)
      VALUES (?, ?, ?, ?)
      `,
      [
        target,
        JSON.stringify(sources),
        mergedBy,
        note ? String(note).slice(0, 500) : null,
      ],
    );


    const affected = {};
    let totalAffected = 0;

    for (const table of tables) {
      const [r] = await conn.query(
        `
        UPDATE ${table}
        SET generator_name = ?
        WHERE generator_name IN (?)
        `,
        [target, sources],
      );

      // mysql2: r.affectedRows
      affected[table] = r.affectedRows ?? 0;
      totalAffected += affected[table];
    }

    await conn.commit();

    return res.json({
      success: true,
      message: "Merge completed",
      merged_from: sources,
      merged_to: target,
      merge_log_id: logResult?.insertId ?? null,
      affected,
      totalAffected,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[generated] error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

/**
 *
 */
router.get("/latest", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name required" });
  }

  try {
    const [rows] = await dataPool.query(
      `
      SELECT *
      FROM process_generated_macs
      WHERE generator_name = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [generator_name],
    );

    if (rows.length > 0) return res.json({ success: true, data: rows[0] });
    return res.json({ success: false, message: "Not found" });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */
router.post("/update", async (req, res) => {
  const {
    old_generator_name,
    generator_name,
    artist,
    lightstick,
    device_name,
    fw_version,
    model,
    certification_info,
    start_mac,
    end_mac,
  } = req.body ?? {};

  const oldGen = (old_generator_name ?? "").trim();
  const newGen = (generator_name ?? "").trim();

  if (!oldGen || !newGen) {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }


  const sRaw = (start_mac ?? "").trim().toUpperCase();
  const eRaw = (end_mac ?? "").trim().toUpperCase();


  if (sRaw || eRaw) {
    return res.status(400).json({
      success: false,
      code: "RANGE_NOT_ALLOWED",
      message: "Invalid request",
    });
  }

  let normStart = sRaw;
  let normEnd = eRaw;

  if (normStart && !normEnd) normEnd = normStart;
  if (!normStart && normEnd) normStart = normEnd;

  const hasRange = !!(normStart && normEnd);
  const noRange = !hasRange;

  const conn = await dataPool.getConnection();


  const TABLES_TO_MOVE = [
    "mac_delete_logs",
    "process_compare",
    "process_compare_log",
    "process_device_test",
    "process_mac_check",
    "process_device_test_log",
    "process_mac_check_log",
    "cartonbox_label_print_logs",
    "device_label_print_logs",
    "giftbox_label_print_logs",
  ];

  const ALL_TABLES_FOR_RENAME = ["process_generated_macs", ...TABLES_TO_MOVE];
  const ALLOWED_TABLES = new Set(ALL_TABLES_FOR_RENAME);

  function assertAllowedTable(table) {
    if (!ALLOWED_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
  }


  const MAC_DEC_SQL = (expr) =>
    `CAST(CONV(REPLACE(${expr}, ':', ''), 16, 10) AS UNSIGNED)`;


  function normalizeHex(mac) {
    return mac.replace(/:/g, "");
  }
  function isMacHex12(hex) {
    return /^[0-9A-F]{12}$/.test(hex);
  }
  function macToDecBigInt(mac) {
    const hex = normalizeHex(mac);
    if (!isMacHex12(hex)) {
      throw new Error(
        `Invalid MAC format: ${mac} (expected AA:BB:CC:DD:EE:FF)`,
      );
    }
    return BigInt("0x" + hex);
  }

  async function existsGeneratorName(genName) {
    const [[row]] = await conn.query(
      `SELECT 1 AS ok FROM process_generated_macs WHERE generator_name = ? LIMIT 1`,
      [genName],
    );
    return !!row;
  }

  async function ensureMacExistsInGen(genName, mac) {
    const [[row]] = await conn.query(
      `
      SELECT 1 AS ok
      FROM process_generated_macs
      WHERE generator_name = ?
        AND mac_address = ?
      LIMIT 1
      `,
      [genName, mac],
    );
    if (!row) {
      throw new Error(
        `Input MAC(${mac}) does not exist in generator_name=${genName}.`,
      );
    }
  }


  async function getGlobalMacDecRange(genName) {
    const [[row]] = await conn.query(
      `
      SELECT
        MIN(${MAC_DEC_SQL("mac_address")}) AS minDec,
        MAX(${MAC_DEC_SQL("mac_address")}) AS maxDec,
        COUNT(*) AS cnt
      FROM process_generated_macs
      WHERE generator_name = ?
      `,
      [genName],
    );

    if (!row || Number(row.cnt) === 0) {
      throw new Error(
        `No process_generated_macs data for generator_name=${genName}.`,
      );
    }

    return {
      minDec: Number(row.minDec),
      maxDec: Number(row.maxDec),
      cnt: Number(row.cnt),
    };
  }


  async function validateSplitRangeByMacDec(oldGenName, selMinDec, selMaxDec) {
    const global = await getGlobalMacDecRange(oldGenName);

    const isPrefix = selMinDec === global.minDec && selMaxDec < global.maxDec;
    const isSuffix = selMaxDec === global.maxDec && selMinDec > global.minDec;
    const isAll = selMinDec === global.minDec && selMaxDec === global.maxDec;

    if (!(isPrefix || isSuffix || isAll)) {
      throw new Error(
        `Selected range must be prefix or suffix of the whole range. ` +
          `(whole dec=${global.minDec}~${global.maxDec}, selected dec=${selMinDec}~${selMaxDec})`,
      );
    }


    const [[movedRow]] = await conn.query(
      `
      SELECT COUNT(*) AS cnt
      FROM process_generated_macs
      WHERE generator_name = ?
        AND ${MAC_DEC_SQL("mac_address")} BETWEEN ? AND ?
      `,
      [oldGenName, selMinDec, selMaxDec],
    );

    const movedCnt = Number(movedRow.cnt);
    if (movedCnt <= 0) {
      throw new Error(
        `Cannot split: selected range has no data in ${oldGenName}.`,
      );
    }


    if (!isAll) {
      const [[remainRow]] = await conn.query(
        `
        SELECT COUNT(*) AS cnt
        FROM process_generated_macs
        WHERE generator_name = ?
          AND ${MAC_DEC_SQL("mac_address")} NOT BETWEEN ? AND ?
        `,
        [oldGenName, selMinDec, selMaxDec],
      );

      const remainCnt = Number(remainRow.cnt);
      if (remainCnt <= 0) {
        throw new Error(
          `Cannot split: selected range has no data in ${oldGenName}.`,
        );
      }
    }

    return true;
  }


  async function buildTempMoveMacs(oldGenName, selMinDec, selMaxDec) {
    await conn.query(`DROP TEMPORARY TABLE IF EXISTS tmp_move_macs`);
    await conn.query(`
      CREATE TEMPORARY TABLE tmp_move_macs (
        mac_address VARCHAR(32) PRIMARY KEY
      ) ENGINE=MEMORY
    `);

    const [ins] = await conn.query(
      `
      INSERT INTO tmp_move_macs(mac_address)
      SELECT DISTINCT mac_address
      FROM process_generated_macs
      WHERE generator_name = ?
        AND ${MAC_DEC_SQL("mac_address")} BETWEEN ? AND ?
      `,
      [oldGenName, selMinDec, selMaxDec],
    );

    return ins?.affectedRows ?? 0;
  }


  async function updateGeneratorNameByTmpMacs(table, oldGenName, newGenName) {
    assertAllowedTable(table);

    const [r] = await conn.query(
      `
      UPDATE \`${table}\`
      SET generator_name = ?
      WHERE generator_name = ?
        AND mac_address IN (SELECT mac_address FROM tmp_move_macs)
      `,
      [newGenName, oldGenName],
    );

    return r?.affectedRows ?? 0;
  }

  async function updateMetaForGeneratedOnly(genName) {
    const [r] = await conn.query(
      `
      UPDATE process_generated_macs
      SET artist = ?, lightstick = ?, device_name = ?, fw_version = ?, certification_info = ?, model = ?, updated_at = NOW(6)
      WHERE generator_name = ?
      `,
      [
        artist ?? null,
        lightstick ?? null,
        device_name ?? null,
        fw_version ?? null,
        certification_info ?? null,
        model ?? null,
        genName,
      ],
    );
    return r?.affectedRows ?? 0;
  }

  async function updateMetaForGenerator(genName) {
    await updateMetaForGeneratedOnly(genName);

    const fwOnlyTables = [
      "mac_delete_logs",
      "process_compare",
      "process_compare_log",
      "process_device_test",
      "process_mac_check",
      "process_device_test_log",
      "process_mac_check_log",
    ];

    for (const table of fwOnlyTables) {
      assertAllowedTable(table);

      const updateQuery =
        table === "mac_delete_logs"
          ? `UPDATE \`${table}\`
             SET artist = ?, lightstick = ?, device_name = ?, fw_version = ?
             WHERE generator_name = ?`
          : `UPDATE \`${table}\`
             SET artist = ?, lightstick = ?, device_name = ?, fw_version = ?, updated_at = NOW(6)
             WHERE generator_name = ?`;

      await conn.query(updateQuery, [
        artist ?? null,
        lightstick ?? null,
        device_name ?? null,
        fw_version ?? null,
        genName,
      ]);
    }

    await conn.query(
      `
      UPDATE cartonbox_label_print_logs
      SET artist = ?, lightstick = ?, device_name = ?, model = ?, updated_at = NOW(6)
      WHERE generator_name = ?
      `,
      [
        artist ?? null,
        lightstick ?? null,
        device_name ?? null,
        model ?? null,
        genName,
      ],
    );

    const certAndModelTables = [
      "device_label_print_logs",
      "giftbox_label_print_logs",
    ];
    for (const table of certAndModelTables) {
      assertAllowedTable(table);

      await conn.query(
        `
        UPDATE \`${table}\`
        SET artist = ?, lightstick = ?, device_name = ?, model = ?, certification_info = ?, updated_at = NOW(6)
        WHERE generator_name = ?
        `,
        [
          artist ?? null,
          lightstick ?? null,
          device_name ?? null,
          model ?? null,
          certification_info ?? null,
          genName,
        ],
      );
    }
  }

  async function renameGeneratorEverywhere(oldName, newName) {
    const affected = {};
    for (const table of ALL_TABLES_FOR_RENAME) {
      assertAllowedTable(table);
      const [r] = await conn.query(
        `UPDATE \`${table}\` SET generator_name = ? WHERE generator_name = ?`,
        [newName, oldName],
      );
      affected[table] = r?.affectedRows ?? 0;
    }
    return affected;
  }

  async function getCurrentMeta(genName) {
    const [[row]] = await conn.query(
      `
      SELECT artist, lightstick, device_name, fw_version, model, certification_info
      FROM process_generated_macs
      WHERE generator_name = ?
      LIMIT 1
      `,
      [genName],
    );
    return row || null;
  }

  function normStr(v) {
    return (v ?? "").toString().trim();
  }

  function isMetaChanged(currentMeta) {
    if (!currentMeta) return true;
    return (
      normStr(currentMeta.artist) !== normStr(artist) ||
      normStr(currentMeta.lightstick) !== normStr(lightstick) ||
      normStr(currentMeta.device_name) !== normStr(device_name) ||
      normStr(currentMeta.fw_version) !== normStr(fw_version) ||
      normStr(currentMeta.model) !== normStr(model) ||
      normStr(currentMeta.certification_info) !== normStr(certification_info)
    );
  }

  try {
    await conn.beginTransaction();

    // =========================


    // =========================
    if (hasRange) {

      await ensureMacExistsInGen(oldGen, normStart);
      await ensureMacExistsInGen(oldGen, normEnd);


      const sDec = macToDecBigInt(normStart);
      const eDec = macToDecBigInt(normEnd);
      const selMinDecBI = sDec < eDec ? sDec : eDec;
      const selMaxDecBI = sDec < eDec ? eDec : sDec;


      const selMinDec = Number(selMinDecBI);
      const selMaxDec = Number(selMaxDecBI);


      const global = await getGlobalMacDecRange(oldGen);
      const isFullRange =
        selMinDec === global.minDec && selMaxDec === global.maxDec;


      if (isFullRange) {

        if (oldGen === newGen) {
          const pgmAffected = await updateMetaForGeneratedOnly(oldGen);
          await conn.commit();
          return res.json({
            success: true,
            mode: "META_ONLY_PGM",
            generator_name: oldGen,
            affectedRows: { process_generated_macs: pgmAffected },
          });
        }


        if (await existsGeneratorName(newGen)) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            code: "GENERATOR_NAME_ALREADY_EXISTS",
            message: "Invalid request",
          });
        }

        const currentMeta = await getCurrentMeta(oldGen);
        const metaChanged = isMetaChanged(currentMeta);

        const renameAffected = await renameGeneratorEverywhere(oldGen, newGen);


        if (metaChanged) {
          await updateMetaForGenerator(newGen);
        }

        await conn.commit();
        return res.json({
          success: true,
          mode: metaChanged ? "RENAME_WITH_META" : "RENAME_ONLY",
          generator_name: newGen,
          renameAffectedRows: renameAffected,
        });
      }

      // =========================

      // =========================
      if (oldGen === newGen) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "GENERATOR_NAME_REQUIRED_FOR_SPLIT",
          message: "Invalid request",
        });
      }

      if (await existsGeneratorName(newGen)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "GENERATOR_NAME_ALREADY_EXISTS",
          message: "Invalid request",
        });
      }


      await validateSplitRangeByMacDec(oldGen, selMinDec, selMaxDec);

      const targetGen = newGen;
      const affected = {};


      const movedMacRows = await buildTempMoveMacs(
        oldGen,
        selMinDec,
        selMaxDec,
      );
      if (movedMacRows <= 0) {
        throw new Error("Move target MAC list is empty (tmp_move_macs=0)");
      }


      {
        const [r] = await conn.query(
          `
          UPDATE process_generated_macs
          SET generator_name = ?, updated_at = NOW(6)
          WHERE generator_name = ?
            AND mac_address IN (SELECT mac_address FROM tmp_move_macs)
          `,
          [targetGen, oldGen],
        );
        affected.process_generated_macs = r?.affectedRows ?? 0;
      }


      for (const table of TABLES_TO_MOVE) {
        affected[table] = await updateGeneratorNameByTmpMacs(
          table,
          oldGen,
          targetGen,
        );
      }


      await updateMetaForGenerator(oldGen);
      await updateMetaForGenerator(targetGen);

      await conn.commit();
      return res.json({
        success: true,
        mode: "SPLIT",
        old_generator_name: oldGen,
        new_generator_name: targetGen,
        moved_range: {
          start_mac: normStart,
          end_mac: normEnd,
          selMinDec,
          selMaxDec,
          movedMacRows,
        },
        affectedRows: affected,
      });
    }

    // =========================

    // =========================


    if (noRange && oldGen === newGen) {
      const pgmAffected = await updateMetaForGeneratedOnly(oldGen);
      await conn.commit();
      return res.json({
        success: true,
        mode: "META_ONLY_PGM",
        generator_name: oldGen,
        affectedRows: { process_generated_macs: pgmAffected },
      });
    }


    if (noRange && oldGen !== newGen) {
      if (await existsGeneratorName(newGen)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "GENERATOR_NAME_ALREADY_EXISTS",
          message: "Invalid request",
        });
      }

      const currentMeta = await getCurrentMeta(oldGen);
      const metaChanged = isMetaChanged(currentMeta);

      const renameAffected = await renameGeneratorEverywhere(oldGen, newGen);

      if (metaChanged) {
        await updateMetaForGenerator(newGen);
      }

      await conn.commit();
      return res.json({
        success: true,
        mode: metaChanged ? "RENAME_WITH_META" : "RENAME_ONLY",
        generator_name: newGen,
        renameAffectedRows: renameAffected,
      });
    }

    await conn.rollback();
    return res
      .status(400)
      .json({ success: false, message: "Invalid request" });
  } catch (err) {
    await conn.rollback();
    console.error("[generated] error:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});
router.post("/split", async (req, res) => {
  const { source_generator, target_generator, serial_start, serial_end } =
    req.body ?? {};

  const oldGen = String(source_generator ?? "").trim();
  const newGen = String(target_generator ?? "").trim();

  const sRaw = String(serial_start ?? "").trim();
  const eRaw = String(serial_end ?? "").trim();

  if (!oldGen || !newGen) {
    return res.status(400).json({
      success: false,
      code: "REQUIRED",
      message: "Invalid request",
    });
  }
  if (!sRaw || !eRaw) {
    return res.status(400).json({
      success: false,
      code: "REQUIRED",
      message: "Invalid request",
    });
  }
  if (oldGen === newGen) {
    return res.status(400).json({
      success: false,
      code: "SAME_NAME",
      message: "Invalid request",
    });
  }


  const TABLES_TO_MOVE = [
    "mac_delete_logs",
    "process_compare",
    "process_compare_log",
    "process_device_test",
    "process_mac_check",
    "process_device_test_log",
    "process_mac_check_log",
    "cartonbox_label_print_logs",
    "device_label_print_logs",
    "giftbox_label_print_logs",
  ];
  const ALL_TABLES_FOR_RENAME = ["process_generated_macs", ...TABLES_TO_MOVE];
  const ALLOWED_TABLES = new Set(ALL_TABLES_FOR_RENAME);

  function assertAllowedTable(table) {
    if (!ALLOWED_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
  }




  function parseSerialInput(v) {
    const s = String(v ?? "").trim();

    const m = s.match(/^(.*?)(\d+)$/);
    if (m) {
      return {
        prefix: m[1],
        numStr: m[2],
        num: parseInt(m[2], 10),
        width: m[2].length,
        isFull: true,
      };
    }

    if (/^\d+$/.test(s)) {
      return {
        prefix: null,
        numStr: s,
        num: parseInt(s, 10),
        width: s.length,
        isFull: false,
      };
    }
    return null;
  }

  const sParsed = parseSerialInput(sRaw);
  const eParsed = parseSerialInput(eRaw);

  if (
    !sParsed ||
    !eParsed ||
    Number.isNaN(sParsed.num) ||
    Number.isNaN(eParsed.num)
  ) {
    return res.status(400).json({
      success: false,
      code: "BAD_SERIAL",
      message: "Invalid request",
    });
  }

  const conn = await dataPool.getConnection();

  async function existsGeneratorName(genName) {
    const [[row]] = await conn.query(
      `SELECT 1 AS ok FROM process_generated_macs WHERE generator_name = ? LIMIT 1`,
      [genName],
    );
    return !!row;
  }


  async function getSampleSerialMeta(genName) {
    const [[row]] = await conn.query(
      `
      SELECT serial
      FROM process_generated_macs
      WHERE generator_name = ?
        AND serial IS NOT NULL
        AND TRIM(serial) <> ''
      LIMIT 1
      `,
      [genName],
    );
    const serial = row?.serial ? String(row.serial).trim() : "";
    if (!serial) return null;

    const m = serial.match(/^(.*?)(\d+)$/);
    if (!m) return null;

    return { prefix: m[1], width: m[2].length };
  }



  const SERIAL_NUM_SQL = (col) =>
    `CAST(REGEXP_SUBSTR(${col}, '[0-9]+$') AS UNSIGNED)`;


  async function buildTempMoveMacsBySerialRange(
    oldGenName,
    prefix,
    minN,
    maxN,
  ) {
    await conn.query(`DROP TEMPORARY TABLE IF EXISTS tmp_move_macs`);
    await conn.query(`
      CREATE TEMPORARY TABLE tmp_move_macs (
        mac_address VARCHAR(32) PRIMARY KEY
      ) ENGINE=MEMORY
    `);


    const likePrefix = prefix ? `${prefix}%` : null;

    const [ins] = await conn.query(
      `
      INSERT INTO tmp_move_macs(mac_address)
      SELECT DISTINCT mac_address
      FROM process_generated_macs
      WHERE generator_name = ?
        ${likePrefix ? "AND serial LIKE ?" : ""}
        AND ${SERIAL_NUM_SQL("serial")} BETWEEN ? AND ?
      `,
      likePrefix
        ? [oldGenName, likePrefix, minN, maxN]
        : [oldGenName, minN, maxN],
    );

    return ins?.affectedRows ?? 0;
  }

  async function updateGeneratorNameByTmpMacs(table, oldGenName, newGenName) {
    assertAllowedTable(table);

    const [r] = await conn.query(
      `
      UPDATE \`${table}\`
      SET generator_name = ?
      WHERE generator_name = ?
        AND mac_address IN (SELECT mac_address FROM tmp_move_macs)
      `,
      [newGenName, oldGenName],
    );

    return r?.affectedRows ?? 0;
  }

  try {
    await conn.beginTransaction();


    if (await existsGeneratorName(newGen)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        code: "GENERATOR_NAME_ALREADY_EXISTS",
        message: "Invalid request",
      });
    }


    const minN = Math.min(sParsed.num, eParsed.num);
    const maxN = Math.max(sParsed.num, eParsed.num);

    // ??prefix 결정


    let prefix = null;
    let width = null;

    if (sParsed.isFull && eParsed.isFull) {
      if (sParsed.prefix !== eParsed.prefix) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "PREFIX_MISMATCH",
          message: "Invalid request",
        });
      }
      prefix = sParsed.prefix;
      width = sParsed.width; // 참고??
    } else {
      const meta = await getSampleSerialMeta(oldGen);
      if (!meta) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "NO_SERIAL_META",
          message: "Invalid request",
        });
      }
      prefix = meta.prefix;
      width = meta.width;
    }


    const movedMacRows = await buildTempMoveMacsBySerialRange(
      oldGen,
      prefix,
      minN,
      maxN,
    );
    if (movedMacRows <= 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        code: "NOTHING_TO_MOVE",
        message: "Invalid request",
      });
    }


    const [[remainRow]] = await conn.query(
      `
      SELECT COUNT(*) AS cnt
      FROM process_generated_macs
      WHERE generator_name = ?
        AND mac_address NOT IN (SELECT mac_address FROM tmp_move_macs)
      `,
      [oldGen],
    );
    const remainCnt = Number(remainRow?.cnt ?? 0);
    if (remainCnt <= 0) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        code: "MOVE_ALL_NOT_ALLOWED",
        message: "Invalid request",
      });
    }


    const affected = {};
    {
      const [r] = await conn.query(
        `
        UPDATE process_generated_macs
        SET generator_name = ?, updated_at = NOW(6)
        WHERE generator_name = ?
          AND mac_address IN (SELECT mac_address FROM tmp_move_macs)
        `,
        [newGen, oldGen],
      );
      affected.process_generated_macs = r?.affectedRows ?? 0;
    }


    for (const table of TABLES_TO_MOVE) {
      affected[table] = await updateGeneratorNameByTmpMacs(
        table,
        oldGen,
        newGen,
      );
    }

    await conn.commit();
    return res.json({
      success: true,
      mode: "SPLIT_BY_SERIAL",
      old_generator_name: oldGen,
      new_generator_name: newGen,
      moved: {
        serial_prefix: prefix,
        serial_num_range: { min: minN, max: maxN },
        movedMacRows,
        remainCnt,
      },
      affectedRows: affected,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[generated] error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  } finally {
    conn.release();
  }
});
/**
 *
 */
router.post("/hide", async (req, res) => {
  const { generator_names } = req.body;
  if (!Array.isArray(generator_names) || generator_names.length === 0) {
    return res.json({
      success: false,
      message: "generator_names is required",
    });
  }

  try {
    const sql = `UPDATE process_generated_macs SET is_hidden = 1 WHERE generator_name IN (?)`;
    await dataPool.query(sql, [generator_names]);
    return res.json({ success: true });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.json({ success: false, message: err.message });
  }
});

router.post("/show", async (req, res) => {
  const { generator_names } = req.body;
  if (!Array.isArray(generator_names) || generator_names.length === 0) {
    return res.json({
      success: false,
      message: "generator_names is required",
    });
  }

  try {
    const sql = `UPDATE process_generated_macs SET is_hidden = 0 WHERE generator_name IN (?)`;
    await dataPool.query(sql, [generator_names]);
    return res.json({ success: true });
  } catch (err) {
    console.error("[generated] error:", err);
    return res.json({ success: false, message: err.message });
  }
});

module.exports = router;
