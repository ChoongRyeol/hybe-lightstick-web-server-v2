// routes/write.js  ✅ 전체 교체본
const express = require("express");
const router = express.Router();
const { dataPool } = require("../db");
const {
  createEphemeralLock,
  releaseLock,
  autoReleaseLock,
} = require("../utils/lockHandler");
const { getLockPathForWrite } = require("../zk");
const requireAuth = require("../middleware/auth");
// ====== process debug toggle ======
const DEBUG_PROCESS = false; // ← 여기서 true / false만 바꾸면 됨
// ==================================
// ------------------------------
// Utils
// ------------------------------
function toInt(v, def = 0) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}

function normalizeMacToColonUpper(mac) {
  if (!mac) return "";
  const norm = String(mac)
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "");
  if (norm.length === 12) return norm.match(/.{2}/g).join(":");
  // 이미 : 포함 형태면 대문자 trim만
  return String(mac).trim().toUpperCase();
}

// ✅ 락 선점 API (라우트 구분 명확하게 /write/lock)
router.post("/lock", async (req, res) => {
  const { mac_address } = req.body;

  if (!mac_address) {
    return res.status(400).json({ error: "mac_address required" });
  }

  const lockPath = `${getLockPathForWrite()}${String(mac_address).replace(
    /:/g,
    "",
  )}`;

  try {
    await createEphemeralLock(lockPath);
    autoReleaseLock(lockPath); // 보험

    // ✅ 중복 체크는 가볍게 (SELECT 1)
    const [rows] = await dataPool.execute(
      `SELECT 1 FROM process_mac_write WHERE mac_address = ? LIMIT 1`,
      [mac_address],
    );

    if (rows.length > 0) {
      await releaseLock(lockPath).catch(() => {});
      return res
        .status(200)
        .json({ registered: true, message: "MAC address already exists" });
    }

    return res.status(200).json({
      registered: false,
      message: "✅ MAC address is not registered",
    });
  } catch (err) {
    if (err.code === "NODE_EXISTS") {
      return res
        .status(423)
        .json({ error: "Resource is locked, please try again later" });
    }
    console.error("❌ /lock error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ MAC 공정 처리 API (등록 + 로그)
router.post("/process", async (req, res) => {
  const t0 = process.hrtime.bigint();
  const step = (label, start) => {
    if (!DEBUG_PROCESS) return;
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`[process] ${label} ${ms.toFixed(1)}ms`);
  };

  const { mac_address, generator_name, ...otherFields } = req.body;

  if (!mac_address || !generator_name) {
    return res.status(400).json({ success: false, error: "필수 필드 누락" });
  }

  const lockPath = `${getLockPathForWrite()}${String(mac_address).replace(/:/g, "")}`;
  let conn = null;

  const artist = otherFields.artist ?? null;
  const lightstick = otherFields.lightstick ?? null;
  const serial = otherFields.serial ?? null;
  const device_name = otherFields.device_name ?? null;
  const fw_version = otherFields.fw_version ?? null;
  const line = otherFields.line ?? null;

  try {
    let t;

    t = process.hrtime.bigint();
    conn = await dataPool.getConnection();
    step("getConnection", t);

    t = process.hrtime.bigint();
    await conn.beginTransaction();
    step("beginTransaction", t);

    // ✅ INSERT SQL 생성(기존 유지)
    const keys = Object.keys(otherFields).concat([
      "mac_address",
      "generator_name",
    ]);
    const placeholders = keys.map(() => "?").join(", ");
    const sql = `INSERT INTO process_mac_write (${keys.join(",")}) VALUES (${placeholders})`;
    const values = keys.map((k) =>
      k === "mac_address"
        ? mac_address
        : k === "generator_name"
          ? generator_name
          : otherFields[k] === undefined
            ? null
            : otherFields[k],
    );

    try {
      t = process.hrtime.bigint();
      const [insertResult] = await conn.execute(sql, values);
      step("INSERT process_device_test", t);

      if (insertResult?.affectedRows !== 1) {
        throw new Error("MAC INSERT 실패");
      }

      t = process.hrtime.bigint();
      await conn.execute(
        `
        INSERT INTO process_device_test_log
        (line, mac_address, generator_name, artist, lightstick, serial, device_name, result, fw_version, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'PASS', ?, '')
        `,
        [
          line,
          mac_address,
          generator_name,
          artist,
          lightstick,
          serial,
          device_name,
          fw_version,
        ],
      );
      step("INSERT PASS LOG", t);

      t = process.hrtime.bigint();
      await conn.commit();
      step("commit", t);

      return res.json({ success: true, registered: true });
    } catch (e) {
      if (e?.code === "ER_DUP_ENTRY") {
        t = process.hrtime.bigint();
        await conn.execute(
          `
          INSERT INTO process_mac_write_log
          (line, mac_address, generator_name, artist, lightstick, serial, device_name, result, fw_version, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'DUPLICATE', ?, 'DUPLICATE')
          `,
          [
            line,
            mac_address,
            generator_name,
            artist,
            lightstick,
            serial,
            device_name,
            fw_version,
          ],
        );
        step("INSERT DUP LOG", t);

        t = process.hrtime.bigint();
        await conn.commit();
        step("commit(DUP)", t);

        return res.json({ success: true, registered: false });
      }

      throw e;
    }
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch {}
    }

    console.error("🔴 /process ERROR", err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    if (conn) conn.release();

    // ✅ releaseLock은 항상 수행하되, timing 로그는 디버그일 때만
    const t = process.hrtime.bigint();
    try {
      await releaseLock(lockPath);
    } finally {
      step("releaseLock", t);

      // ✅ TOTAL도 평소엔 안 찍고, 필요 시만(혹은 200ms 이상만)
      if (DEBUG_PROCESS) {
        const total = Number(process.hrtime.bigint() - t0) / 1e6;
        console.log(`[process] TOTAL ${total.toFixed(1)}ms`);
      }
    }
  }
});

// ✅ 공정 로그 별도 저장 API
router.post("/log", async (req, res) => {
  const {
    line,
    mac_address,
    artist,
    lightstick,
    serial,
    fw_version,
    generator_name,
    result,
    description,
    device_name,
  } = req.body;

  if (!mac_address || !generator_name || !result) {
    return res.status(400).json({ error: "필수 필드 누락" });
  }

  const params = [
    line ?? null,
    mac_address,
    generator_name,
    artist ?? null,
    lightstick ?? null,
    serial ?? null,
    result,
    fw_version ?? null,
    device_name ?? null,
    description ?? null,
  ];

  try {
    await dataPool.execute(
      `INSERT INTO process_mac_write_log
       (line, mac_address, generator_name, artist, lightstick, serial, result, fw_version, device_name, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params,
    );

    return res
      .status(200)
      .json({ success: true, message: "📘 MAC 로그 저장됨" });
  } catch (err) {
    console.error("❌ 로그 저장 실패:", err);
    return res.status(500).json({ error: "로그 저장 중 오류" });
  }
});

// ------------------------------
// Cursor paging (핵심)
// ------------------------------
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
          ROW_NUMBER() OVER (
            PARTITION BY l.generator_name, l.mac_address
            ORDER BY l.updated_at DESC, l.id DESC
          ) AS rn
        FROM process_mac_write_log l
        JOIN g
          ON g.generator_name = l.generator_name
         AND g.mac_address    = l.mac_address
      )
      SELECT
        g.*,
        lr.result      AS log_result,
        lr.description AS log_description,
        lr.updated_at  AS log_updated_at
      FROM g
      LEFT JOIN log_rank lr
        ON g.generator_name = lr.generator_name
       AND g.mac_address    = lr.mac_address
       AND lr.rn = 1
      ORDER BY g.id ASC
      `,
      [generator_name, lastId, take + 1], // +1로 hasMore 판단
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
      // ✅ 디버그(필요 시 WinUI에서 확인 가능)
      debug: {
        firstId: pageRows.length ? pageRows[0].id : null,
        lastId: pageRows.length ? pageRows[pageRows.length - 1].id : null,
        take,
      },
      errorCode: 0,
    });
  } catch (err) {
    console.error("❌ /api/write/cursor-with-log 오류:", err);
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
    // 현재 페이지의 첫 row id를 구함 (id > cur)
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

    // 이전 페이지: id < firstId 인 것 중 최근 pageSize개를 DESC로 뽑고 다시 ASC
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
          ROW_NUMBER() OVER (
            PARTITION BY l.generator_name, l.mac_address
            ORDER BY l.updated_at DESC, l.id DESC
          ) AS rn
        FROM process_mac_write_log l
        JOIN g2
          ON g2.generator_name = l.generator_name
         AND g2.mac_address    = l.mac_address
      )
      SELECT
        g2.*,
        log_rank.result      AS log_result,
        log_rank.description AS log_description,
        log_rank.updated_at  AS log_updated_at
      FROM g2
      LEFT JOIN log_rank
        ON g2.generator_name = log_rank.generator_name
       AND g2.mac_address    = log_rank.mac_address
       AND log_rank.rn = 1
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
    console.error("❌ /api/write/cursor-with-log-prev 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

// ------------------------------
// Count (TotalPages 표시용)
// ------------------------------
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
    console.error("❌ /api/write/count 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

// ------------------------------
// Locate (✅ 여기서 문제 해결의 핵심)
// - startCursor를 targetId-1로 고정하여 "포함 보장"
// ------------------------------
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

  try {
    const macQuery = normalizeMacToColonUpper(mac_address);

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

    // ✅ 포함 보장 커서: targetId - 1
    const startCursor = Math.max(targetId - 1, 0);

    // UI 표시용 page 계산(정확도 유지)
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
        startCursor, // ✅ 이제 cursor-with-log에 넣으면 target row가 반드시 포함됨
        targetId,
        mac_address: macQuery,
      },
      errorCode: 0,
    });
  } catch (err) {
    console.error("❌ /api/write/locate/mac 오류:", err);
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

    // ✅ 포함 보장 커서: id - 1
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
    console.error("❌ /api/write/locate/serial 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

// ------------------------------
// (기존) page-with-log / logs / delete / daily-counts 등
// - 당신 파일 그대로 유지 (필요시 이후 정리)
// ------------------------------
// GET /api/write/page-with-log
router.get("/page-with-log", async (req, res) => {
  const { generator_name, page = 1, page_size = 100 } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name 쿼리 누락",
      data: null,
      errorCode: 1,
    });
  }

  const limit = Math.max(parseInt(page_size, 10) || 100, 1);
  const currentPage = Math.max(parseInt(page, 10) || 1, 1);
  const offset = (currentPage - 1) * limit;

  try {
    // 🔢 총 개수 & totalPages 계산
    const [[{ total }]] = await dataPool.query(
      `
      SELECT COUNT(*) AS total
      FROM process_generated_macs
      WHERE generator_name = ?
      `,
      [generator_name],
    );

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    // ✅ CTE + 윈도우 함수
    // 이번 페이지에 포함된 MAC만 대상으로 최신 log 1건 매칭
    const [rows] = await dataPool.query(
      `
      WITH g AS (
        SELECT *
        FROM process_generated_macs
        WHERE generator_name = ?
        ORDER BY id ASC
        LIMIT ? OFFSET ?
      ),
      log_rank AS (
        SELECT
          l.*,
          ROW_NUMBER() OVER (
            PARTITION BY l.generator_name, l.mac_address
            ORDER BY l.updated_at DESC, l.id DESC
          ) AS rn
        FROM process_mac_write_log l
        JOIN g
          ON g.generator_name = l.generator_name
         AND g.mac_address = l.mac_address
      )
      SELECT
        g.*,
        log_rank.result        AS log_result,
        log_rank.description   AS log_description,
        log_rank.updated_at    AS log_updated_at
      FROM g
      LEFT JOIN log_rank
        ON g.generator_name = log_rank.generator_name
       AND g.mac_address = log_rank.mac_address
       AND log_rank.rn = 1
      ORDER BY g.id ASC
      `,
      [generator_name, limit, offset],
    );

    const enriched = rows.map((row, index) => ({
      ...row,
      result: row.log_result || "",
      description: row.log_description || "",
      log_updated_at: row.log_updated_at || null,
      QR_Code: `${row.lightstick}_${row.mac_address}`,
      No: offset + index + 1,
    }));

    res.json({
      success: true,
      message: "",
      data: enriched,
      page: currentPage,
      totalPages,
      errorCode: 0,
    });
  } catch (err) {
    console.error("❌ /api/write/page-with-log 오류:", err);
    res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

// ✅ 로그 조회 API (전체 이력 반환)
router.get("/logs", async (req, res) => {
  const { generator_name } = req.query;
  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name is required" });
  }

  const limitRaw = req.query.limit;
  const limit = Math.min(Math.max(toInt(limitRaw ?? "500", 500), 1), 5000);

  try {
    const [rows] = await dataPool.execute(
      `SELECT mac_address, generator_name, result, description, updated_at
       FROM process_mac_write_log
       WHERE generator_name = ?
       ORDER BY updated_at DESC
       LIMIT ?`,
      [generator_name, limit],
    );
    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error("❌ 로그 조회 실패:", err);
    return res.status(500).json({ success: false, message: "DB 오류" });
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
      FROM process_mac_write
      WHERE generator_name = ?
        AND updated_at >= CURDATE()
        AND updated_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      `,
      [line, generator_name],
    );
    const row = rows?.[0] ?? null;
    res.json({
      success: true,
      line_count: Number(row?.line_count ?? 0),
      generator_count: Number(row?.generator_count ?? 0),
    });
  } catch (err) {
    console.error("❌ daily-counts 오류:", err);
    res.status(500).json({ success: false, message: "DB 오류" });
  }
});

router.post("/delete", requireAuth, async (req, res) => {
  const {
    mac_address,
    artist,
    lightstick,
    serial,
    fw_version,
    device_name,
    generator_name,
    table,
  } = req.body;
  const user = req.session.user;

  const allowedTables = ["process_mac_write"];
  if (!mac_address || !table || !allowedTables.includes(table)) {
    return res
      .status(400)
      .json({ success: false, message: "요청이 잘못되었습니다" });
  }

  try {
    const [rows] = await dataPool.query(
      `SELECT * FROM \`${table}\` WHERE mac_address = ?`,
      [mac_address],
    );
    if (rows.length === 0) {
      return res.json({ success: false, message: "대상 MAC이 존재하지 않음" });
    }

    await dataPool.query(
      "INSERT INTO mac_delete_logs (mac_address, artist, lightstick, serial, fw_version, device_name, generator_name, deleted_table, deleted_by) VALUES (?, ?, ?, ? , ?, ?, ?, ?, ?)",
      [
        mac_address,
        artist,
        lightstick,
        serial,
        fw_version,
        device_name,
        generator_name,
        table,
        user.id,
      ],
    );

    await dataPool.query(
      "INSERT INTO process_mac_write_log (mac_address, artist, lightstick, serial, fw_version, device_name, generator_name, result, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        mac_address,
        artist,
        lightstick,
        serial,
        fw_version,
        device_name,
        generator_name,
        "DELETE",
        `${user.id}`,
      ],
    );

    await dataPool.query(`DELETE FROM \`${table}\` WHERE mac_address = ?`, [
      mac_address,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("MAC 삭제 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});
// ------------------------------
// MAC Scan Log 저장 (초단순)
// ------------------------------
router.post("/scan-log", async (req, res) => {
  const { mac_address, raw, line } = req.body;

  if (!mac_address || !line || !raw) {
    return res.status(400).json({
      success: false,
      message: "mac_address, line required",
    });
  }

  try {
    // 정규화
    const norm = String(mac_address)
      .trim()
      .toUpperCase()
      .replace(/[^0-9A-F]/g, "");

    if (norm.length !== 12) {
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
    console.error("❌ scan-log 저장 오류:", err);
    return res.status(500).json({
      success: false,
      message: "DB 오류",
    });
  }
});

module.exports = router;
