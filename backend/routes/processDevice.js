// routes/processDevice.js
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
  const norm = String(mac).replace(/[:-]/g, "").toUpperCase();
  return norm.length === 12 ? norm : null;
}

function normalizeMacToColon(mac) {
  const norm = normalizeMac(mac);
  if (!norm) return null;
  return norm.match(/.{2}/g).join(":");
}

function normalizeDeviceGuid(deviceGuid) {
  if (!deviceGuid) return null;

  const hex = String(deviceGuid)
    .replace(/[^0-9A-Fa-f]/g, "")
    .toUpperCase();

  return hex.length === 32 ? hex : null;
}

function normalizeDeviceSn(deviceSn) {
  if (!deviceSn) return null;

  const hex = String(deviceSn)
    .replace(/[^0-9A-Fa-f]/g, "")
    .toUpperCase();

  return hex.length === 32 ? hex : null;
}

async function processDeviceHandler(req, res) {
  const body = req.body || {};

  const line = body.line;
  const generatorName = body.generator_name;
  const artist = body.artist;
  const lightstick = body.lightstick;
  const serial = body.serial;
  const macAddress = body.mac_address;
  const result = String(body.result || "").toUpperCase();

  const writeResult = body.write_result || null;
  const rssi = body.rssi ?? null;
  const rssiResult = body.rssi_result || null;
  const highCurrent = body.high_current ?? null;
  const highCurrentResult = body.high_current_result || null;

  const lowCurrent = body.low_current ?? null;
  const lowCurrentResult = body.low_current_result || null;

  if (!line || !generatorName || !artist || !lightstick || !serial || !result) {
    return res.status(400).json({
      success: false,
      result: "invalid_request",
      message:
        "line, generator_name, artist, lightstick, serial, result는 필수입니다.",
    });
  }

  const normalizedMac = normalizeMac(macAddress);
  const colonMac = normalizeMacToColon(macAddress);
  const deviceGuidHex = normalizeDeviceGuid(body.device_guid);
  const deviceSnRawHex = normalizeDeviceSn(body.device_sn_raw);
  const deviceSnEncHex = normalizeDeviceSn(body.device_sn_enc);

  if (result === "PASS") {
    if (!colonMac || !normalizedMac) {
      return res.status(400).json({
        success: false,
        result: "invalid_request",
        message: "PASS 결과는 mac_address가 필수입니다.",
      });
    }

    if (!deviceGuidHex) {
      return res.status(400).json({
        success: false,
        result: "invalid_request",
        message: "PASS 결과는 16byte device_guid HEX 값이 필수입니다.",
      });
    }

    if (!deviceSnRawHex) {
      return res.status(400).json({
        success: false,
        result: "invalid_request",
        message: "PASS 결과는 16byte device_sn_raw HEX 값이 필수입니다.",
      });
    }

    if (!deviceSnEncHex) {
      return res.status(400).json({
        success: false,
        result: "invalid_request",
        message: "PASS 결과는 16byte device_sn_enc HEX 값이 필수입니다.",
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
      INSERT INTO process_device_test_log
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
        rssi,
        rssi_result,
        high_current,
        high_current_result,
        low_current,
        low_current_result,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), UNHEX(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        rssi,
        rssiResult,
        highCurrent,
        highCurrentResult,
        lowCurrent,
        lowCurrentResult,
        body.description || null,
      ],
    );

    const logId = logResult.insertId;

    if (result === "PASS") {
      try {
        await conn.query(
          `
          INSERT INTO process_device_test
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

        firmwareUpdateResult = {
          firmware_download: fwUpdate.affectedRows || 0,
          firmware_download_log: fwLogUpdate.affectedRows || 0,
        };
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          await conn.rollback();

          return res.status(409).json({
            success: false,
            result: "duplicated_mac",
            message: "이미 PASS 저장된 MAC입니다.",
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
          ? "디바이스 테스트 PASS 저장 완료"
          : "디바이스 테스트 로그 저장 완료",
    });
  } catch (err) {
    if (conn) await conn.rollback();

    console.error("[processDevice] ERROR:", err);

    return res.status(500).json({
      success: false,
      result: "error",
      message: "디바이스 테스트 저장 실패",
      detail: err.message,
    });
  } finally {
    if (conn) conn.release();
  }
}

router.post("/", processDeviceHandler);
router.post("/process", processDeviceHandler);

router.post("/lock", async (req, res) => {
  const redis = req.app.locals.redisLockClient;
  const { mac_address } = req.body;

  if (!mac_address) {
    return res.status(400).json({
      success: false,
      error: "mac_address required",
    });
  }

  const colonMac = normalizeMacToColon(mac_address);
  const normalizedMac = normalizeMac(mac_address);

  if (!colonMac || !normalizedMac) {
    return res.status(400).json({
      success: false,
      error: "invalid mac_address",
    });
  }

  const lockKey = `lock:process_device:${normalizedMac}`;
  const lockValue = await acquireRedisLock(redis, lockKey, 10);

  if (!lockValue) {
    return res.status(409).json({
      success: false,
      result: "lock_busy",
      message: "같은 MAC이 다른 라인에서 처리 중입니다.",
    });
  }

  try {
    const [rows] = await dataPool.execute(
      `SELECT 1 FROM process_device_test WHERE mac_address = ? LIMIT 1`,
      [colonMac],
    );

    if (rows.length > 0) {
      await releaseRedisLock(redis, lockKey, lockValue).catch(() => {});
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

    console.error("❌ /process-device/lock error:", err);
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

  const colonMac = normalizeMacToColon(body.mac_address);
  const deviceGuidHex = normalizeDeviceGuid(body.device_guid);
  const deviceSnRawHex = normalizeDeviceSn(body.device_sn_raw);
  const deviceSnEncHex = normalizeDeviceSn(body.device_sn_enc);
  const highCurrent = body.high_current ?? null;
  const highCurrentResult = body.high_current_result || null;

  const lowCurrent = body.low_current ?? null;
  const lowCurrentResult = body.low_current_result || null;

  if (!line || !generatorName || !result) {
    return res.status(400).json({
      success: false,
      message: "line, generator_name, result는 필수입니다.",
    });
  }

  try {
    const [logResult] = await dataPool.query(
      `
      INSERT INTO process_device_test_log
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
        rssi,
        rssi_result,
        high_current,
        high_current_result,
        low_current,
        low_current_result,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), UNHEX(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        line,
        generatorName,
        body.artist || null,
        body.lightstick || null,
        body.serial || null,
        colonMac,
        deviceGuidHex,
        deviceSnRawHex,
        deviceSnEncHex,
        body.fw_version || null,
        body.device_name || null,
        result,
        body.write_result || null,
        body.rssi ?? null,
        body.rssi_result || null,
        highCurrent,
        highCurrentResult,
        lowCurrent,
        lowCurrentResult,
        body.description || null,
      ],
    );

    return res.json({
      success: true,
      log_id: logResult.insertId,
      message: "디바이스 테스트 로그 저장 완료",
    });
  } catch (err) {
    console.error("[processDevice/log] ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "로그 저장 실패",
      detail: err.message,
    });
  }
});

router.get("/cursor-with-log", async (req, res) => {
  const { generator_name, cursor = 0, limit = 100 } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name 쿼리 누락",
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
        FROM process_device_test_log l
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
        lr.rssi,
        lr.rssi_result,
        lr.high_current,
        lr.high_current_result,
        lr.low_current,
        lr.low_current_result,
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
    console.error("❌ /api/process-device/cursor-with-log 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
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
      message: "generator_name 누락",
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
        FROM process_device_test_log l
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
        lr.rssi,
        lr.rssi_result,
        lr.high_current,
        lr.high_current_result,
        lr.low_current,
        lr.low_current_result,
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
    console.error("❌ /api/process-device/cursor-with-log-prev 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
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
      message: "generator_name 쿼리 누락",
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
    console.error("❌ /api/process-device/count 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
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
      message: "generator_name, mac_address 쿼리 누락",
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
        message: "해당 MAC을 generator 내에서 찾을 수 없습니다",
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
    console.error("❌ /api/process-device/locate/mac 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
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
      message: "generator_name, serial 쿼리 누락",
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
        message: "해당 Serial을 generator 내에서 찾을 수 없습니다",
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
    console.error("❌ /api/process-device/locate/serial 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
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
      message: "line, generator_name 필요",
    });
  }

  try {
    const [rows] = await dataPool.query(
      `
      SELECT
        SUM(CASE WHEN line = ? THEN 1 ELSE 0 END) AS line_count,
        COUNT(*) AS generator_count
      FROM process_device_test
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
    console.error("❌ process-device daily-counts 오류:", err);
    return res.status(500).json({
      success: false,
      message: "DB 오류",
    });
  }
});

router.post("/delete", requireAuth, async (req, res) => {
  const { mac_address } = req.body;
  const user = req.session.user;

  if (!mac_address) {
    return res.status(400).json({
      success: false,
      message: "mac_address 필요",
    });
  }

  const colonMac = normalizeMacToColon(mac_address);

  let conn;

  try {
    conn = await dataPool.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      `
      SELECT
        *,
        HEX(device_guid) AS device_guid_hex,
        HEX(device_sn_raw) AS device_sn_raw_hex,
        HEX(device_sn_enc) AS device_sn_enc_hex
      FROM process_device_test
      WHERE mac_address = ?
      LIMIT 1
      `,
      [colonMac],
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.json({
        success: false,
        message: "대상 MAC이 존재하지 않음",
      });
    }

    const target = rows[0];

    await conn.query(
      `
      INSERT INTO process_device_test_log
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
        result,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?, UNHEX(?), UNHEX(?), UNHEX(?), 'DELETE', ?)
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
        `${user.id}`,
      ],
    );

    await conn.query(`DELETE FROM process_device_test WHERE mac_address = ?`, [
      colonMac,
    ]);

    await conn.commit();

    return res.json({ success: true });
  } catch (err) {
    if (conn) await conn.rollback();

    console.error("process-device 삭제 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
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
      message: "mac_address, line required",
    });
  }

  try {
    const norm = normalizeMac(mac_address);

    if (!norm) {
      return res.status(400).json({
        success: false,
        message: "Invalid MAC format",
      });
    }

    const colonMac = norm.match(/.{2}/g).join(":");

    await dataPool.execute(
      `
      INSERT INTO process_mac_write_scan_log
      (line, mac_address, mac_no_colon, raw)
      VALUES (?, ?, ?, ?)
      `,
      [line, colonMac, norm, raw],
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ process-device scan-log 저장 오류:", err);
    return res.status(500).json({
      success: false,
      message: "DB 오류",
    });
  }
});

async function updateFirmwareDownloadGeneratorByGuid(
  conn,
  deviceGuidHex,
  generatorName,
) {
  if (!deviceGuidHex || !generatorName) {
    return {
      firmwareRows: 0,
      firmwareLogRows: 0,
    };
  }

  const [fwResult] = await conn.query(
    `
    UPDATE process_firmware_download
    SET generator_name = ?
    WHERE device_guid = UNHEX(?)
    `,
    [generatorName, deviceGuidHex],
  );

  const [fwLogResult] = await conn.query(
    `
    UPDATE process_firmware_download_log
    SET generator_name = ?
    WHERE device_guid = UNHEX(?)
    `,
    [generatorName, deviceGuidHex],
  );

  return {
    firmwareRows: fwResult.affectedRows || 0,
    firmwareLogRows: fwLogResult.affectedRows || 0,
  };
}

module.exports = router;
