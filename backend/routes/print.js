// backend/routes/print.js
const express = require("express");
const router = express.Router();
const { dataPool } = require("../db"); // ✅ print_logs용 DB 연결
const requireAuth = require("../middleware/auth");
const {
  createEphemeralLock,
  releaseLock,
  autoReleaseLock,
} = require("../utils/lockHandler");
const { getLockPathForCartonbox } = require("../zk");

// ===============================
// Helpers
// ===============================
function sanitizeLockKey(v) {
  return String(v ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 180); // zk path 과도 길이 방지
}

async function acquireLockWithRetry(
  lockPath,
  { maxRetry = 5, delayMs = 120 } = {},
) {
  let attempt = 0;
  while (attempt < maxRetry) {
    try {
      await createEphemeralLock(lockPath);
      autoReleaseLock(lockPath);
      return { ok: true };
    } catch (err) {
      attempt++;

      // NODE_EXISTS(이미 누가 잡음)만 재시도
      if (err?.code === "NODE_EXISTS" && attempt < maxRetry) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return { ok: false, err };
    }
  }
  return { ok: false, err: new Error("LOCK_RETRY_EXCEEDED") };
}

// ===============================
// Routes
// ===============================

// 프린트 로그 저장 API
router.post("/device_log", requireAuth, async (req, res) => {
  await savePrintLogs(req, res, "device_label_print_logs");
});

router.post("/giftbox_log", requireAuth, async (req, res) => {
  await savePrintLogs(req, res, "giftbox_label_print_logs");
});

router.post("/cartonbox_log", requireAuth, async (req, res) => {
  await saveCartonBoxPrintLogs(req, res, "cartonbox_label_print_logs");
});

router.post("/cartonbox_log/exceptions", requireAuth, async (req, res) => {
  await saveCartonBoxPrintExceptionLogs(
    req,
    res,
    "cartonbox_label_print_exceptions",
  );
});

router.post("/cartonbox_log/delete", requireAuth, async (req, res) => {
  await deleteCartonBoxPrintLogsBySerialRange(
    req,
    res,
    "cartonbox_label_print_logs",
  );
});

router.post("/giftbox_log/delete", requireAuth, async (req, res) => {
  await deleteGiftBoxPrintLogsBySerialRange(
    req,
    res,
    "giftbox_label_print_logs",
  );
});

router.get("/device_log/latest_by_generator", async (req, res) => {
  const generatorName = req.query.generator_name;
  if (!generatorName) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name은 필수입니다" });
  }

  try {
    const result = await getLatestPrintLogs(
      "device_label_print_logs",
      generatorName,
      dataPool,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

router.get("/giftbox_log/latest_by_generator", async (req, res) => {
  const generatorName = req.query.generator_name;
  if (!generatorName) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name은 필수입니다" });
  }

  try {
    const result = await getLatestPrintLogs(
      "giftbox_label_print_logs",
      generatorName,
      dataPool,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

router.get("/cartonbox_log/latest_by_generator", async (req, res) => {
  const generatorName = req.query.generator_name;
  if (!generatorName) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name은 필수입니다" });
  }

  try {
    const result = await getLatestPrintLogs(
      "cartonbox_label_print_logs",
      generatorName,
      dataPool,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

router.get("/giftbox_logs", requireAuth, async (req, res) => {
  const { generator_name, artist, lightstick, serial, date_from, date_to } =
    req.query;
  let query = `SELECT * FROM giftbox_label_print_logs WHERE 1=1`;
  const params = [];

  if (generator_name) {
    query += ` AND generator_name = ?`;
    params.push(generator_name);
  }
  if (artist) {
    query += ` AND artist = ?`;
    params.push(artist);
  }
  if (lightstick) {
    query += ` AND lightstick = ?`;
    params.push(lightstick);
  }
  if (serial) {
    query += ` AND serial = ?`;
    params.push(serial);
  }
  if (date_from) {
    query += ` AND updated_at >= ?`;
    params.push(date_from);
  }
  if (date_to) {
    query += ` AND updated_at <= ?`;
    params.push(date_to);
  }

  query += ` ORDER BY updated_at DESC`;

  try {
    const [rows] = await dataPool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("giftbox_logs 조회 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

router.get("/cartonbox_logs", requireAuth, async (req, res) => {
  const { generator_name, artist, lightstick, serial, date_from, date_to } =
    req.query;
  let query = `SELECT * FROM cartonbox_label_print_logs WHERE 1=1`;
  const params = [];

  if (generator_name) {
    query += ` AND generator_name = ?`;
    params.push(generator_name);
  }
  if (artist) {
    query += ` AND artist = ?`;
    params.push(artist);
  }
  if (lightstick) {
    query += ` AND lightstick = ?`;
    params.push(lightstick);
  }
  if (serial) {
    query += ` AND serial = ?`;
    params.push(serial);
  }
  if (date_from) {
    query += ` AND updated_at >= ?`;
    params.push(date_from);
  }
  if (date_to) {
    query += ` AND updated_at <= ?`;
    params.push(date_to);
  }

  query += ` ORDER BY updated_at DESC`;

  try {
    const [rows] = await dataPool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("cartonbox_logs 조회 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

//카톤 박스 출력 이력 조회
router.get("/cartonbox_status", async (req, res) => {
  const { page = 1, page_size = 100, generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name은 필수입니다",
    });
  }

  const limit = parseInt(page_size);
  const offset = (parseInt(page) - 1) * limit;

  try {
    const [countRows] = await dataPool.query(
      `SELECT COUNT(*) as total FROM process_generated_macs WHERE generator_name = ?`,
      [generator_name],
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await dataPool.query(
      `
    WITH paged AS (
      SELECT * 
      FROM process_generated_macs 
      WHERE generator_name = ? 
      ORDER BY id 
      LIMIT ? OFFSET ?
    )
    SELECT 
      p.*, 
      IF(l.serial IS NULL, 0, 1) AS is_printed,
      l.updated_at AS printed_at,
      l.user_name
    FROM paged p
    LEFT JOIN cartonbox_label_print_logs l
      ON p.serial = l.serial AND l.generator_name = ?
    ORDER BY p.id ASC
      `,
      [generator_name, limit, offset, generator_name],
    );

    res.json({
      success: true,
      data: rows,
      page: parseInt(page),
      totalPages,
    });
  } catch (err) {
    console.error("❌ cartonbox_status 조회 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

//디바이스 라벨 출력 이력 조회
router.get("/device_status", async (req, res) => {
  const { page = 1, page_size = 100, generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name은 필수입니다",
    });
  }

  const limit = parseInt(page_size);
  const offset = (parseInt(page) - 1) * limit;

  try {
    const [countRows] = await dataPool.query(
      `SELECT COUNT(*) as total FROM process_generated_macs WHERE generator_name = ?`,
      [generator_name],
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await dataPool.query(
      `
      WITH paged AS (
        SELECT * 
        FROM process_generated_macs 
        WHERE generator_name = ? 
        ORDER BY id 
        LIMIT ? OFFSET ?
      )
      SELECT 
        p.*, 
        IF(l.serial IS NULL, 0, 1) AS is_printed,
        l.updated_at AS printed_at,
        l.user_name
      FROM paged p
      LEFT JOIN device_label_print_logs l
        ON p.serial = l.serial AND l.generator_name = ?
      ORDER BY p.id ASC
      `,
      [generator_name, limit, offset, generator_name],
    );

    res.json({
      success: true,
      data: rows,
      page: parseInt(page),
      totalPages,
    });
  } catch (err) {
    console.error("❌ device_status 조회 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

//Gift 박스 출력 이력 조회
router.get("/giftbox_status", async (req, res) => {
  const { page = 1, page_size = 100, generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name은 필수입니다",
    });
  }

  const limit = parseInt(page_size);
  const offset = (parseInt(page) - 1) * limit;

  try {
    const [countRows] = await dataPool.query(
      `SELECT COUNT(*) as total FROM process_generated_macs WHERE generator_name = ?`,
      [generator_name],
    );
    const total = countRows[0].total;
    const totalPages = Math.ceil(total / limit);

    const [rows] = await dataPool.query(
      `
    WITH paged AS (
      SELECT * 
      FROM process_generated_macs 
      WHERE generator_name = ? 
      ORDER BY id 
      LIMIT ? OFFSET ?
    )
    SELECT 
      p.*, 
      IF(l.serial IS NULL, 0, 1) AS is_printed,
      l.updated_at AS printed_at,
      l.user_name
    FROM paged p
    LEFT JOIN giftbox_label_print_logs l
      ON p.serial = l.serial AND l.generator_name = ?
    ORDER BY p.id ASC
      `,
      [generator_name, limit, offset, generator_name],
    );

    res.json({
      success: true,
      data: rows,
      page: parseInt(page),
      totalPages,
    });
  } catch (err) {
    console.error("❌ giftbox_status 조회 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

//시리얼 기준으로 찾기
/*
router.get("/find_serial_page", async (req, res) => {
  const { generator_name, serial, page_size } = req.query;

  const [[row]] = await dataPool.query(
    `SELECT rownum
     FROM (
       SELECT serial, ROW_NUMBER() OVER (ORDER BY id ASC) as rownum
       FROM process_generated_macs
       WHERE generator_name = ?
     ) AS sub
     WHERE serial = ?
     LIMIT 1`,
    [generator_name, serial],
  );

  if (!row) return res.json({ success: false, message: "Serial not found" });

  const page = Math.ceil(row.rownum / parseInt(page_size || 100));
  return res.json({ success: true, page });
});*/
/*
router.get("/find_serial_page_by_index", async (req, res) => {
  const { generator_name, index, page_size } = req.query;

  const [[row]] = await dataPool.query(
    `SELECT rownum FROM (
      SELECT serial, ROW_NUMBER() OVER (ORDER BY id ASC) AS rownum
      FROM process_generated_macs
      WHERE generator_name = ?
    ) AS sub
    WHERE rownum = ?
    LIMIT 1`,
    [generator_name, index],
  );

  if (!row) return res.json({ success: false });
  const page = Math.ceil(row.rownum / parseInt(page_size || 100));
  return res.json({ success: true, page });
});*/

// ✅ 락 유지 (요청대로), 대신 짧게 재시도 + busy 시 423 반환
router.get("/logs/exists", async (req, res) => {
  const { mac_address, table } = req.query;

  if (!mac_address || !table) {
    return res
      .status(400)
      .json({ success: false, message: "mac_address and table are required" });
  }

  // 🔐 안전한 테이블 화이트리스트
  const allowedTables = [
    "cartonbox_label_print_logs",
    "device_label_print_logs",
    "giftbox_label_print_logs",
  ];

  if (!allowedTables.includes(table)) {
    return res.status(400).json({
      success: false,
      message: "Invalid table name",
    });
  }

  const lockPath = `${getLockPathForCartonbox()}EXISTS_${mac_address.replace(
    /:/g,
    "",
  )}`;

  const lockRes = await acquireLockWithRetry(lockPath, {
    maxRetry: 3,
    delayMs: 80,
  });
  if (!lockRes.ok) {
    // 다른 라인이 잡고 있으면 대기 대신 바로 안내
    if (lockRes.err?.code === "NODE_EXISTS") {
      return res.status(423).json({
        success: false,
        message: "Resource is locked, please try again later",
      });
    }
    console.error("❌ logs/exists lock 획득 실패:", lockRes.err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }

  try {
    // 1️⃣ 출력 로그 테이블 조회
    const [rows] = await dataPool.query(
      `
      SELECT serial, generator_name, updated_at, device_name, model, artist, lightstick, mac_address
      ${
        table === "cartonbox_label_print_logs"
          ? ", box_count, box_total_count"
          : ""
      }
      FROM ${table}
      WHERE mac_address = ?
      LIMIT 1
      `,
      [mac_address],
    );

    if (rows.length > 0) {
      const log = rows[0];

      if (table === "cartonbox_label_print_logs") {
        return res.json({
          success: true,
          exists: true,
          serial: log.serial,
          generator_name: log.generator_name,
          printed_at: log.updated_at,
          device_name: log.device_name,
          model: log.model,
          artist: log.artist,
          lightstick: log.lightstick,
          mac_address: log.mac_address,
          box_count: log.box_count,
          box_total_count: log.box_total_count,
        });
      }

      return res.json({
        success: true,
        exists: true,
        serial: log.serial,
        generator_name: log.generator_name,
        printed_at: log.updated_at,
        device_name: log.device_name,
        model: log.model,
        artist: log.artist,
        lightstick: log.lightstick,
        mac_address: log.mac_address,
      });
    }

    // 2️⃣ fallback process_generated_macs 조회
    const [fallbackRows] = await dataPool.query(
      `
      SELECT serial, generator_name, device_name, model, artist, lightstick, mac_address
      FROM process_generated_macs
      WHERE mac_address = ?
      LIMIT 1
      `,
      [mac_address],
    );

    if (fallbackRows.length > 0) {
      const fb = fallbackRows[0];
      return res.json({
        success: true,
        exists: false,
        serial: fb.serial,
        generator_name: fb.generator_name,
        device_name: fb.device_name,
        model: fb.model,
        artist: fb.artist,
        lightstick: fb.lightstick,
        mac_address: fb.mac_address,
      });
    }

    return res.json({ success: true, exists: false });
  } catch (err) {
    console.error("❌ MAC 조회 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  } finally {
    try {
      await releaseLock(lockPath);
    } catch (e) {
      console.error("⚠️ logs/exists releaseLock 실패:", e);
    }
  }
});

//Device, GiftBox Save Logs
async function savePrintLogs(req, res, tableName) {
  const { logs, generator_name, line } = req.body;
  const user = req.session.user;
  if (!Array.isArray(logs) || logs.length === 0 || !generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "필수 항목 누락 또는 형식 오류" });
  }

  const conn = await dataPool.getConnection();
  try {
    await conn.beginTransaction();

    for (const log of logs) {
      const {
        mac_address,
        serial,
        artist,
        lightstick,
        model,
        certification_info,
      } = log;

      if (!mac_address || !serial || !lightstick || !artist) {
        return res
          .status(400)
          .json({ success: false, message: "필수 항목 누락 또는 형식 오류" });
      }

      await conn.query(
        `
        INSERT INTO ${tableName} (
          line, generator_name, mac_address, serial, artist, lightstick, model, certification_info,
          user_id, user_name, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))
        ON DUPLICATE KEY UPDATE
          line = VALUES(line),
          serial = VALUES(serial),
          artist = VALUES(artist),
          lightstick = VALUES(lightstick),
          model = VALUES(model),
          certification_info = VALUES(certification_info),
          user_id = VALUES(user_id),
          user_name = VALUES(user_name),
          updated_at = NOW(6)
        `,
        [
          line,
          generator_name,
          mac_address,
          serial,
          artist,
          lightstick,
          model || null,
          certification_info || null,
          user.id,
          user.name,
        ],
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(`${tableName} 저장 오류:`, err);
    res.status(500).json({ success: false, message: "서버 오류" });
  } finally {
    conn.release();
  }
}

//CartonBox Save Logs
// ✅ 변경 핵심: per-mac per-row 락 제거 → 배치(라인+generator) 락 1회로 처리
async function saveCartonBoxPrintLogs(req, res, tableName) {
  const { logs, generator_name, line } = req.body;
  const user = req.session.user;

  if (!Array.isArray(logs) || logs.length === 0 || !generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "필수 항목 누락 또는 형식 오류" });
  }

  const conn = await dataPool.getConnection();

  // ✅ 배치 락 키: line + generator_name (공정 병렬성을 유지하면서도 충돌 최소화)
  const lockKey = `CARTON_BATCH_${sanitizeLockKey(
    line ?? "UNKNOWN",
  )}_${sanitizeLockKey(generator_name)}`;
  const batchLockPath = `${getLockPathForCartonbox()}${lockKey}`;

  const lockRes = await acquireLockWithRetry(batchLockPath, {
    maxRetry: 8,
    delayMs: 120,
  });
  if (!lockRes.ok) {
    if (lockRes.err?.code === "NODE_EXISTS") {
      return res.status(423).json({
        success: false,
        message: "CartonBox 저장이 진행 중입니다. 잠시 후 다시 시도하세요.",
      });
    }
    console.error("❌ cartonbox_log batch lock 획득 실패:", lockRes.err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }

  try {
    await conn.beginTransaction();

    for (const log of logs) {
      const {
        mac_address,
        serial,
        artist,
        lightstick,
        model,
        device_name,
        box_count,
        box_total_count,
        factory_date,
      } = log;

      // 최소 검증
      if (!mac_address || !serial || !lightstick || !artist) {
        throw new Error("필수 항목 누락(mac_address/serial/lightstick/artist)");
      }

      await conn.query(
        `
        INSERT INTO ${tableName} (
          line, generator_name, mac_address, serial, artist, lightstick, model, factory_date, device_name, box_count, box_total_count,
          user_id, user_name, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))
        ON DUPLICATE KEY UPDATE
          line = VALUES(line),
          serial = VALUES(serial),
          artist = VALUES(artist),
          lightstick = VALUES(lightstick),
          model = VALUES(model),
          factory_date = VALUES(factory_date),
          device_name = VALUES(device_name),
          box_count = VALUES(box_count),
          box_total_count = VALUES(box_total_count),
          user_id = VALUES(user_id),
          user_name = VALUES(user_name),
          updated_at = NOW(6)
        `,
        [
          line,
          generator_name,
          mac_address,
          serial,
          artist,
          lightstick,
          model,
          factory_date,
          device_name,
          box_count,
          box_total_count,
          user.id,
          user.name,
        ],
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(`${tableName} 저장 오류:`, err);
    res.status(500).json({ success: false, message: "서버 오류" });
  } finally {
    conn.release();
    try {
      await releaseLock(batchLockPath);
    } catch (e) {
      console.error("⚠️ cartonbox_log batch releaseLock 실패:", e);
    }
  }
}

async function saveCartonBoxPrintExceptionLogs(req, res) {
  const { logs, generator_name, line, description } = req.body;
  const user = req.session.user;

  if (!Array.isArray(logs) || logs.length === 0 || !generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "필수 항목 누락 또는 형식 오류" });
  }

  const conn = await dataPool.getConnection();

  try {
    await conn.beginTransaction();

    for (const log of logs) {
      const {
        mac_address,
        serial,
        artist,
        lightstick,
        model,
        device_name,
        box_count,
        box_total_count,
        factory_date,
      } = log;

      await conn.query(
        `
        INSERT INTO cartonbox_label_print_exceptions (
          line,
          generator_name,
          mac_address,
          serial,
          artist,
          lightstick,
          model,
          factory_date,
          device_name,
          box_count,
          box_total_count,
          user_id,
          user_name,
          description,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(6))
        `,
        [
          line,
          generator_name,
          mac_address,
          serial,
          artist,
          lightstick,
          model,
          factory_date,
          device_name,
          box_count,
          box_total_count,
          user.id,
          user.name,
          description ?? null,
        ],
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("cartonbox_label_print_exceptions 저장 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  } finally {
    conn.release();
  }
}

async function deleteCartonBoxPrintLogsBySerialRange(req, res, tableName) {
  const { start_serial, end_serial, generator_name } = req.body;

  if (!start_serial || !end_serial || !generator_name) {
    return res.status(400).json({
      success: false,
      message: "시작/끝 시리얼 번호 또는 generator_name이 누락되었습니다.",
    });
  }

  // 접두사와 숫자 분리 함수
  const parseSerial = (serial) => {
    const parts = serial.split("-");
    if (parts.length !== 2) return null;
    const prefix = parts[0];
    const number = parseInt(parts[1], 10);
    if (!prefix || isNaN(number)) return null;
    return { prefix, number };
  };

  const start = parseSerial(start_serial);
  const end = parseSerial(end_serial);

  if (!start || !end) {
    return res.status(400).json({
      success: false,
      message: "시리얼 형식이 잘못되었습니다. 예: ABC-00001",
    });
  }

  if (start.prefix !== end.prefix) {
    return res.status(400).json({
      success: false,
      message: "시작/끝 시리얼의 접두사가 일치하지 않습니다.",
    });
  }

  const conn = await dataPool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `
      DELETE FROM ${tableName}
      WHERE generator_name = ?
        AND SUBSTRING_INDEX(serial, '-', 1) = ?
        AND CAST(SUBSTRING_INDEX(serial, '-', -1) AS UNSIGNED) BETWEEN ? AND ?
      `,
      [generator_name, start.prefix, start.number, end.number],
    );

    await conn.commit();
    res.json({
      success: true,
      deletedCount: result.affectedRows,
      message: `✅ ${result.affectedRows}건 삭제됨`,
    });
  } catch (err) {
    await conn.rollback();
    console.error(`${tableName} 삭제 오류:`, err);
    res.status(500).json({ success: false, message: "서버 오류" });
  } finally {
    conn.release();
  }
}

async function deleteGiftBoxPrintLogsBySerialRange(req, res, tableName) {
  const { start_serial, end_serial, generator_name } = req.body;

  if (!start_serial || !end_serial || !generator_name) {
    return res.status(400).json({
      success: false,
      message: "시작/끝 시리얼 번호 또는 generator_name이 누락되었습니다.",
    });
  }

  // 접두사와 숫자 분리 함수
  const parseSerial = (serial) => {
    const parts = serial.split("-");
    if (parts.length !== 2) return null;
    const prefix = parts[0];
    const number = parseInt(parts[1], 10);
    if (!prefix || isNaN(number)) return null;
    return { prefix, number };
  };

  const start = parseSerial(start_serial);
  const end = parseSerial(end_serial);

  if (!start || !end) {
    return res.status(400).json({
      success: false,
      message: "시리얼 형식이 잘못되었습니다. 예: ABC-00001",
    });
  }

  if (start.prefix !== end.prefix) {
    return res.status(400).json({
      success: false,
      message: "시작/끝 시리얼의 접두사가 일치하지 않습니다.",
    });
  }

  const conn = await dataPool.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `
      DELETE FROM ${tableName}
      WHERE generator_name = ?
        AND SUBSTRING_INDEX(serial, '-', 1) = ?
        AND CAST(SUBSTRING_INDEX(serial, '-', -1) AS UNSIGNED) BETWEEN ? AND ?
      `,
      [generator_name, start.prefix, start.number, end.number],
    );

    await conn.commit();
    res.json({
      success: true,
      deletedCount: result.affectedRows,
      message: `✅ ${result.affectedRows}건 삭제됨`,
    });
  } catch (err) {
    await conn.rollback();
    console.error(`${tableName} 삭제 오류:`, err);
    res.status(500).json({ success: false, message: "서버 오류" });
  } finally {
    conn.release();
  }
}

//최신 로그 조회
const getLatestPrintLogs = async (tableName, generatorName, pool) => {
  try {
    const [macRows] = await pool.query(
      `
      SELECT *
      FROM ${tableName}
      WHERE generator_name = ?
      ORDER BY CONV(REPLACE(mac_address, ':', ''), 16, 10) DESC
      LIMIT 1
      `,
      [generatorName],
    );

    const [timeRows] = await pool.query(
      `
      SELECT *
      FROM ${tableName}
      WHERE generator_name = ?
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [generatorName],
    );

    return {
      success: true,
      latest_by_mac: macRows[0] ?? null,
      latest_by_time: timeRows[0] ?? null,
    };
  } catch (err) {
    console.error(`${tableName} 최신 프린트 로그 조회 오류:`, err);
    throw new Error("DB 조회 중 오류 발생");
  }
};

// ✅ 카톤박스 box_count / box_total_count 조회 (generator_name 기준, 최신 1건)
router.get("/cartonbox_counts", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name은 필수입니다",
    });
  }

  const lockKey = generator_name.replace(/[^a-zA-Z0-9_-]/g, "");
  const lockPath = `${getLockPathForCartonbox()}GEN_${lockKey}`;

  const MAX_RETRY = 5; // 재시도 횟수
  const RETRY_DELAY_MS = 200; // 재시도 간 딜레이

  let acquired = false;
  let attempt = 0;

  while (!acquired && attempt < MAX_RETRY) {
    try {
      await createEphemeralLock(lockPath);
      autoReleaseLock(lockPath); // 백업 자동 해제
      acquired = true;
    } catch (err) {
      attempt++;

      if (attempt < MAX_RETRY) {
        console.warn(
          `⏳ cartonbox_counts lock 대기중... (${attempt}/${MAX_RETRY})`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      console.error("❌ cartonbox_counts lock 획득 실패:", err);
      return res.status(429).json({
        success: false,
        message: "잠시 후 다시 시도하세요 (lock busy)",
      });
    }
  }

  try {
    const [rows] = await dataPool.query(
      `
      SELECT box_count, box_total_count, updated_at
      FROM cartonbox_label_print_logs
      WHERE generator_name = ?
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [generator_name],
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        box_count: 0,
        box_total_count: 0,
        latest_at: null,
      });
    }

    const latest = rows[0];
    return res.json({
      success: true,
      box_count: latest.box_count ?? 0,
      box_total_count: latest.box_total_count ?? 0,
      latest_at: latest.updated_at,
    });
  } catch (err) {
    console.error("❌ cartonbox_counts 조회 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  } finally {
    try {
      await releaseLock(lockPath);
    } catch {}
  }
});

//커서 기반
// ===============================
// Cursor-based helpers (ADD)
// ===============================
async function hasNextById(generator_name, lastId) {
  const [[row]] = await dataPool.query(
    `
    SELECT id
    FROM process_generated_macs
    WHERE generator_name = ?
      AND id > ?
    ORDER BY id ASC
    LIMIT 1
    `,
    [generator_name, lastId],
  );
  return !!row;
}

/**
 * targetId가 포함되도록 "limit 개" 윈도우의 시작 cursor(= 이전 id)를 계산
 * - cursor 기반 조회가 "id > cursor" 이므로,
 *   윈도우 첫 row의 id를 startId라 할 때 cursor는 startId보다 작은 가장 큰 id (없으면 null)
 */
async function computeCursorForExactStart(generator_name, targetId) {
  const [[prev]] = await dataPool.query(
    `
    SELECT id
    FROM process_generated_macs
    WHERE generator_name = ?
      AND id < ?
    ORDER BY id DESC
    LIMIT 1
    `,
    [generator_name, targetId],
  );

  return { cursor: prev?.id ?? null, startId: targetId };
}

async function getStatusCursorRows({
  generator_name,
  cursor,
  limit,
  logTableName,
}) {
  const safeLimit = Math.max(parseInt(limit || 100, 10), 1);
  const cursorId = cursor ? parseInt(cursor, 10) : 0;

  // "이번 커서 구간의 process_generated_macs"만 가져온 뒤 로그 join
  const [rows] = await dataPool.query(
    `
    WITH paged AS (
      SELECT *
      FROM process_generated_macs
      WHERE generator_name = ?
        AND id > ?
      ORDER BY id ASC
      LIMIT ?
    )
    SELECT
      p.*,
      IF(l.serial IS NULL, 0, 1) AS is_printed,
      l.updated_at AS printed_at,
      l.user_name
    FROM paged p
    LEFT JOIN ${logTableName} l
      ON p.serial = l.serial AND l.generator_name = ?
    ORDER BY p.id ASC
    `,
    [generator_name, cursorId, safeLimit, generator_name],
  );

  const lastId = rows.length ? rows[rows.length - 1].id : null;

  let hasNext = false;
  let nextCursor = null;

  if (lastId != null) {
    // rows가 limit보다 적으면 다음 없음
    if (rows.length < safeLimit) {
      hasNext = false;
    } else {
      // limit 만큼 꽉 찼으면 다음이 실제 있는지 1건 exists로 확인
      hasNext = await hasNextById(generator_name, lastId);
    }
    nextCursor = lastId;
  }

  return {
    rows,
    cursorUsed: cursorId || null,
    nextCursor,
    hasNext,
  };
}
// ===============================
// Cursor-based status routes (ADD)
// ===============================

// 디바이스 라벨 출력 이력 조회 (커서 기반)
router.get("/device_status_cursor", async (req, res) => {
  console.log("device_status_cursor");

  const { generator_name, cursor = null, limit = 100 } = req.query;

  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name은 필수입니다" });
  }

  try {
    const result = await getStatusCursorRows({
      generator_name,
      cursor,
      limit,
      logTableName: "device_label_print_logs",
    });

    return res.json({
      success: true,
      data: result.rows,
      cursorUsed: result.cursorUsed,
      nextCursor: result.nextCursor,
      hasNext: result.hasNext,
    });
  } catch (err) {
    console.error("❌ device_status_cursor 조회 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// Gift 박스 출력 이력 조회 (커서 기반)
router.get("/giftbox_status_cursor", async (req, res) => {
  const { generator_name, cursor = null, limit = 100 } = req.query;

  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name은 필수입니다" });
  }

  try {
    const result = await getStatusCursorRows({
      generator_name,
      cursor,
      limit,
      logTableName: "giftbox_label_print_logs",
    });

    return res.json({
      success: true,
      data: result.rows,
      cursorUsed: result.cursorUsed,
      nextCursor: result.nextCursor,
      hasNext: result.hasNext,
    });
  } catch (err) {
    console.error("❌ giftbox_status_cursor 조회 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// 카톤 박스 출력 이력 조회 (커서 기반)
router.get("/cartonbox_status_cursor", async (req, res) => {
  const { generator_name, cursor = null, limit = 100 } = req.query;

  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name은 필수입니다" });
  }

  try {
    const result = await getStatusCursorRows({
      generator_name,
      cursor,
      limit,
      logTableName: "cartonbox_label_print_logs",
    });

    return res.json({
      success: true,
      data: result.rows,
      cursorUsed: result.cursorUsed,
      nextCursor: result.nextCursor,
      hasNext: result.hasNext,
    });
  } catch (err) {
    console.error("❌ cartonbox_status_cursor 조회 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});
router.post("/cartonbox_status_by_serials", async (req, res) => {
  const { generator_name, serials } = req.body;

  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name은 필수입니다" });
  }

  if (!Array.isArray(serials) || serials.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const list = [
    ...new Set(serials.map((s) => String(s || "").trim()).filter(Boolean)),
  ];
  if (list.length === 0) return res.json({ success: true, data: [] });

  try {
    const placeholders = list.map(() => "?").join(",");

    const sql = `
      SELECT
        g.id,
        g.mac_address,
        g.serial,
        g.artist,
        g.lightstick,
        CASE
          WHEN ls.id IS NOT NULL OR lm.id IS NOT NULL THEN 1
          ELSE 0
        END AS is_printed
      FROM process_generated_macs g
      LEFT JOIN cartonbox_label_print_logs ls
        ON ls.generator_name = g.generator_name
       AND ls.serial = g.serial
      LEFT JOIN cartonbox_label_print_logs lm
        ON lm.generator_name = g.generator_name
       AND lm.mac_address = g.mac_address
      WHERE g.generator_name = ?
        AND g.serial IN (${placeholders})
      ORDER BY FIELD(g.serial, ${placeholders});
    `;

    const params = [generator_name, ...list, ...list];
    const [rows] = await dataPool.query(sql, params);

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ cartonbox_status_by_serials error:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ===============================
// Cursor-based find routes (ADD)
// ===============================

// 시리얼 기준: "그 시리얼이 포함된 limit 묶음"의 cursor 계산
router.get("/find_serial_cursor", async (req, res) => {
  const { generator_name, serial } = req.query;

  if (!generator_name || !serial) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name, serial은 필수입니다" });
  }

  try {
    const [[target]] = await dataPool.query(
      `
      SELECT id, serial
      FROM process_generated_macs
      WHERE generator_name = ?
        AND serial = ?
      LIMIT 1
      `,
      [generator_name, serial],
    );

    if (!target) {
      return res.json({ success: false, message: "Serial not found" });
    }

    // ✅ 핵심: targetId 직전 id를 cursor로 반환
    const [[prev]] = await dataPool.query(
      `
      SELECT id
      FROM process_generated_macs
      WHERE generator_name = ?
        AND id < ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [generator_name, target.id],
    );

    return res.json({
      success: true,
      cursor: prev?.id ?? 0, // device_status_cursor에서 id > cursor 이므로 0이면 처음부터
      targetId: target.id,
      serial: target.serial,
    });
  } catch (err) {
    console.error("❌ find_serial_cursor 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// MAC 기준: "그 MAC이 포함된 limit 묶음"의 cursor 계산
router.get("/find_mac_cursor", async (req, res) => {
  const { generator_name, mac, limit = 100 } = req.query;

  if (!generator_name || !mac) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name, mac은 필수입니다" });
  }

  try {
    const [[target]] = await dataPool.query(
      `
      SELECT id, serial, mac_address
      FROM process_generated_macs
      WHERE generator_name = ?
        AND mac_address = ?
      LIMIT 1
      `,
      [generator_name, mac],
    );

    if (!target) {
      return res.json({ success: false, message: "MAC not found" });
    }

    const { cursor } = await computeCursorForTargetId(
      generator_name,
      target.id,
      limit,
    );

    return res.json({
      success: true,
      cursor,
      targetId: target.id,
      serial: target.serial,
      mac_address: target.mac_address,
    });
  } catch (err) {
    console.error("❌ find_mac_cursor 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});
router.get("/search_mac", async (req, res) => {
  const { generator_name, mac } = req.query;

  if (!generator_name || !mac) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name, mac은 필수입니다" });
  }

  try {
    // 1) generated_macs에서 중복 포함으로 전부 조회 (artist/lightstick 포함)
    const [rows] = await dataPool.query(
      `
      SELECT
        id,
        generator_name,
        mac_address,
        serial,
        artist,
        lightstick
      FROM process_generated_macs
      WHERE generator_name = ?
        AND UPPER(mac_address) = UPPER(?)
      ORDER BY id DESC
      `,
      [generator_name, mac],
    );

    if (!rows || rows.length === 0) {
      return res.json({ success: false, message: "MAC not found", data: [] });
    }

    // 2) 출력 여부 (mac 기준)
    const [[printedRow]] = await dataPool.query(
      `
      SELECT 1 AS printed
      FROM device_label_print_logs
      WHERE generator_name = ?
        AND UPPER(mac_address) = UPPER(?)
      LIMIT 1
      `,
      [generator_name, mac],
    );

    const isPrinted = !!printedRow;

    // 3) 프론트가 쓰는 형태로 반환
    const data = rows.map((r) => ({
      id: r.id,
      generator_name: r.generator_name,
      mac_address: r.mac_address,
      serial: r.serial,
      artist: r.artist ?? null,
      lightstick: r.lightstick ?? null,
      is_printed: isPrinted,
    }));

    return res.json({ success: true, data });
  } catch (err) {
    console.error("❌ search_mac 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

module.exports = router;
