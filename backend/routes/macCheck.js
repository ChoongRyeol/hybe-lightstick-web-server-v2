// routes/macCheck.js
const express = require("express");
const router = express.Router();

const { dataPool } = require("../db");
const requireAuth = require("../middleware/auth");
const { acquireRedisLock, releaseRedisLock } = require("../utils/redisLock");

function toInt(v, def = 0) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

function normalizeMac(mac) {
  if (!mac) return null;
  const norm = String(mac).replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  return norm.length === 12 ? norm : null;
}

function normalizeMacToColon(mac) {
  const norm = normalizeMac(mac);
  if (!norm) return null;
  return norm.match(/.{2}/g).join(":");
}

function normalizeHex(value, length) {
  if (!value) return null;
  const hex = String(value).replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  return hex.length === length ? hex : null;
}

function normalizeDeviceGuid(value) {
  return normalizeHex(value, 32);
}

function normalizeDeviceSn(value) {
  return normalizeHex(value, 32);
}

function buildRequiredMessage(fields) {
  return `required fields missing: ${fields.join(", ")}`;
}

function buildLockLogMeta(body, extra = {}) {
  return [
    `line=${body?.line || "-"}`,
    `generator=${body?.generator_name || "-"}`,
    `mac=${extra.mac || "-"}`,
    `key=${extra.key || "-"}`,
  ].join(" ");
}

async function updateFirmwareDownloadGeneratorByGuid(
  conn,
  deviceGuidHex,
  generatorName,
) {
  if (!deviceGuidHex || !generatorName) {
    return {
      firmware_download: 0,
      firmware_download_log: 0,
    };
  }

  const [fwUpdate] = await conn.query(
    `
    UPDATE process_firmware_download
    SET generator_name = ?
    WHERE device_guid = UNHEX(?)
    `,
    [generatorName, deviceGuidHex],
  );

  const [fwLogUpdate] = await conn.query(
    `
    UPDATE process_firmware_download_log
    SET generator_name = ?
    WHERE device_guid = UNHEX(?)
    `,
    [generatorName, deviceGuidHex],
  );

  return {
    firmware_download: fwUpdate.affectedRows || 0,
    firmware_download_log: fwLogUpdate.affectedRows || 0,
  };
}

async function macCheckProcessHandler(req, res) {
  const body = req.body || {};

  const line = body.line;
  const generatorName = body.generator_name;
  const artist = body.artist;
  const lightstick = body.lightstick;
  const serial = body.serial;
  const result = String(body.result || "").toUpperCase();
  const writeResult = body.write_result || null;

  const required = [];
  if (!line) required.push("line");
  if (!generatorName) required.push("generator_name");
  if (!artist) required.push("artist");
  if (!lightstick) required.push("lightstick");
  if (!serial) required.push("serial");
  if (!result) required.push("result");

  if (required.length > 0) {
    return res.status(400).json({
      success: false,
      result: "invalid_request",
      message: buildRequiredMessage(required),
    });
  }

  const colonMac = normalizeMacToColon(body.mac_address);
  const deviceGuidHex = normalizeDeviceGuid(body.device_guid);
  const deviceSnRawHex = normalizeDeviceSn(body.device_sn_raw);
  const deviceSnEncHex = normalizeDeviceSn(body.device_sn_enc);

  if (result === "PASS") {
    if (!colonMac) {
      return res.status(400).json({
        success: false,
        result: "invalid_request",
        message: "PASS requires a valid mac_address",
      });
    }

    if (!deviceGuidHex) {
      return res.status(400).json({
        success: false,
        result: "invalid_request",
        message: "PASS requires a 16-byte device_guid hex value",
      });
    }

  }

  let conn;
  let firmwareUpdateResult = {
    firmware_download: 0,
    firmware_download_log: 0,
  };

  try {
    conn = await dataPool.getConnection();
    await conn.beginTransaction();

    const [logResult] = await conn.query(
      `
      INSERT INTO process_mac_check_log
      (
        line,
        generator_name,
        artist,
        lightstick,
        serial,
        mac_address,
        device_guid,
        device_sn_raw,
        device_sn_enc,
        fw_version,
        device_name,
        result,
        write_result,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), UNHEX(?), ?, ?, ?, ?, ?)
      `,
      [
        line,
        generatorName,
        artist,
        lightstick,
        serial,
        colonMac,
        deviceGuidHex,
        deviceSnRawHex,
        deviceSnEncHex,
        body.fw_version || null,
        body.device_name || null,
        result,
        writeResult,
        body.description || null,
      ],
    );

    const logId = logResult.insertId;

    if (result === "PASS") {
      try {
        await conn.query(
          `
          INSERT INTO process_mac_check
          (
            line,
            generator_name,
            artist,
            lightstick,
            serial,
            mac_address,
            device_guid,
            device_sn_raw,
            device_sn_enc,
            last_log_id
          )
          VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), UNHEX(?), ?)
          `,
          [
            line,
            generatorName,
            artist,
            lightstick,
            serial,
            colonMac,
            deviceGuidHex,
            deviceSnRawHex,
            deviceSnEncHex,
            logId,
          ],
        );

        firmwareUpdateResult = await updateFirmwareDownloadGeneratorByGuid(
          conn,
          deviceGuidHex,
          generatorName,
        );
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          await conn.rollback();

          return res.status(409).json({
            success: false,
            result: "duplicated_mac",
            message: "Already registered MAC",
            detail: err.message,
            log_id: logId,
          });
        }

        throw err;
      }
    }

    await conn.commit();

    return res.json({
      success: true,
      registered: result === "PASS",
      result,
      log_id: logId,
      firmware_update: firmwareUpdateResult,
      message:
        result === "PASS"
          ? "Mac check PASS saved"
          : "Mac check log saved",
    });
  } catch (err) {
    if (conn) await conn.rollback();

    console.error("[macCheck/process] ERROR:", err);

    return res.status(500).json({
      success: false,
      result: "error",
      message: "Mac check save failed",
      detail: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
}

router.post("/", macCheckProcessHandler);
router.post("/process", macCheckProcessHandler);

router.post("/lock", async (req, res) => {
  const redis = req.app.locals.redisLockClient;
  const colonMac = normalizeMacToColon(req.body?.mac_address);
  const normalizedMac = normalizeMac(req.body?.mac_address);

  if (!colonMac || !normalizedMac) {
    return res.status(400).json({
      success: false,
      error: "valid mac_address required",
    });
  }

  const lockKey = `lock:mac_check:${normalizedMac}`;
  const lockValue = await acquireRedisLock(redis, lockKey, 10);
  const lockLogMeta = buildLockLogMeta(req.body, {
    mac: colonMac,
    key: lockKey,
  });

  if (!lockValue) {
    return res.status(409).json({
      success: false,
      result: "lock_busy",
      message: "Same MAC is already being processed on another line.",
    });
  }

  try {
    const [rows] = await dataPool.execute(
      `SELECT 1 FROM process_mac_check WHERE mac_address = ? LIMIT 1`,
      [colonMac],
    );

    if (rows.length > 0) {
      await releaseRedisLock(redis, lockKey, lockValue).catch(() => {});
      console.log(`[LOCK][RELEASE][mac_check][registered] ${lockLogMeta}`);

      return res.status(200).json({
        success: true,
        registered: true,
        message: "MAC address already exists",
      });
    }

    return res.status(200).json({
      success: true,
      registered: false,
      message: "MAC address is not registered",
    });
  } catch (err) {
    await releaseRedisLock(redis, lockKey, lockValue).catch(() => {});
    console.log(`[LOCK][RELEASE][mac_check][error] ${lockLogMeta}`);

    console.error("[macCheck/lock] ERROR:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

router.post("/log", async (req, res) => {
  const body = req.body || {};

  const line = body.line;
  const generatorName = body.generator_name;
  const result = String(body.result || "").toUpperCase();

  if (!line || !generatorName || !result) {
    return res.status(400).json({
      success: false,
      message: "line, generator_name, result are required",
    });
  }

  try {
    const [logResult] = await dataPool.query(
      `
      INSERT INTO process_mac_check_log
      (
        line,
        generator_name,
        artist,
        lightstick,
        serial,
        mac_address,
        device_guid,
        device_sn_raw,
        device_sn_enc,
        fw_version,
        device_name,
        result,
        write_result,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), UNHEX(?), ?, ?, ?, ?, ?)
      `,
      [
        line,
        generatorName,
        body.artist || null,
        body.lightstick || null,
        body.serial || null,
        normalizeMacToColon(body.mac_address),
        normalizeDeviceGuid(body.device_guid),
        normalizeDeviceSn(body.device_sn_raw),
        normalizeDeviceSn(body.device_sn_enc),
        body.fw_version || null,
        body.device_name || null,
        result,
        body.write_result || null,
        body.description || null,
      ],
    );

    return res.json({
      success: true,
      log_id: logResult.insertId,
      message: "Mac check log saved",
    });
  } catch (err) {
    console.error("[macCheck/log] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Mac check log save failed",
      detail: err.message,
    });
  }
});

router.get("/cursor-with-log", async (req, res) => {
  const { generator_name, cursor = 0, limit = 100 } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name is required",
      data: null,
      errorCode: 1,
    });
  }

  const take = Math.max(toInt(limit, 100), 1);
  const lastId = Math.max(toInt(cursor, 0), 0);

  try {
    const [rows] = await dataPool.query(
      `
      WITH g AS (
        SELECT *
        FROM process_generated_macs
        WHERE generator_name = ?
          AND id > ?
        ORDER BY id ASC
        LIMIT ?
      ),
      log_rank AS (
        SELECT
          l.*,
          HEX(l.device_guid) AS device_guid_hex,
          HEX(l.device_sn_raw) AS device_sn_raw_hex,
          HEX(l.device_sn_enc) AS device_sn_enc_hex,
          ROW_NUMBER() OVER (
            PARTITION BY l.generator_name, l.mac_address
            ORDER BY l.updated_at DESC, l.id DESC
          ) AS rn
        FROM process_mac_check_log l
        JOIN g
          ON g.generator_name = l.generator_name
         AND g.mac_address = l.mac_address
      )
      SELECT
        g.*,
        lr.device_guid_hex AS device_guid,
        lr.device_sn_raw_hex AS device_sn_raw,
        lr.device_sn_enc_hex AS device_sn_enc,
        lr.result AS log_result,
        lr.write_result,
        lr.description AS log_description,
        lr.updated_at AS log_updated_at
      FROM g
      LEFT JOIN log_rank lr
        ON g.generator_name = lr.generator_name
       AND g.mac_address = lr.mac_address
       AND lr.rn = 1
      ORDER BY g.id ASC
      `,
      [generator_name, lastId, take + 1],
    );

    const hasMore = rows.length > take;
    const pageRows = hasMore ? rows.slice(0, take) : rows;
    const nextCursor =
      pageRows.length > 0 ? pageRows[pageRows.length - 1].id : lastId;

    const enriched = pageRows.map((row, index) => ({
      ...row,
      result: row.log_result || "",
      description: row.log_description || "",
      log_updated_at: row.log_updated_at || null,
      QR_Code: `${row.lightstick}_${row.mac_address}`,
      No: index + 1,
    }));

    return res.json({
      success: true,
      message: "",
      data: enriched,
      cursor: lastId,
      nextCursor,
      hasMore,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[macCheck/cursor-with-log] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
      data: null,
      errorCode: 500,
    });
  }
});

router.get("/cursor-with-log-prev", async (req, res) => {
  const { generator_name, cursor = 0, limit = 100 } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name is required",
      data: null,
      errorCode: 1,
    });
  }

  const pageSize = Math.max(toInt(limit, 100), 1);
  const cur = Math.max(toInt(cursor, 0), 0);

  try {
    const [[firstRow]] = await dataPool.query(
      `
      SELECT id
      FROM process_generated_macs
      WHERE generator_name = ?
        AND id > ?
      ORDER BY id ASC
      LIMIT 1
      `,
      [generator_name, cur],
    );

    if (!firstRow?.id) {
      return res.json({
        success: true,
        message: "",
        data: [],
        prevCursor: 0,
        nextCursor: cur,
        hasPrev: false,
        errorCode: 0,
      });
    }

    const firstId = Number(firstRow.id);

    const [prevRows] = await dataPool.query(
      `
      WITH g AS (
        SELECT *
        FROM process_generated_macs
        WHERE generator_name = ?
          AND id < ?
        ORDER BY id DESC
        LIMIT ?
      ),
      g2 AS (
        SELECT * FROM g ORDER BY id ASC
      ),
      log_rank AS (
        SELECT
          l.*,
          HEX(l.device_guid) AS device_guid_hex,
          HEX(l.device_sn_raw) AS device_sn_raw_hex,
          HEX(l.device_sn_enc) AS device_sn_enc_hex,
          ROW_NUMBER() OVER (
            PARTITION BY l.generator_name, l.mac_address
            ORDER BY l.updated_at DESC, l.id DESC
          ) AS rn
        FROM process_mac_check_log l
        JOIN g2
          ON g2.generator_name = l.generator_name
         AND g2.mac_address = l.mac_address
      )
      SELECT
        g2.*,
        lr.device_guid_hex AS device_guid,
        lr.device_sn_raw_hex AS device_sn_raw,
        lr.device_sn_enc_hex AS device_sn_enc,
        lr.result AS log_result,
        lr.write_result,
        lr.description AS log_description,
        lr.updated_at AS log_updated_at
      FROM g2
      LEFT JOIN log_rank lr
        ON g2.generator_name = lr.generator_name
       AND g2.mac_address = lr.mac_address
       AND lr.rn = 1
      ORDER BY g2.id ASC
      `,
      [generator_name, firstId, pageSize],
    );

    let prevCursor = 0;
    if (prevRows.length > 0) {
      const prevFirstId = Number(prevRows[0].id);
      prevCursor = Math.max(prevFirstId - 1, 0);
    }

    const enriched = prevRows.map((row, index) => ({
      ...row,
      result: row.log_result || "",
      description: row.log_description || "",
      log_updated_at: row.log_updated_at || null,
      QR_Code: `${row.lightstick}_${row.mac_address}`,
      No: index + 1,
    }));

    return res.json({
      success: true,
      message: "",
      data: enriched,
      prevCursor,
      nextCursor: cur,
      hasPrev: prevRows.length > 0,
      errorCode: 0,
    });
  } catch (err) {
    console.error("[macCheck/cursor-with-log-prev] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
      data: null,
      errorCode: 500,
    });
  }
});

router.get("/count", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name is required",
      data: null,
      errorCode: 1,
    });
  }

  try {
    const [[{ total }]] = await dataPool.query(
      `
      SELECT COUNT(*) AS total
      FROM process_generated_macs
      WHERE generator_name = ?
      `,
      [generator_name],
    );

    return res.json({
      success: true,
      message: "",
      data: { total: Number(total ?? 0) },
      errorCode: 0,
    });
  } catch (err) {
    console.error("[macCheck/count] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
      data: null,
      errorCode: 500,
    });
  }
});

router.get("/locate/mac", async (req, res) => {
  const { generator_name, mac_address, page_size = 100 } = req.query;

  if (!generator_name || !mac_address) {
    return res.status(400).json({
      success: false,
      message: "generator_name and mac_address are required",
      data: null,
      errorCode: 1,
    });
  }

  const limit = Math.max(toInt(page_size, 100), 1);
  const macQuery = normalizeMacToColon(mac_address);

  try {
    const [[target]] = await dataPool.query(
      `
      SELECT id
      FROM process_generated_macs
      WHERE generator_name = ?
        AND mac_address = ?
      ORDER BY id ASC
      LIMIT 1
      `,
      [generator_name, macQuery],
    );

    if (!target?.id) {
      return res.status(404).json({
        success: false,
        message: "MAC not found in generator",
        data: null,
        errorCode: 404,
      });
    }

    const targetId = Number(target.id);
    const startCursor = Math.max(targetId - 1, 0);

    const [[posRow]] = await dataPool.query(
      `
      SELECT COUNT(*) AS cnt
      FROM process_generated_macs
      WHERE generator_name = ?
        AND id < ?
      `,
      [generator_name, targetId],
    );

    const position = Number(posRow?.cnt ?? 0) + 1;
    const page = Math.max(Math.ceil(position / limit), 1);

    return res.json({
      success: true,
      message: "",
      data: {
        page,
        startCursor,
        targetId,
        mac_address: macQuery,
      },
      errorCode: 0,
    });
  } catch (err) {
    console.error("[macCheck/locate/mac] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
      data: null,
      errorCode: 500,
    });
  }
});

router.get("/locate/serial", async (req, res) => {
  const { generator_name, serial, page_size = 100 } = req.query;

  if (!generator_name || !serial) {
    return res.status(400).json({
      success: false,
      message: "generator_name and serial are required",
      data: null,
      errorCode: 1,
    });
  }

  const limit = Math.max(toInt(page_size, 100), 1);
  const serialQuery = String(serial).trim();

  try {
    const [[row]] = await dataPool.query(
      `
      SELECT id
      FROM process_generated_macs
      WHERE generator_name = ?
        AND serial = ?
      ORDER BY id ASC
      LIMIT 1
      `,
      [generator_name, serialQuery],
    );

    if (!row?.id) {
      return res.status(404).json({
        success: false,
        message: "Serial not found in generator",
        data: null,
        errorCode: 404,
      });
    }

    const id = Number(row.id);
    const startCursor = Math.max(id - 1, 0);

    const [[posRow]] = await dataPool.query(
      `
      SELECT COUNT(*) AS cnt
      FROM process_generated_macs
      WHERE generator_name = ?
        AND id < ?
      `,
      [generator_name, id],
    );

    const position = Number(posRow?.cnt ?? 0) + 1;
    const page = Math.max(Math.ceil(position / limit), 1);

    return res.json({
      success: true,
      message: "",
      data: { page, startCursor, id, serial: serialQuery },
      errorCode: 0,
    });
  } catch (err) {
    console.error("[macCheck/locate/serial] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
      data: null,
      errorCode: 500,
    });
  }
});

router.post("/daily-counts", async (req, res) => {
  const { line, generator_name } = req.body;

  if (!line || !generator_name) {
    return res.status(400).json({
      success: false,
      message: "line and generator_name are required",
    });
  }

  try {
    const [rows] = await dataPool.query(
      `
      SELECT
        SUM(CASE WHEN line = ? THEN 1 ELSE 0 END) AS line_count,
        COUNT(*) AS generator_count
      FROM process_mac_check
      WHERE generator_name = ?
        AND updated_at >= CURDATE()
        AND updated_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      `,
      [line, generator_name],
    );

    const row = rows?.[0] ?? null;

    return res.json({
      success: true,
      line_count: Number(row?.line_count ?? 0),
      generator_count: Number(row?.generator_count ?? 0),
    });
  } catch (err) {
    console.error("[macCheck/daily-counts] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "DB error",
    });
  }
});

router.post("/delete", requireAuth, async (req, res) => {
  const colonMac = normalizeMacToColon(req.body?.mac_address);
  const user = req.session.user;

  if (!colonMac) {
    return res.status(400).json({
      success: false,
      message: "valid mac_address required",
    });
  }

  let conn;

  try {
    conn = await dataPool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
      SELECT
        p.*,
        HEX(p.device_guid) AS device_guid_hex,
        HEX(p.device_sn_raw) AS device_sn_raw_hex,
        HEX(p.device_sn_enc) AS device_sn_enc_hex,
        l.fw_version AS log_fw_version,
        l.device_name AS log_device_name,
        l.write_result AS log_write_result
      FROM process_mac_check p
      LEFT JOIN process_mac_check_log l ON l.id = p.last_log_id
      WHERE p.mac_address = ?
      LIMIT 1
      `,
      [colonMac],
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.json({
        success: false,
        message: "MAC does not exist",
      });
    }

    const target = rows[0];

    await conn.query(
      `
      INSERT INTO process_mac_check_log
      (
        line,
        generator_name,
        artist,
        lightstick,
        serial,
        mac_address,
        device_guid,
        device_sn_raw,
        device_sn_enc,
        fw_version,
        device_name,
        result,
        write_result,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), UNHEX(?), ?, ?, 'DELETE', ?, ?)
      `,
      [
        target.line,
        target.generator_name,
        target.artist,
        target.lightstick,
        target.serial,
        target.mac_address,
        target.device_guid_hex,
        target.device_sn_raw_hex,
        target.device_sn_enc_hex,
        target.log_fw_version,
        target.log_device_name,
        target.log_write_result,
        `${user.id}`,
      ],
    );

    await conn.query(`DELETE FROM process_mac_check WHERE mac_address = ?`, [
      colonMac,
    ]);

    await conn.commit();

    return res.json({ success: true });
  } catch (err) {
    if (conn) await conn.rollback();

    console.error("[macCheck/delete] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
    });
  } finally {
    if (conn) conn.release();
  }
});

router.post("/scan-log", async (req, res) => {
  const { mac_address, raw, line } = req.body;

  if (!mac_address || !line || !raw) {
    return res.status(400).json({
      success: false,
      message: "mac_address, line, raw are required",
    });
  }

  const norm = normalizeMac(mac_address);
  if (!norm) {
    return res.status(400).json({
      success: false,
      message: "Invalid MAC format",
    });
  }

  const colonMac = norm.match(/.{2}/g).join(":");

  try {
    await dataPool.execute(
      `
      INSERT INTO process_mac_check_scan_log
      (line, mac_address, mac_no_colon, raw)
      VALUES (?, ?, ?, ?)
      `,
      [line, colonMac, norm, raw],
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("[macCheck/scan-log] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "DB error",
    });
  }
});

module.exports = router;
