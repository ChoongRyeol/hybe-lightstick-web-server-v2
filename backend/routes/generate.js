// routes/mac.js
const express = require("express");
const router = express.Router();
const { dataPool } = require("../db");
const requireAuth = require("../middleware/auth");

/**
 * 공통 유틸: 숫자 파싱/가드
 */
function toInt(v, def, min, max) {
  const n = parseInt(v, 10);
  const x = Number.isNaN(n) ? def : n;
  return Math.min(Math.max(x, min), max);
}

/**
 * ✅ generator_name 목록 그룹화 조회 (is_hidden=0 기준 최신 row)
 * - (기존 파일에 /groups 라우트가 2번 선언되어 있었는데, 하나로 통합)
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
    console.error("❌ 그룹 목록 조회 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      errorCode: 500,
    });
  }
});

/**
 * ✅ generator_name + lightstick 목록
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
    console.error("❌ 그룹 목록 조회 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      errorCode: 500,
    });
  }
});

/**
 * ✅ 특정 generator_name의 MAC 목록 조회
 * - 기존 호환 유지: 기본은 전체 반환
 * - 선택 개선: ?limit=xxx 지정 시 상한 적용(운영에서 강력 권장)
 */
router.get("/", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name 쿼리 누락",
      data: null,
      errorCode: 1,
    });
  }

  // 선택 파라미터 (기본: 무제한 → 기존 호환)
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

    // ✅ 각 row에 QR_Code와 No 추가
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
    console.error("❌ MAC 목록 조회 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

/**
 * ✅ generator_name 기준 백업 + 삭제 (트랜잭션)
 */
router.post("/backup", requireAuth, async (req, res) => {
  const { generator_name } = req.body;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name 누락",
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
    "process_compare",
    "process_device_test",
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
      message: `백업 후 삭제 완료 (백업 ${totalBackedUp}건, 삭제 ${totalDeleted}건)`,
      generator_name,
      detail,
      errorCode: 0,
    });
  } catch (err) {
    console.error("❌ 삭제 + 백업 오류:", err);
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("❌ 롤백 중 오류:", rollbackErr);
      }
    }
    return res.status(500).json({
      success: false,
      message: "서버 오류(삭제 실패)",
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
      message: "generator_name 누락",
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
    "process_compare",
    "process_device_test",
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
      message: `삭제 완료 (총 ${totalDeleted}건 삭제)`,
      generator_name,
      detail,
      errorCode: 0,
    });
  } catch (err) {
    console.error("❌ 삭제 오류:", err);
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("❌ 롤백 중 오류:", rollbackErr);
      }
    }
    return res.status(500).json({
      success: false,
      message: "서버 오류(삭제 실패)",
      errorCode: 500,
    });
  } finally {
    if (conn) conn.release();
  }
});
/**
 * ✅ MAC 단일 조회
 */
router.get("/by-mac", async (req, res) => {
  const { mac_address } = req.query;

  if (!mac_address) {
    return res.status(400).json({
      success: false,
      message: "mac_address 쿼리 누락",
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
        message: "해당 MAC 주소에 대한 정보가 없습니다.",
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
    console.error("❌ MAC 단일 조회 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

/**
 * ✅ 페이징 기반 MAC 목록 조회
 * - page_size 상한(최대 1000) 적용: 서버 보호
 */
router.get("/page", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res.status(400).json({
      success: false,
      message: "generator_name 쿼리 누락",
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
    console.error("❌ 페이징 MAC 목록 조회 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

/**
 * ✅ 특정 lightstick의 마지막 serial 조회
 */
router.get("/last-serial", async (req, res) => {
  const { lightstick } = req.query;

  if (!lightstick) {
    return res.status(400).json({
      success: false,
      message: "lightstick 쿼리 누락",
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
        message: "해당 아티스트의 기록이 없습니다.",
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
    console.error("❌ 마지막 시리얼 조회 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

//start Serial과 count로 시리얼 가져오기
router.post("/by_start_serial", async (req, res) => {
  const { startSerial, count, generator_name } = req.body;

  // ✅ 입력 검증
  if (!generator_name || typeof generator_name !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "generator_name 필요" });
  }

  if (!startSerial || typeof startSerial !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "startSerial 필요" });
  }

  const n = parseInt(count, 10);
  if (Number.isNaN(n) || n <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "count는 1 이상의 정수여야 합니다." });
  }

  // ✅ 공정 안전: 과도 요청 제한(클라/서버 동일 상한 추천)
  if (n > 5000) {
    return res
      .status(400)
      .json({ success: false, message: "count 최대 5000개까지 허용" });
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
    console.error("❌ by_start_serial 조회 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});
/**
 * ✅ serials 배열로 정보 조회
 * - IN (?) 는 너무 커지면 DB가 급격히 느려질 수 있어 상한 가드 추가
 */
router.post("/by_serials", async (req, res) => {
  const { serials, generator_name } = req.body;

  if (!serials || !Array.isArray(serials)) {
    return res
      .status(400)
      .json({ success: false, message: "serials 배열 필요" });
  }

  if (!generator_name || typeof generator_name !== "string") {
    return res
      .status(400)
      .json({ success: false, message: "generator_name 필요" });
  }

  if (serials.length === 0) return res.json({ success: true, data: [] });

  if (serials.length > 5000) {
    return res
      .status(400)
      .json({ success: false, message: "serials 최대 5000개까지 허용" });
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
    console.error("❌ serials 조회 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * ✅ macs 배열로 정보 조회
 */
router.post("/by_macs", async (req, res) => {
  const { macs } = req.body;

  if (!macs || !Array.isArray(macs)) {
    return res.status(400).json({ success: false, message: "macs 배열 필요" });
  }
  if (macs.length === 0) return res.json({ success: true, data: [] });
  if (macs.length > 5000) {
    return res
      .status(400)
      .json({ success: false, message: "macs 최대 5000개까지 허용" });
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
    console.error("❌ macs 조회 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * ✅ 시리얼 번호로 페이지 계산 (✅ ROW_NUMBER 제거: 성능 개선)
 * - 1) generator_name + serial 로 id/mac 조회
 * - 2) generator_name + id <= targetId COUNT 로 rownum 계산
 * - page = ceil(rownum/pageSize)
 */
router.get("/find_serial_page", async (req, res) => {
  const { generator_name, serial } = req.query;
  const pageSize = toInt(req.query.page_size, 100, 1, 1000);

  if (!generator_name || !serial) {
    return res.status(400).json({
      success: false,
      message: "generator_name 또는 serial 누락",
      errorCode: 1,
    });
  }

  try {
    // 1) serial 위치(=id) 찾기
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
        message: "해당 serial을 찾을 수 없습니다",
        errorCode: 404,
      });
    }

    const targetId = rowSerial.id;

    // 2) 해당 id까지의 개수 = rownum
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
        message: "해당 serial의 위치를 찾을 수 없습니다",
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
    console.error("❌ /api/generated/find_serial_page 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      errorCode: 500,
    });
  }
});

/**
 * ✅ MAC으로 페이지 계산
 */
router.get("/find_mac_page", async (req, res) => {
  const { generator_name, mac } = req.query;
  const pageSize = toInt(req.query.page_size, 100, 1, 1000);

  if (!generator_name || !mac) {
    return res.status(400).json({
      success: false,
      message: "generator_name 또는 mac 누락",
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
        message: "해당 mac을 찾을 수 없습니다",
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
        message: "해당 mac의 위치를 찾을 수 없습니다",
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
    console.error("❌ /api/generated/find_mac_page 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      errorCode: 500,
    });
  }
});

/**
 * ✅ 생성된 MAC 범위 저장 (/api/generated) - 대용량 대응 버전
 * - 기존 로직 유지
 * - (주의) 중복 확인 쿼리가 매우 무거울 수 있음: IN(?) + LIMIT 1
 *   그래도 전체 호환 유지하되, 운영에서는 macs 크기(예: 10k chunk) 권장
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
      .json({ success: false, message: "필수 값 누락 또는 잘못된 요청 형식" });
  }

  try {
    const macAddresses = macs.map((m) => m.mac);

    // ✅ mac_address 중복 확인 (존재 1개라도 있으면 충돌 처리)
    const [existingMacs] = await dataPool.query(
      `SELECT mac_address FROM process_generated_macs WHERE mac_address IN (?) LIMIT 1`,
      [macAddresses],
    );

    if (existingMacs.length > 0) {
      return res.status(409).json({
        success: false,
        message: "이미 등록된 MAC 주소가 있습니다.",
        duplicates: existingMacs.map((m) => m.mac_address),
      });
    }

    // ✅ 저장 처리
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
      message: "✅ 저장 완료",
      count: insertCount,
    });
  } catch (err) {
    console.error("❌ MAC 저장 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * ✅ generator_name 중복 체크
 */
router.get("/check-generator", async (req, res) => {
  const { generator_name } = req.query;

  if (!generator_name) {
    return res
      .status(400)
      .json({ success: false, message: "generator_name이 필요합니다." });
  }

  try {
    const [rows] = await dataPool.query(
      `SELECT 1 FROM process_generated_macs WHERE generator_name = ? LIMIT 1`,
      [generator_name],
    );

    if (rows.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: "중복된 generator_name입니다." });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ /check-generator 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

router.get("/range-summary", async (req, res) => {
  const page = toInt(req.query.page, 0, 0, 1000000000);
  const limit = toInt(req.query.limit, 50, 1, 200);
  const parsedOffset = page * limit;

  try {
    // 1) 전체 generator_name 개수
    const [countRows] = await dataPool.query(`
      SELECT COUNT(DISTINCT generator_name) AS total
      FROM process_generated_macs
    `);
    const totalCount = countRows[0]?.total ?? 0;

    // 2) 페이징 대상 generator_name 목록
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

    // ✅ mac_decimal 변환식(48bit)
    const MAC_DEC_SQL = (expr) =>
      `CAST(CONV(REPLACE(${expr}, ':', ''), 16, 10) AS UNSIGNED)`;

    // ✅ serial 숫자부(마지막 숫자 덩어리) 추출식
    const SERIAL_NUM_SQL = (expr) =>
      `CAST(REGEXP_SUBSTR(${expr}, '[0-9]+$') AS UNSIGNED)`;

    /**
     * ✅ 목표
     * - start/end MAC: mac_decimal MIN/MAX에 해당하는 실제 mac 문자열
     * - expected_count: (max-min+1) "범위상 기대"
     * - total_count / distinct_count: 실제 row / 유니크
     * - serial_start/serial_end: "갯수 계산 X" 실제 MIN/MAX serial_num에 해당하는 실제 serial 문자열
     * - is_continuous: distinct_count == expected_count면 연속(누락 없음)
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
              THEN '✅ YES'
            ELSE '❌ NO'
          END AS is_continuous
        FROM mac_agg a
      ),

      -- ✅ serial 기반 "실제" start/end 계산 (갯수로 계산 금지)
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

        -- ✅ 기대/실제/유니크 + 중복/누락
        mse.expected_count,
        mse.total_count,
        mse.distinct_count,
        mse.duplicate_count,
        mse.missing_count,

        mse.is_continuous,

        -- ✅ "실제" 시리얼 start/end
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
      // ✅ IN (?) 가 3번이므로 generatorNames 3번 전달
      [generatorNames, generatorNames, generatorNames],
    );

    return res.json({
      success: true,
      data: rows,
      totalCount,
      errorCode: 0,
    });
  } catch (err) {
    console.error("❌ MAC 범위 조회 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
      data: null,
      errorCode: 500,
    });
  }
});

/**
 * ✅ 병합
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
      .json({ success: false, message: "잘못된 요청 형식" });
  }

  // ✅ 정리: trim + 중복 제거
  const sources = [
    ...new Set(
      source_generators.map((v) => String(v || "").trim()).filter(Boolean),
    ),
  ];

  const target = String(target_generator || "").trim();

  if (sources.length < 2 || !target) {
    return res
      .status(400)
      .json({ success: false, message: "잘못된 요청 형식" });
  }

  // ✅ target이 source에 포함되면 차단
  if (sources.includes(target)) {
    return res.status(400).json({
      success: false,
      message: "대상 generator_name이 source_generators에 포함되어 있습니다.",
    });
  }

  // ✅ 권한 제한(원하면 유지): ADMIN만 병합
  // requireAuth가 req.user에 role을 세팅한다는 전제
  const role = String(req.user?.role || "")
    .trim()
    .toUpperCase();
  if (role !== "ADMIN") {
    return res
      .status(403)
      .json({ success: false, message: "병합 권한이 없습니다." });
  }

  const conn = await dataPool.getConnection();

  try {
    await conn.beginTransaction();

    // 0️⃣ 실제 병합 대상 존재 확인 + (선택) sources 일부가 누락된 경우 감지
    const [[{ cnt }]] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM process_generated_macs WHERE generator_name IN (?)`,
      [sources],
    );

    if (!cnt) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "병합 대상 generator_name이 존재하지 않습니다.",
      });
    }

    // (선택) sources 중 일부가 DB에 아예 없는 경우도 차단하고 싶으면 사용
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
        message: `병합 대상 중 존재하지 않는 generator_name이 있습니다: ${missing.join(
          ", ",
        )}`,
      });
    }

    // 1️⃣ artist / lightstick 일관성 검증
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
        message: "다른 아티스트 또는 응원봉은 병합할 수 없습니다.",
      });
    }

    // 2️⃣ 업데이트 대상 테이블 목록
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
      "process_device_test_log",
    ];

    // ✅ merged_by: requireAuth 통과했으니 null 허용 대신 명확히 기록
    const mergedBy = req.user?.id || req.user?.name || null; // 그래도 혹시 미들웨어가 req.user를 안 넣는 경우 대비

    // 2-1️⃣ merge 로그 기록 (UPDATE 전에 기록)
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

    // 3️⃣ 일괄 UPDATE (+ affectedRows 합산)
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
      message: "병합 완료",
      merged_from: sources,
      merged_to: target,
      merge_log_id: logResult?.insertId ?? null,
      affected,
      totalAffected,
    });
  } catch (err) {
    await conn.rollback();
    console.error("❌ 병합 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  } finally {
    conn.release();
  }
});

/**
 * ✅ latest 1건 조회
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
    console.error("❌ latest MAC 조회 오류:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * ✅ /api/generated/update - 랜덤 MAC 대응 "전체 교체용 최종본" (트랜잭션)
 *
 * 핵심 정책(유지)
 * 1) start/end가 와도 "전체 범위(full range)"면 SPLIT 아님
 *    - old==new  : META_ONLY_PGM (process_generated_macs만 메타 업데이트)
 *    - old!=new  : RENAME (전체 테이블 generator_name 변경)
 *
 * 2) start/end가 "전체 범위가 아니면" SPLIT
 *    - old==new : 400 (SPLIT은 generator_name 변경 필수)
 *    - old!=new : SPLIT 수행(선택 구간 'MAC 범위'의 mac들만 이동)  ✅ 랜덤 대응 핵심
 *
 * 3) generator_name 중복 체크는 old!=new(바꾸려는 경우)에만
 *
 * 4) RENAME에서 "generator_name만 변경"이면 메타 업데이트 금지
 *    - 서버가 oldGen의 현재 메타를 읽어서, 요청 메타가 동일하면 metaChanged=false로 보고 메타 업데이트 스킵
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
    return res.status(400).json({ success: false, message: "필수 필드 누락" });
  }

  // ---- start/end 정규화 (단일 MAC 보정)
  const sRaw = (start_mac ?? "").trim().toUpperCase();
  const eRaw = (end_mac ?? "").trim().toUpperCase();

  // ✅ start/end 금지 (API 직접 호출 방지)
  if (sRaw || eRaw) {
    return res.status(400).json({
      success: false,
      code: "RANGE_NOT_ALLOWED",
      message: "start_mac/end_mac 변경(분리)은 허용되지 않습니다.",
    });
  }

  let normStart = sRaw;
  let normEnd = eRaw;

  if (normStart && !normEnd) normEnd = normStart;
  if (!normStart && normEnd) normStart = normEnd;

  const hasRange = !!(normStart && normEnd);
  const noRange = !hasRange;

  const conn = await dataPool.getConnection();

  // ---- 테이블 화이트리스트
  const TABLES_TO_MOVE = [
    "mac_delete_logs",
    "process_compare",
    "process_compare_log",
    "process_device_test",
    "process_device_test_log",
    "cartonbox_label_print_logs",
    "device_label_print_logs",
    "giftbox_label_print_logs",
  ];

  const ALL_TABLES_FOR_RENAME = ["process_generated_macs", ...TABLES_TO_MOVE];
  const ALLOWED_TABLES = new Set(ALL_TABLES_FOR_RENAME);

  function assertAllowedTable(table) {
    if (!ALLOWED_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
  }

  // ✅ MAC → UNSIGNED decimal SQL 표현식 (48bit)
  const MAC_DEC_SQL = (expr) =>
    `CAST(CONV(REPLACE(${expr}, ':', ''), 16, 10) AS UNSIGNED)`;

  // ---- MAC 포맷 가드(선택)
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
        `입력한 MAC(${mac})이 generator_name=${genName}에 존재하지 않습니다.`,
      );
    }
  }

  // ✅ oldGen의 전체 범위(랜덤 기준: MIN/MAX mac_decimal)
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
        `generator_name=${genName} 에 해당하는 process_generated_macs 데이터가 없습니다.`,
      );
    }

    return {
      minDec: Number(row.minDec),
      maxDec: Number(row.maxDec),
      cnt: Number(row.cnt),
    };
  }

  // ✅ prefix/suffix/all 규칙 검증 (랜덤 대응: decimal 기준)
  async function validateSplitRangeByMacDec(oldGenName, selMinDec, selMaxDec) {
    const global = await getGlobalMacDecRange(oldGenName);

    const isPrefix = selMinDec === global.minDec && selMaxDec < global.maxDec;
    const isSuffix = selMaxDec === global.maxDec && selMinDec > global.minDec;
    const isAll = selMinDec === global.minDec && selMaxDec === global.maxDec;

    if (!(isPrefix || isSuffix || isAll)) {
      throw new Error(
        `선택 구간이 가운데 형태입니다. ` +
          `앞쪽(prefix) 또는 뒤쪽(suffix)만 분리 가능합니다. ` +
          `(A 전체 dec=${global.minDec}~${global.maxDec}, 선택 dec=${selMinDec}~${selMaxDec})`,
      );
    }

    // ✅ 이동 대상(oldGenName 안에서) 존재 여부
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
        `분리 불가: 선택 구간 내에 ${oldGenName} 데이터가 없습니다.`,
      );
    }

    // ✅ 분리 후 남는 데이터 존재 여부(전체 이동 방지)
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
          `분리 불가: 분리 후 남는 ${oldGenName} 데이터가 없습니다. (전체 이동)`,
        );
      }
    }

    return true;
  }

  // ✅ SPLIT 이동 대상 MAC 목록을 TEMP 테이블로 고정
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

  // ✅ 관련 테이블 이동: tmp_move_macs 기준으로 generator_name 변경
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
      "mac_delete_logs", // updated_at 제외
      "process_compare",
      "process_compare_log",
      "process_device_test",
      "process_device_test_log",
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
    // 1) start/end가 있는 경우
    //    - 랜덤 대응: 선택/전체 범위를 mac_decimal 기준으로 판단 & 이동
    // =========================
    if (hasRange) {
      // (A) 입력 MAC이 oldGen에 존재하는지 확인
      await ensureMacExistsInGen(oldGen, normStart);
      await ensureMacExistsInGen(oldGen, normEnd);

      // (B) 선택 범위 decimal
      const sDec = macToDecBigInt(normStart);
      const eDec = macToDecBigInt(normEnd);
      const selMinDecBI = sDec < eDec ? sDec : eDec;
      const selMaxDecBI = sDec < eDec ? eDec : sDec;

      // 48bit라 Number 변환 안전(2^53 미만)
      const selMinDec = Number(selMinDecBI);
      const selMaxDec = Number(selMaxDecBI);

      // (C) oldGen 전체 범위(랜덤 기준)
      const global = await getGlobalMacDecRange(oldGen);
      const isFullRange =
        selMinDec === global.minDec && selMaxDec === global.maxDec;

      // ✅ FULL RANGE: SPLIT 아님
      if (isFullRange) {
        // (1) generator_name 변경 없음 → META_ONLY_PGM
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

        // (2) generator_name 변경 있음 → RENAME
        if (await existsGeneratorName(newGen)) {
          await conn.rollback();
          return res.status(400).json({
            success: false,
            code: "GENERATOR_NAME_ALREADY_EXISTS",
            message: "이미 존재하는 생산명입니다. 다른 생산명을 입력해 주세요.",
          });
        }

        const currentMeta = await getCurrentMeta(oldGen);
        const metaChanged = isMetaChanged(currentMeta);

        const renameAffected = await renameGeneratorEverywhere(oldGen, newGen);

        // generator_name만 변경이면 메타 업데이트 금지
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
      // 2) FULL RANGE가 아니면 → SPLIT (랜덤 대응 핵심)
      // =========================
      if (oldGen === newGen) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "GENERATOR_NAME_REQUIRED_FOR_SPLIT",
          message:
            "start/end MAC 범위 분리 작업은 generator_name 변경이 필수입니다. generator_name을 변경한 후 다시 시도해 주세요.",
        });
      }

      if (await existsGeneratorName(newGen)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "GENERATOR_NAME_ALREADY_EXISTS",
          message: "이미 존재하는 생산명입니다. 다른 생산명을 입력해 주세요.",
        });
      }

      // prefix/suffix/all 규칙 유지 (필요 없으면 여기서 완화 가능)
      await validateSplitRangeByMacDec(oldGen, selMinDec, selMaxDec);

      const targetGen = newGen;
      const affected = {};

      // ✅ (1) 이동 대상 MAC 목록을 TEMP 테이블로 고정
      const movedMacRows = await buildTempMoveMacs(
        oldGen,
        selMinDec,
        selMaxDec,
      );
      if (movedMacRows <= 0) {
        throw new Error("이동 대상 MAC 목록이 비었습니다. (tmp_move_macs=0)");
      }

      // ✅ (2) process_generated_macs 이동 (tmp_move_macs 기준)
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

      // ✅ (3) 관련 테이블들도 동일 MAC 목록 기준으로 이동
      for (const table of TABLES_TO_MOVE) {
        affected[table] = await updateGeneratorNameByTmpMacs(
          table,
          oldGen,
          targetGen,
        );
      }

      // SPLIT 후 메타 정책(기존 유지): 양쪽 모두 메타 업데이트
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
    // 3) start/end 없는 경우 (기존 정책 유지)
    // =========================

    // old==new → process_generated_macs만 메타 업데이트
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

    // old!=new → RENAME (전체 테이블 generator_name 변경)
    if (noRange && oldGen !== newGen) {
      if (await existsGeneratorName(newGen)) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "GENERATOR_NAME_ALREADY_EXISTS",
          message: "이미 존재하는 생산명입니다. 다른 생산명을 입력해 주세요.",
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
      .json({ success: false, message: "요청 상태가 올바르지 않습니다." });
  } catch (err) {
    await conn.rollback();
    console.error("❌ generator_name 업데이트 실패:", err);
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
      message: "source_generator / target_generator는 필수입니다.",
    });
  }
  if (!sRaw || !eRaw) {
    return res.status(400).json({
      success: false,
      code: "REQUIRED",
      message: "serial_start / serial_end는 필수입니다.",
    });
  }
  if (oldGen === newGen) {
    return res.status(400).json({
      success: false,
      code: "SAME_NAME",
      message: "target_generator는 source_generator와 달라야 합니다.",
    });
  }

  // ---- 테이블 화이트리스트 (update와 동일)
  const TABLES_TO_MOVE = [
    "mac_delete_logs",
    "process_compare",
    "process_compare_log",
    "process_device_test",
    "process_device_test_log",
    "cartonbox_label_print_logs",
    "device_label_print_logs",
    "giftbox_label_print_logs",
  ];
  const ALL_TABLES_FOR_RENAME = ["process_generated_macs", ...TABLES_TO_MOVE];
  const ALLOWED_TABLES = new Set(ALL_TABLES_FOR_RENAME);

  function assertAllowedTable(table) {
    if (!ALLOWED_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
  }

  // ✅ serial 입력이 "ABS4-0000001" 같은 full 이든, "1" 같은 숫자만이든 처리
  // - full이면: prefix/width를 그대로 사용
  // - 숫자만이면: prefix는 source generator에서 대표 serial 1개를 읽어서 가져옴
  function parseSerialInput(v) {
    const s = String(v ?? "").trim();
    // full 형태: 끝에 숫자 덩어리
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
    // 숫자만 케이스
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
      message:
        "serial_start/serial_end 형식이 올바르지 않습니다. (예: ABS4-0000001 또는 1)",
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

  // ✅ source generator에서 대표 serial 1개를 가져와 prefix/width 확보
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

  // ✅ serial 숫자부 추출 (MariaDB) : 끝 숫자만 뽑아 UNSIGNED로 변환
  // - MariaDB 10.0+ REGEXP_SUBSTR 지원 (대부분 OK)
  const SERIAL_NUM_SQL = (col) =>
    `CAST(REGEXP_SUBSTR(${col}, '[0-9]+$') AS UNSIGNED)`;

  // ✅ SPLIT 이동 대상 MAC 목록을 TEMP 테이블로 고정 (update와 동일 패턴)
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

    // prefix가 있으면 LIKE로 좁히고, 숫자부 범위로 필터
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

    // ✅ target 이미 존재하면 SPLIT 불가 (기존 정책 유지)
    if (await existsGeneratorName(newGen)) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        code: "GENERATOR_NAME_ALREADY_EXISTS",
        message: "이미 존재하는 생산명입니다. 다른 생산명을 입력해 주세요.",
      });
    }

    // ✅ 숫자 범위 정규화
    const minN = Math.min(sParsed.num, eParsed.num);
    const maxN = Math.max(sParsed.num, eParsed.num);

    // ✅ prefix 결정
    // - 둘 다 full이면 prefix가 서로 달라지면 에러
    // - 하나라도 숫자만이면 source generator 샘플 serial에서 prefix를 가져옴
    let prefix = null;
    let width = null;

    if (sParsed.isFull && eParsed.isFull) {
      if (sParsed.prefix !== eParsed.prefix) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "PREFIX_MISMATCH",
          message: `serial_start/serial_end의 prefix가 다릅니다. (${sParsed.prefix} vs ${eParsed.prefix})`,
        });
      }
      prefix = sParsed.prefix;
      width = sParsed.width; // 참고용
    } else {
      const meta = await getSampleSerialMeta(oldGen);
      if (!meta) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          code: "NO_SERIAL_META",
          message: `source generator(${oldGen})에서 serial prefix 정보를 찾을 수 없습니다. full serial로 입력해 주세요.`,
        });
      }
      prefix = meta.prefix;
      width = meta.width;
    }

    // ✅ (1) 이동 대상 MAC 목록 생성
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
        message: `분리 불가: ${oldGen}에서 serial 숫자부 ${minN}~${maxN} 범위에 해당하는 데이터가 없습니다.`,
      });
    }

    // ✅ (2) 전체 이동 방지 (원하면 해제 가능)
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
        message:
          "분리 불가: 선택 범위가 전체를 포함합니다. (이 경우 rename/update로 처리하세요)",
      });
    }

    // ✅ (3) process_generated_macs 이동
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

    // ✅ (4) 관련 테이블들 이동 (전부 동일하게 generator_name 바꿈)
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
    console.error("❌ /api/generated/split 실패:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "서버 오류",
    });
  } finally {
    conn.release();
  }
});
/**
 * ✅ 숨김/보임
 */
router.post("/hide", async (req, res) => {
  const { generator_names } = req.body;
  if (!Array.isArray(generator_names) || generator_names.length === 0) {
    return res.json({
      success: false,
      message: "generator_names 값이 없습니다.",
    });
  }

  try {
    const sql = `UPDATE process_generated_macs SET is_hidden = 1 WHERE generator_name IN (?)`;
    await dataPool.query(sql, [generator_names]);
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ 숨기기 오류:", err);
    return res.json({ success: false, message: err.message });
  }
});

router.post("/show", async (req, res) => {
  const { generator_names } = req.body;
  if (!Array.isArray(generator_names) || generator_names.length === 0) {
    return res.json({
      success: false,
      message: "generator_names 값이 없습니다.",
    });
  }

  try {
    const sql = `UPDATE process_generated_macs SET is_hidden = 0 WHERE generator_name IN (?)`;
    await dataPool.query(sql, [generator_names]);
    return res.json({ success: true });
  } catch (err) {
    console.error("❌ 보이기 오류:", err);
    return res.json({ success: false, message: err.message });
  }
});

module.exports = router;
