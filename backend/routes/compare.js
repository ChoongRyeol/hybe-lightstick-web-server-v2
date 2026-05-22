// backend/routes/compare.js
const express = require("express");
const router = express.Router();
const { dataPool } = require("../db");

const {
  createEphemeralLock,
  releaseLock,
  autoReleaseLock,
} = require("../utils/lockHandler");

const { getLockPathForCompare } = require("../zk");

// ------------------------------
// Helpers
// ------------------------------
function normUpper(v) {
  if (v === undefined || v === null) return null;
  return String(v).trim().toUpperCase();
}

function hasText(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

// ------------------------------
// ✅ Compare Process (락은 여기서 잡는다)
// ------------------------------
router.post("/process", async (req, res) => {
  // ✅ description은 로그용으로만 사용 (process_compare 필드에 섞이지 않게 분리)
  const { mac_address, generator_name, description, result, ...otherFields } =
    req.body;

  if (!mac_address || !generator_name) {
    return res.status(400).json({ success: false, error: "필수 필드 누락" });
  }

  // ✅ MAC 단위 락
  const lockPath = `${getLockPathForCompare()}${String(mac_address).replace(
    /:/g,
    "",
  )}`;

  let conn = null;

  // ✅ 로그용 필드 안전 추출
  const artist = otherFields.artist ?? null;
  const lightstick = otherFields.lightstick ?? null;
  const serial = otherFields.serial ?? null;
  const device_name = otherFields.device_name ?? null;
  const fw_version = otherFields.fw_version ?? null;
  const line = otherFields.line ?? null;

  // ✅ result 혼용 정책
  const normalizedResult = normUpper(result);
  const isFail = normalizedResult === "FAIL"; // 명시 FAIL만 "로그만"
  const descOk = hasText(description);

  try {
    // ✅ 여기서 락 획득 (WinUI가 /lock 안 쓰므로)
    await createEphemeralLock(lockPath, `COMPARE_${line ?? "UNKNOWN"}`);
    autoReleaseLock(lockPath); // 보험(락 누수 방지)

    conn = await dataPool.getConnection();
    await conn.beginTransaction();

    // =========================================
    // 1) result=FAIL → process_compare 저장 금지
    //    - log만 저장하고 커밋
    // =========================================
    if (isFail) {
      const logSql = `
        INSERT INTO process_compare_log
          (line, mac_address, generator_name, artist, lightstick, serial, device_name, fw_version, result${
            descOk ? ", description" : ""
          })
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, 'FAIL'${descOk ? ", ?" : ""})
      `;
      const logParams = [
        line,
        mac_address,
        generator_name,
        artist,
        lightstick,
        serial,
        device_name,
        fw_version,
      ];
      if (descOk) logParams.push(String(description).trim());

      const [logResult] = await conn.execute(logSql, logParams);
      if (logResult?.affectedRows !== 1) {
        throw new Error("COMPARE LOG(FAIL) INSERT 실패");
      }

      await conn.commit();

      return res.status(200).json({
        success: true,
        registered: false,
        updated: false,
        message: "FAIL: process_compare 저장 없이 로그만 저장",
      });
    }

    // =========================================
    // 2) result 없음 또는 PASS(또는 기타) → 기존 로직
    //    - process_compare INSERT/UPDATE
    //    - process_compare_log 기록(PASS/UPDATE)
    // =========================================

    // 2-1) 존재 여부 확인
    const [existsRows] = await conn.execute(
      "SELECT 1 FROM process_compare WHERE mac_address = ? LIMIT 1",
      [mac_address],
    );

    // process_compare 저장 시 description/result는 제외
    const keys = Object.keys(otherFields).concat(["generator_name"]);
    const values = keys.map((k) => {
      if (k === "generator_name") return generator_name;
      const v = otherFields[k];
      return v === undefined ? null : v;
    });

    if (existsRows.length > 0) {
      // ---------------------------
      // UPDATE
      // ---------------------------
      const assignments = keys
        .map((k) => `${k} = ?`)
        .concat("updated_at = NOW(6)")
        .join(", ");

      const [updateResult] = await conn.execute(
        `UPDATE process_compare SET ${assignments} WHERE mac_address = ?`,
        [...values, mac_address],
      );

      if (updateResult?.affectedRows !== 1) {
        throw new Error(
          `COMPARE UPDATE 실패 (affectedRows=${
            updateResult?.affectedRows ?? "null"
          })`,
        );
      }

      // ✅ UPDATE 로그 (기존대로 UPDATE)
      const [logResult] = await conn.execute(
        `
        INSERT INTO process_compare_log
          (line, mac_address, generator_name, artist, lightstick, serial, device_name, fw_version, result, description)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, 'UPDATE', 'DUPLICATED')
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

      if (logResult?.affectedRows !== 1) {
        throw new Error("COMPARE LOG(UPDATE) INSERT 실패");
      }

      await conn.commit();

      return res.status(200).json({
        success: true,
        registered: true,
        updated: true,
        message: "COMPARE LOG(UPDATE) COMPLETED",
      });
    } else {
      // ---------------------------
      // INSERT
      // ---------------------------
      const insertKeys = keys.concat(["mac_address"]);
      const placeholders = insertKeys.map(() => "?").join(", ");
      const insertValues = insertKeys.map((k) => {
        if (k === "mac_address") return mac_address;
        if (k === "generator_name") return generator_name;
        const v = otherFields[k];
        return v === undefined ? null : v;
      });

      const [insertResult] = await conn.execute(
        `INSERT INTO process_compare (${insertKeys.join(
          ",",
        )}) VALUES (${placeholders})`,
        insertValues,
      );

      if (insertResult?.affectedRows !== 1) {
        throw new Error(
          `COMPARE INSERT 실패 (affectedRows=${
            insertResult?.affectedRows ?? "null"
          })`,
        );
      }

      // ✅ PASS 로그 (description 있으면 저장)
      const logSql = `
        INSERT INTO process_compare_log
          (line, mac_address, generator_name, artist, lightstick, serial, device_name, fw_version, result${
            descOk ? ", description" : ""
          })
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, 'PASS'${descOk ? ", ?" : ""})
      `;
      const logParams = [
        line,
        mac_address,
        generator_name,
        artist,
        lightstick,
        serial,
        device_name,
        fw_version,
      ];
      if (descOk) logParams.push(String(description).trim());

      const [logResult] = await conn.execute(logSql, logParams);
      if (logResult?.affectedRows !== 1) {
        throw new Error("COMPARE LOG(PASS) INSERT 실패");
      }

      await conn.commit();

      return res.status(200).json({
        success: true,
        registered: true,
        updated: false,
        message: "✅ MAC 등록 완료",
      });
    }
  } catch (err) {
    try {
      if (conn) await conn.rollback();
    } catch {}

    // 락 이미 존재 → 다른 라인이 처리 중
    if (err?.code === "NODE_EXISTS") {
      return res.status(423).json({
        success: false,
        message: "Resource is locked, please try again later",
      });
    }

    console.error("🔴 /compare/process 처리 오류:", err);
    return res.status(500).json({
      success: false,
      error: "DB 처리 중 오류",
      message: err?.message ?? String(err),
    });
  } finally {
    try {
      if (conn) conn.release();
    } catch {}

    try {
      await releaseLock(lockPath);
    } catch {}
  }
});

// ------------------------------
// ✅ Compare Log Only
// ------------------------------
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

  try {
    await dataPool.execute(
      `INSERT INTO process_compare_log
       (line, mac_address, generator_name, artist, lightstick, serial, result, fw_version, device_name, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        line ?? null,
        mac_address,
        generator_name,
        artist ?? null,
        lightstick ?? null,
        serial ?? null,
        String(result),
        fw_version ?? null,
        device_name ?? null,
        description ?? null,
      ],
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
// ✅ Logs list by generator
// ------------------------------
router.get("/logs", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name is required" });
  }

  const limitRaw = req.query.limit;
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "500", 10) || 500, 1),
    5000,
  );

  try {
    const [rows] = await dataPool.execute(
      `SELECT mac_address, generator_name, result, description, updated_at
       FROM process_compare_log
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

// ------------------------------
// ✅ Daily counts
// ------------------------------
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
      FROM process_compare
      WHERE generator_name = ?
        AND updated_at >= CURDATE()
        AND updated_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY);
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
    console.error("❌ daily-counts 오류:", err);
    return res.status(500).json({
      success: false,
      message: "DB 오류",
    });
  }
});

module.exports = router;
