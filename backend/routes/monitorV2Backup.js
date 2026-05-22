// backend/routes/monitorV2Backup.js
//Detail 화면에 대한 API만 정의 되어 있음
const express = require("express");
const router = express.Router();
const { replicaPool } = require("../db");

function safeInt(v, def) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : def;
}
function s(v) {
  return String(v ?? "").trim();
}
function has(v) {
  return s(v).length > 0;
}
function upper(v) {
  return s(v).toUpperCase();
}

function parseCommonQuery(req) {
  const page = Math.max(safeInt(req.query.page, 1), 1);
  const pageSize = Math.min(
    Math.max(safeInt(req.query.page_size, 100), 1),
    1000,
  );
  const offset = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    offset,
    from: s(req.query.from),
    to: s(req.query.to),

    // 공통(선택)
    generator_name: s(req.query.generator_name),
    artist: s(req.query.artist),
    lightstick: s(req.query.lightstick),
    serial: s(req.query.serial),
    mac: s(req.query.mac),
    model: s(req.query.model),
    device_name: s(req.query.device_name),
    user_name: s(req.query.user_name),

    // compare 전용
    observed_mac: s(req.query.observed_mac),

    // 공통 검색
    q: s(req.query.q),

    // result(PASS/FAIL/OTHER) : mac_write/compare만 사용
    result: s(req.query.result),

    // ✅ CARTONBOX 전용
    src: s(req.query.src), // LOG / EXCEPTION
    box_count: s(req.query.box_count), // 숫자
  };
}

/**
 * 공정 정의
 * - fromSql: FROM 절에 들어갈 SQL (테이블 또는 서브쿼리)
 * - dateCol: 기간/정렬 기준
 * - orderCols: DESC 정렬 컬럼들
 * - likeCols: q 검색 대상
 * - filterCols: 개별 필터를 적용할 수 있는 컬럼 존재 여부
 * - supportsResult: result 필터 적용 여부
 */
const PROC = {
  "mac-write": {
    fromSql: "process_device_test_log_backup t", // (오타 포함 실제 운영 테이블명)
    dateCol: "created_at",
    orderCols: ["created_at", "id"],
    likeCols: [
      "serial",
      "mac_address",
      "description",
      "device_name",
      "fw_version",
      "line",
    ],
    filterCols: {
      generator_name: true,
      artist: true,
      lightstick: true,
      serial: true,
      mac_address: true,
      model: false,
      device_name: true,
      user_name: false,
      observed_mac: false,
    },
    supportsResult: true,
  },

  compare: {
    fromSql: "process_compare_log_backup t",
    dateCol: "created_at",
    orderCols: ["created_at", "id"],
    likeCols: [
      "serial",
      "mac_address",
      "description",
      "device_name",
      "fw_version",
      "line",
    ],
    filterCols: {
      generator_name: true,
      artist: true,
      lightstick: true,
      serial: true,
      mac_address: true,
      model: false,
      device_name: true,
      user_name: false,
      observed_mac: false, // observed_mac 컬럼이 없다고 주셨음
    },
    supportsResult: true,
  },

  "device-print": {
    fromSql: "device_label_print_logs_backup t",
    dateCol: "printed_at",
    orderCols: ["printed_at", "id"],
    likeCols: [
      "generator_name",
      "artist",
      "lightstick",
      "serial",
      "mac_address",
      "certification_info",
      "model",
      "device_name",
      "user_name",
      "line",
    ],
    filterCols: {
      generator_name: true,
      artist: true,
      lightstick: true,
      serial: true,
      mac_address: true,
      model: true,
      device_name: true,
      user_name: true,
      observed_mac: false,
    },
    supportsResult: false,
  },

  "giftbox-print": {
    fromSql: "giftbox_label_print_logs_backup t",
    dateCol: "printed_at",
    orderCols: ["printed_at", "id"],
    likeCols: [
      "generator_name",
      "artist",
      "lightstick",
      "serial",
      "mac_address",
      "certification_info",
      "model",
      "device_name",
      "user_name",
      "line",
    ],
    filterCols: {
      generator_name: true,
      artist: true,
      lightstick: true,
      serial: true,
      mac_address: true,
      model: true,
      device_name: true,
      user_name: true,
      observed_mac: false,
    },
    supportsResult: false,
  },

  "cartonbox-print": {
    // ✅ 두 테이블 통합: src, description 포함
    // ✅ EXCEPTION 테이블은 created_at만 있으므로 created_at AS printed_at 로 통일
    fromSql: `
      (
        SELECT
          id, line, generator_name, mac_address, serial, artist, lightstick,
          model, factory_date, device_name, box_count, box_total_count,
          NULL AS description,
          printed_at,
          updated_at, user_id, user_name,
          'LOG' AS src
        FROM cartonbox_label_print_logs_backup
        UNION ALL
        SELECT
          id, line, generator_name, mac_address, serial, artist, lightstick,
          model, factory_date, device_name, box_count, box_total_count,
          description,
          created_at AS printed_at,
          updated_at, user_id, user_name,
          'EXCEPTION' AS src
        FROM cartonbox_label_print_exceptions_backup
      ) t
    `,
    dateCol: "printed_at",
    orderCols: ["printed_at", "src", "id"],
    likeCols: [
      "serial",
      "mac_address",
      "generator_name",
      "artist",
      "lightstick",
      "model",
      "device_name",
      "user_name",
      "description",
      "line",
    ],
    filterCols: {
      generator_name: true,
      artist: true,
      lightstick: true,
      serial: true,
      mac_address: true,
      model: true,
      device_name: true,
      user_name: true,
      observed_mac: false,
    },
    supportsResult: false,
  },
};

function buildOrderSql(def) {
  const parts = def.orderCols.map((c) => `t.${c} DESC`);
  return ` ORDER BY ${parts.join(", ")} `;
}

function buildResultWhere(def, q) {
  if (!def.supportsResult) return { sql: "", params: [] };

  const r = upper(q.result);
  if (r === "PASS" || r === "FAIL") {
    return { sql: " AND UPPER(COALESCE(t.result,'')) = ? ", params: [r] };
  }
  if (r === "OTHER") {
    return {
      sql: " AND UPPER(COALESCE(t.result,'')) NOT IN ('PASS','FAIL') ",
      params: [],
    };
  }
  return { sql: "", params: [] };
}

function buildLikeWhere(def, q) {
  if (!has(q.q)) return { sql: "", params: [] };
  const like = `%${q.q}%`;
  const cols = def.likeCols || [];
  if (cols.length === 0) return { sql: "", params: [] };
  const parts = cols.map((c) => `t.${c} LIKE ?`);
  return { sql: ` AND (${parts.join(" OR ")}) `, params: cols.map(() => like) };
}

function buildWhere(def, q) {
  const where = [];
  const params = [];

  // 기간
  if (has(q.from) && has(q.to)) {
    where.push(`t.${def.dateCol} BETWEEN ? AND ?`);
    params.push(q.from, q.to);
  } else if (has(q.from)) {
    where.push(`t.${def.dateCol} >= ?`);
    params.push(q.from);
  } else if (has(q.to)) {
    where.push(`t.${def.dateCol} <= ?`);
    params.push(q.to);
  }

  // generator_name
  if (def.filterCols.generator_name && has(q.generator_name)) {
    where.push(`t.generator_name = ?`);
    params.push(q.generator_name);
  }

  if (def.filterCols.artist && has(q.artist)) {
    where.push(`t.artist LIKE ?`);
    params.push(`%${q.artist}%`);
  }
  if (def.filterCols.lightstick && has(q.lightstick)) {
    where.push(`t.lightstick LIKE ?`);
    params.push(`%${q.lightstick}%`);
  }
  if (def.filterCols.serial && has(q.serial)) {
    where.push(`t.serial LIKE ?`);
    params.push(`%${q.serial}%`);
  }
  if (def.filterCols.mac_address && has(q.mac)) {
    where.push(`t.mac_address LIKE ?`);
    params.push(`%${q.mac}%`);
  }
  if (def.filterCols.model && has(q.model)) {
    where.push(`t.model LIKE ?`);
    params.push(`%${q.model}%`);
  }
  if (def.filterCols.device_name && has(q.device_name)) {
    where.push(`t.device_name LIKE ?`);
    params.push(`%${q.device_name}%`);
  }
  if (def.filterCols.user_name && has(q.user_name)) {
    where.push(`t.user_name LIKE ?`);
    params.push(`%${q.user_name}%`);
  }

  // ✅ CARTONBOX PRINT 전용 필터: src / box_count
  if (def === PROC["cartonbox-print"]) {
    if (has(q.src)) {
      where.push(`t.src = ?`);
      params.push(upper(q.src));
    }
    if (has(q.box_count)) {
      where.push(`t.box_count = ?`);
      params.push(Number(q.box_count));
    }
  }

  const baseWhereSql = where.length
    ? `WHERE ${where.join(" AND ")}`
    : "WHERE 1=1";
  const rw = buildResultWhere(def, q);

  return {
    whereSql: `${baseWhereSql} ${rw.sql}`,
    params: [...params, ...rw.params],
  };
}

async function handleList(req, res, key) {
  const def = PROC[key];
  if (!def)
    return res.status(404).json({ success: false, message: "unknown proc" });

  const q = parseCommonQuery(req);
  const { whereSql, params } = buildWhere(def, q);
  const lw = buildLikeWhere(def, q);

  const finalWhere = `${whereSql} ${lw.sql}`;
  const finalParams = [...params, ...lw.params];
  const orderSql = buildOrderSql(def);

  try {
    const [[{ total }]] = await replicaPool.query(
      `
      SELECT COUNT(*) AS total
      FROM ${def.fromSql}
      ${finalWhere}
      `,
      finalParams,
    );

    const [rows] = await replicaPool.query(
      `
      SELECT t.*
      FROM ${def.fromSql}
      ${finalWhere}
      ${orderSql}
      LIMIT ? OFFSET ?
      `,
      [...finalParams, q.pageSize, q.offset],
    );

    return res.json({
      success: true,
      data: rows,
      total,
      totalPages: Math.max(Math.ceil(total / q.pageSize), 1),
      page: q.page,
      page_size: q.pageSize,
    });
  } catch (e) {
    console.error("[monitorV2:list] error", key, e);
    return res.status(500).json({ success: false, message: "server error" });
  }
}

async function handleLocate(req, res, key) {
  const def = PROC[key];
  if (!def)
    return res.status(404).json({ success: false, message: "unknown proc" });

  const q = parseCommonQuery(req);
  if (!has(q.q)) return res.json({ success: true, index: -1, total: 0 });

  const { whereSql, params } = buildWhere(def, q);
  const lw = buildLikeWhere(def, q);

  const finalWhere = `${whereSql} ${lw.sql}`;
  const finalParams = [...params, ...lw.params];
  const orderSql = buildOrderSql(def);

  try {
    const [[{ total }]] = await replicaPool.query(
      `
      SELECT COUNT(*) AS total
      FROM ${def.fromSql}
      ${finalWhere}
      `,
      finalParams,
    );

    if (total <= 0) return res.json({ success: true, index: -1, total });

    const [firstRows] = await replicaPool.query(
      `
      SELECT t.*
      FROM ${def.fromSql}
      ${finalWhere}
      ${orderSql}
      LIMIT 1
      `,
      finalParams,
    );

    if (!firstRows || firstRows.length === 0) {
      return res.json({ success: true, index: -1, total });
    }

    return res.json({ success: true, index: 0, total, first: firstRows[0] });
  } catch (e) {
    console.error("[monitorV2:locate] error", key, e);
    return res.status(500).json({ success: false, message: "server error" });
  }
}

/** v2 라우트 */
router.get("/v2/mac-write", (req, res) => handleList(req, res, "mac-write"));
router.get("/v2/mac-write/locate", (req, res) =>
  handleLocate(req, res, "mac-write"),
);

router.get("/v2/compare", (req, res) => handleList(req, res, "compare"));
router.get("/v2/compare/locate", (req, res) =>
  handleLocate(req, res, "compare"),
);

router.get("/v2/device-print", (req, res) =>
  handleList(req, res, "device-print"),
);
router.get("/v2/device-print/locate", (req, res) =>
  handleLocate(req, res, "device-print"),
);

router.get("/v2/giftbox-print", (req, res) =>
  handleList(req, res, "giftbox-print"),
);
router.get("/v2/giftbox-print/locate", (req, res) =>
  handleLocate(req, res, "giftbox-print"),
);

router.get("/v2/cartonbox-print", (req, res) =>
  handleList(req, res, "cartonbox-print"),
);
router.get("/v2/cartonbox-print/locate", (req, res) =>
  handleLocate(req, res, "cartonbox-print"),
);

module.exports = router;
