// routes/backup.js
const express = require("express");
const router = express.Router();
const { replicaPool } = require("../db");

const dayjs = require("dayjs");

// =========================
// Helpers
// =========================
function formatFromTo(req) {
  const from = req.query.from
    ? dayjs(req.query.from).format("YYYY-MM-DD HH:mm:ss")
    : dayjs().startOf("day").format("YYYY-MM-DD HH:mm:ss");

  const to = req.query.to
    ? dayjs(req.query.to).format("YYYY-MM-DD HH:mm:ss")
    : dayjs().endOf("day").format("YYYY-MM-DD HH:mm:ss");

  return { from, to };
}

function toInt(v, def = 50, min = 1, max = 500) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function isMissingTableError(err) {
  return err?.code === "ER_NO_SUCH_TABLE" || err?.errno === 1146;
}

const missingReplicaTables = new Set();

async function safeReplicaRows(sql, params = [], label = "") {
  if (label && missingReplicaTables.has(label)) return [];

  try {
    const [rows] = await replicaPool.query(sql, params);
    return rows;
  } catch (err) {
    if (isMissingTableError(err)) {
      if (label) missingReplicaTables.add(label);
      return [];
    }
    throw err;
  }
}

async function safeReplicaFirst(sql, params = [], label = "") {
  const rows = await safeReplicaRows(sql, params, label);
  return rows[0] || {};
}

async function safeReplicaExecute(conn, sql, params = [], label = "") {
  if (label && missingReplicaTables.has(label)) return { affectedRows: 0 };

  try {
    const [result] = await conn.query(sql, params);
    return result;
  } catch (err) {
    if (isMissingTableError(err)) {
      if (label) missingReplicaTables.add(label);
      return { affectedRows: 0 };
    }
    throw err;
  }
}

async function getCartonboxCompletedMap(from, to) {
  const logs = await safeReplicaRows(
    `
    SELECT generator_name, COUNT(*) AS completed
    FROM cartonbox_label_print_logs_backup
    WHERE printed_at BETWEEN ? AND ?
    GROUP BY generator_name
    `,
    [from, to],
    "cartonbox_label_print_logs_backup",
  );

  const map = new Map();
  for (const r of logs) {
    map.set(r.generator_name, Number(r.completed || 0));
  }
  return map;
}

function mapByGenerator(rows, field = "completed") {
  const map = new Map();
  for (const r of rows) map.set(r.generator_name, Number(r[field] || 0));
  return map;
}

// =========================
// Type/Table mapping
// =========================
const TABLE_MAP = {
  mac_write: "process_device_test_log_backup",
  mac_check: "process_mac_check_log_backup",
  device_print: "device_label_print_logs_backup",
  giftbox_print: "giftbox_label_print_logs_backup",
  cartonbox_print_logs: "cartonbox_label_print_logs_backup",
  cartonbox_print_exceptions: "cartonbox_label_print_exceptions_backup",
};

const DATE_COL_MAP = {
  mac_write: "updated_at",
  mac_check: "updated_at",
  device_print: "updated_at", // 기존 코드가 updated_at 사용중이었음(printed_at면 변경 필요)
  giftbox_print: "updated_at",
  cartonbox_print_logs: "printed_at",
  cartonbox_print_exceptions: "created_at",
};

// =========================
// 1) ✅ generator_name 그룹별 공정 현황 요약 (N+1 제거)
// =========================
router.get("/status-summary", async (req, res) => {
  try {
    const { from, to } = formatFromTo(req);

    // =========================
    // 0) F/W Download 전체 요약
    // =========================
    const fwWaitingRow = await safeReplicaFirst(
      `
      SELECT COUNT(*) AS waiting
      FROM process_firmware_download_backup
      WHERE (generator_name IS NULL OR TRIM(generator_name) = '')
        AND updated_at BETWEEN ? AND ?
      `,
      [from, to],
      "process_firmware_download_backup",
    );

    const fwFailOverviewRow = await safeReplicaFirst(
      `
      SELECT COUNT(DISTINCT serial) AS fail
      FROM process_firmware_download_log_backup
      WHERE result = 'FAIL'
        AND created_at BETWEEN ? AND ?
        AND serial IS NOT NULL
      `,
      [from, to],
      "process_firmware_download_log_backup",
    );

    const fwOverview = {
      waiting: Number(fwWaitingRow?.waiting || 0),
      fail: Number(fwFailOverviewRow?.fail || 0),
    };

    // =========================
    // 1) generator 목록
    // =========================
    const generatedGenerators = await safeReplicaRows(
      `
      SELECT
        TRIM(generator_name) AS generator_name,
        COUNT(*) AS total,
        MAX(updated_at) AS last_updated
      FROM process_generated_macs_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
      GROUP BY TRIM(generator_name)
      `,
      [],
      "process_generated_macs_backup",
    );

    const firmwareGenerators = await safeReplicaRows(
      `
      SELECT
        TRIM(generator_name) AS generator_name,
        0 AS total,
        MAX(updated_at) AS last_updated
      FROM process_firmware_download_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
      GROUP BY TRIM(generator_name)
      `,
      [],
      "process_firmware_download_backup",
    );

    const generatorMap = new Map();
    for (const row of [...generatedGenerators, ...firmwareGenerators]) {
      const generatorName = String(row.generator_name || "").trim();
      if (!generatorName) continue;

      const prev = generatorMap.get(generatorName) || {
        generator_name: generatorName,
        total: 0,
        last_updated: null,
      };

      prev.total += Number(row.total || 0);
      if (
        row.last_updated &&
        (!prev.last_updated ||
          new Date(row.last_updated).getTime() >
            new Date(prev.last_updated).getTime())
      ) {
        prev.last_updated = row.last_updated;
      }
      generatorMap.set(generatorName, prev);
    }

    const generators = Array.from(generatorMap.values()).sort(
      (a, b) => new Date(b.last_updated || 0) - new Date(a.last_updated || 0),
    );

    const generatorNames = generators
      .map((g) => String(g.generator_name || "").trim())
      .filter(Boolean);

    if (!generatorNames.length) {
      return res.json({
        success: true,
        fw_overview: fwOverview,
        data: [],
      });
    }

    const inSql = generatorNames.map(() => "?").join(",");

    // =========================
    // 2) F/W DOWNLOAD
    // =========================
    const fwCompletedRows = await safeReplicaRows(
      `
      SELECT
        TRIM(generator_name) AS generator_name,
        COUNT(*) AS completed
      FROM process_firmware_download_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [from, to],
      "process_firmware_download_backup",
    );

    const fwFailRows = await safeReplicaRows(
      `
      SELECT
        TRIM(generator_name) AS generator_name,
        COUNT(DISTINCT serial) AS fail
      FROM process_firmware_download_log_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND created_at BETWEEN ? AND ?
        AND result = 'FAIL'
        AND serial IS NOT NULL
      GROUP BY TRIM(generator_name)
      `,
      [from, to],
      "process_firmware_download_log_backup",
    );

    // =========================
    // 3) MAC WRITE
    // =========================
    const mwCompletedRows = await safeReplicaRows(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(*) AS completed
      FROM process_device_test_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
      "process_device_test_backup",
    );

    const mwFailRows = await safeReplicaRows(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(DISTINCT serial) AS fail
      FROM process_device_test_log_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
        AND result = 'FAIL'
        AND serial IS NOT NULL
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
      "process_device_test_log_backup",
    );

    // =========================
    // 4) MAC CHECK
    // =========================
    const cpCompletedRows = await safeReplicaRows(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(*) AS completed
      FROM process_mac_check_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
      "process_mac_check_backup",
    );

    const cpFailRows = await safeReplicaRows(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(DISTINCT serial) AS fail
      FROM process_mac_check_log_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
        AND result = 'FAIL'
        AND serial IS NOT NULL
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
      "process_mac_check_log_backup",
    );

    // =========================
    // 5) LABEL PRINT
    // =========================
    const dpRows = await safeReplicaRows(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(*) AS completed
      FROM device_label_print_logs_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
      "device_label_print_logs_backup",
    );

    const gbRows = await safeReplicaRows(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(*) AS completed
      FROM giftbox_label_print_logs_backup
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
      "giftbox_label_print_logs_backup",
    );

    const cartonboxMap = await getCartonboxCompletedMap(from, to);

    // =========================
    // 6) Map 변환
    // =========================
    const fwCompletedMap = mapByGenerator(fwCompletedRows, "completed");
    const fwFailMap = mapByGenerator(fwFailRows, "fail");

    const mwCompletedMap = mapByGenerator(mwCompletedRows, "completed");
    const mwFailMap = mapByGenerator(mwFailRows, "fail");

    const cpCompletedMap = mapByGenerator(cpCompletedRows, "completed");
    const cpFailMap = mapByGenerator(cpFailRows, "fail");

    const dpMap = mapByGenerator(dpRows, "completed");
    const gbMap = mapByGenerator(gbRows, "completed");

    // =========================
    // 7) 응답 생성
    // =========================
    const results = generators.map((g) => {
      const generator_name = String(g.generator_name || "").trim();
      const total = Number(g.total || 0);

      const fwCompleted = fwCompletedMap.get(generator_name) || 0;
      const fwFail = fwFailMap.get(generator_name) || 0;

      const mwCompleted = mwCompletedMap.get(generator_name) || 0;
      const mwFail = mwFailMap.get(generator_name) || 0;

      const cpCompleted = cpCompletedMap.get(generator_name) || 0;
      const cpFail = cpFailMap.get(generator_name) || 0;

      const dpCompleted = dpMap.get(generator_name) || 0;
      const gbCompleted = gbMap.get(generator_name) || 0;
      const cbCompleted = cartonboxMap.get(generator_name) || 0;

      return {
        generator_name,
        total,

        firmware_download: {
          completed: fwCompleted,
          fail: fwFail,
          input: fwCompleted + fwFail,
        },

        mac_write: {
          completed: mwCompleted,
          fail: mwFail,
          input: mwCompleted + mwFail,
        },

        mac_check: {
          completed: cpCompleted,
          fail: cpFail,
          input: cpCompleted + cpFail,
        },

        device_print: { completed: dpCompleted },
        giftbox_print: { completed: gbCompleted },
        cartonbox_print: { completed: cbCompleted },

        range: { from, to },
      };
    });

    return res.json({
      success: true,
      fw_overview: fwOverview,
      data: results,
    });
  } catch (err) {
    console.error("현황 요약 오류:", err);
    return res.status(500).json({
      success: false,
      message: "서버 오류",
    });
  }
});
// =========================
// 2) daily-process (기능 유지 / 구조 정리)
// =========================
router.get("/daily-process", async (req, res) => {
  try {
    const { g: generator_name } = req.query;
    if (!generator_name) {
      return res
        .status(400)
        .json({ success: false, message: "generator_name 필수" });
    }

    const from = req.query.from
      ? dayjs(req.query.from).startOf("day").format("YYYY-MM-DD HH:mm:ss")
      : dayjs().startOf("day").format("YYYY-MM-DD HH:mm:ss");

    const to = req.query.to
      ? dayjs(req.query.to).endOf("day").format("YYYY-MM-DD HH:mm:ss")
      : dayjs().endOf("day").format("YYYY-MM-DD HH:mm:ss");

    // ✅ daily 집계는 DATE()가 들어가도 "GROUP BY 용"이라 어느정도 감수.
    // (단, WHERE에서 DATE(col) 쓰면 인덱스 죽으니 절대 금지)

    const [
      mwCompletedDaily,
      cpCompletedDaily,
      mwFailDaily,
      cpFailDaily,
      deviceDaily,
      giftboxDaily,
      cartonLogsDaily,
      cartonExpsDaily,

      // ✅ last_serial (날짜별 최종 시리얼)
      mwLastSerialDaily,
      cpLastSerialDaily,
      deviceLastSerialDaily,
      giftboxLastSerialDaily,
      cartonLastSerialDaily,
    ] = await Promise.all([
      // =======================
      // 1) completed/fail
      // =======================
      safeReplicaRows(
        `
        SELECT DATE(updated_at) AS d, COUNT(*) AS completed
        FROM process_device_test_backup
        WHERE generator_name = ? AND updated_at BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "process_device_test_backup",
      ),
      safeReplicaRows(
        `
        SELECT DATE(updated_at) AS d, COUNT(*) AS completed
        FROM process_mac_check_backup
        WHERE generator_name = ? AND updated_at BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "process_mac_check_backup",
      ),
      safeReplicaRows(
        `
        SELECT DATE(updated_at) AS d, COUNT(DISTINCT serial) AS fail
        FROM process_device_test_log_backup
        WHERE generator_name = ?
          AND updated_at BETWEEN ? AND ?
          AND result = 'FAIL'
          AND serial IS NOT NULL
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "process_device_test_log_backup",
      ),
      safeReplicaRows(
        `
        SELECT DATE(updated_at) AS d, COUNT(DISTINCT serial) AS fail
        FROM process_mac_check_log_backup
        WHERE generator_name = ?
          AND updated_at BETWEEN ? AND ?
          AND result = 'FAIL'
          AND serial IS NOT NULL
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "process_mac_check_log_backup",
      ),
      safeReplicaRows(
        `
        SELECT DATE(updated_at) AS d, COUNT(*) AS completed
        FROM device_label_print_logs_backup
        WHERE generator_name = ? AND updated_at BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "device_label_print_logs_backup",
      ),
      safeReplicaRows(
        `
        SELECT DATE(updated_at) AS d, COUNT(*) AS completed
        FROM giftbox_label_print_logs_backup
        WHERE generator_name = ? AND updated_at BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "giftbox_label_print_logs_backup",
      ),
      safeReplicaRows(
        `
        SELECT DATE(printed_at) AS d, COUNT(*) AS completed
        FROM cartonbox_label_print_logs_backup
        WHERE generator_name = ? AND printed_at BETWEEN ? AND ?
        GROUP BY DATE(printed_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "cartonbox_label_print_logs_backup",
      ),

      // ✅ 예외는 completed 아님 → exceptions로 별도
      safeReplicaRows(
        `
        SELECT DATE(created_at) AS d, COUNT(*) AS exceptions
        FROM cartonbox_label_print_exceptions_backup
        WHERE generator_name = ? AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "cartonbox_label_print_exceptions_backup",
      ),

      // =======================
      // 2) last_serial (날짜별 최종 시리얼)
      // =======================

      // mac_write last_serial
      safeReplicaRows(
        `
        SELECT d, serial AS last_serial
        FROM (
          SELECT
            DATE(updated_at) AS d,
            serial,
            ROW_NUMBER() OVER (
              PARTITION BY DATE(updated_at)
              ORDER BY updated_at DESC
            ) AS rn
          FROM process_device_test_backup
          WHERE generator_name = ?
            AND updated_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "process_device_test_backup",
      ),

      // mac_check last_serial
      safeReplicaRows(
        `
        SELECT d, serial AS last_serial
        FROM (
          SELECT
            DATE(updated_at) AS d,
            serial,
            ROW_NUMBER() OVER (
              PARTITION BY DATE(updated_at)
              ORDER BY updated_at DESC
            ) AS rn
          FROM process_mac_check_backup
          WHERE generator_name = ?
            AND updated_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "process_mac_check_backup",
      ),

      // device print last_serial
      safeReplicaRows(
        `
        SELECT d, serial AS last_serial
        FROM (
          SELECT
            DATE(updated_at) AS d,
            serial,
            ROW_NUMBER() OVER (
              PARTITION BY DATE(updated_at)
              ORDER BY updated_at DESC
            ) AS rn
          FROM device_label_print_logs_backup
          WHERE generator_name = ?
            AND updated_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "device_label_print_logs_backup",
      ),

      // giftbox print last_serial
      safeReplicaRows(
        `
        SELECT d, serial AS last_serial
        FROM (
          SELECT
            DATE(updated_at) AS d,
            serial,
            ROW_NUMBER() OVER (
              PARTITION BY DATE(updated_at)
              ORDER BY updated_at DESC
            ) AS rn
          FROM giftbox_label_print_logs_backup
          WHERE generator_name = ?
            AND updated_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "giftbox_label_print_logs_backup",
      ),

      // cartonbox print last_serial
      // ⚠️ cartonbox_label_print_logs_backup 테이블에 serial 컬럼이 있어야 함
      safeReplicaRows(
        `
        SELECT d, serial AS last_serial
        FROM (
          SELECT
            DATE(printed_at) AS d,
            serial,
            ROW_NUMBER() OVER (
              PARTITION BY DATE(printed_at)
              ORDER BY printed_at DESC
            ) AS rn
          FROM cartonbox_label_print_logs_backup
          WHERE generator_name = ?
            AND printed_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
        "cartonbox_label_print_logs_backup",
      ),
    ]);

    // ✅ mapByDate
    const mapByDate = {};
    const put = (d) =>
      (mapByDate[d] ||= {
        date: d,
        device_print: {
          cumulative: 0,
          input: 0,
          last_serial: "",
          completed: 0,
        },
        mac_write: {
          cumulative: 0,
          input: 0,
          fail: 0,
          last_serial: "",
          completed: 0,
        },
        mac_check: {
          cumulative: 0,
          input: 0,
          fail: 0,
          last_serial: "",
          completed: 0,
        },
        giftbox_print: {
          cumulative: 0,
          input: 0,
          last_serial: "",
          completed: 0,
        },
        cartonbox_print: {
          cumulative: 0,
          input: 0,
          last_serial: "",
          last_box_count: 0,
          last_box_total_count: 0,
          completed: 0,
          exceptions: 0,
        },
      });

    const mergeNumber = (rows, key, fld) => {
      rows.forEach((r) => {
        const d = dayjs(r.d).format("YYYY-MM-DD");
        const row = put(d);
        row[key][fld] = Number(r[fld] || 0);
      });
    };

    const mergeLastSerial = (rows, key) => {
      rows.forEach((r) => {
        const d = dayjs(r.d).format("YYYY-MM-DD");
        const row = put(d);
        row[key].last_serial = (r.last_serial || "").trim();
      });
    };

    // numbers
    mergeNumber(mwCompletedDaily, "mac_write", "completed");
    mergeNumber(mwFailDaily, "mac_write", "fail");
    mergeNumber(cpCompletedDaily, "mac_check", "completed");
    mergeNumber(cpFailDaily, "mac_check", "fail");
    mergeNumber(deviceDaily, "device_print", "completed");
    mergeNumber(giftboxDaily, "giftbox_print", "completed");

    // cartonbox completed/exceptions 분리
    cartonLogsDaily.forEach((r) => {
      const d = dayjs(r.d).format("YYYY-MM-DD");
      const row = put(d);
      row.cartonbox_print.completed = Number(r.completed || 0);
    });
    cartonExpsDaily.forEach((r) => {
      const d = dayjs(r.d).format("YYYY-MM-DD");
      const row = put(d);
      row.cartonbox_print.exceptions = Number(r.exceptions || 0);
    });

    // last_serial
    mergeLastSerial(mwLastSerialDaily, "mac_write");
    mergeLastSerial(cpLastSerialDaily, "mac_check");
    mergeLastSerial(deviceLastSerialDaily, "device_print");
    mergeLastSerial(giftboxLastSerialDaily, "giftbox_print");
    mergeLastSerial(cartonLastSerialDaily, "cartonbox_print");

    // input 계산 (현재 정책 유지)
    Object.values(mapByDate).forEach((row) => {
      row.mac_write.input = row.mac_write.completed || 0;
      row.mac_check.input = row.mac_check.completed || 0;

      row.device_print.input = row.device_print.completed || 0;
      row.giftbox_print.input = row.giftbox_print.completed || 0;
      row.cartonbox_print.input = row.cartonbox_print.completed || 0;
    });

    // 누적(cumulative) — completed만 누적
    const accumulate = (key) => {
      let sum = 0;
      Object.values(mapByDate)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .forEach((row) => {
          sum += Number(row[key].completed || 0);
          row[key].cumulative = sum;
        });
    };
    [
      "mac_write",
      "mac_check",
      "device_print",
      "giftbox_print",
      "cartonbox_print",
    ].forEach(accumulate);

    const data = Object.values(mapByDate).sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
    return res.json({ success: true, data });
  } catch (err) {
    console.error("daily-process 오류:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

router.get("/range-summary", async (req, res) => {
  const page = toInt(req.query.page, 0, 0, 1000000000);
  const limit = toInt(req.query.limit, 50, 1, 200);
  const offset = page * limit;

  try {
    const [countRows] = await replicaPool.query(`
      SELECT COUNT(DISTINCT generator_name) AS total
      FROM process_generated_macs_backup
    `);
    const totalCount = countRows[0]?.total ?? 0;

    const [pageGenerators] = await replicaPool.query(
      `
      SELECT generator_name, MAX(created_at) AS last_created_at
      FROM process_generated_macs_backup
      GROUP BY generator_name
      ORDER BY last_created_at DESC
      LIMIT ? OFFSET ?
      `,
      [limit, offset],
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
    const macDecSql = (expr) =>
      `CAST(CONV(REPLACE(${expr}, ':', ''), 16, 10) AS UNSIGNED)`;
    const serialNumSql = (expr) =>
      `CAST(REGEXP_SUBSTR(${expr}, '[0-9]+$') AS UNSIGNED)`;

    const [rows] = await replicaPool.query(
      `
      WITH mac_with_decimal AS (
        SELECT
          generator_name,
          mac_address,
          ${macDecSql("mac_address")} AS mac_decimal
        FROM process_generated_macs_backup
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
              THEN 'YES'
            ELSE 'NO'
          END AS is_continuous
        FROM mac_agg a
      ),
      serial_with_num AS (
        SELECT
          generator_name,
          serial,
          ${serialNumSql("serial")} AS serial_num
        FROM process_generated_macs_backup
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
        FROM process_generated_macs_backup t
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
      ORDER BY lm.created_at DESC
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
    console.error("[/api/backup/range-summary] error:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
      data: null,
      errorCode: 500,
    });
  }
});

router.post("/merge", async (req, res) => {
  const sourceGenerators = Array.isArray(req.body?.source_generators)
    ? [
        ...new Set(
          req.body.source_generators.map((v) => String(v || "").trim()),
        ),
      ].filter(Boolean)
    : [];
  const targetGenerator = String(req.body?.target_generator || "").trim();

  if (sourceGenerators.length < 2 || !targetGenerator) {
    return res.status(400).json({
      success: false,
      message: "source_generators and target_generator are required",
    });
  }

  if (sourceGenerators.includes(targetGenerator)) {
    return res.status(400).json({
      success: false,
      message: "target_generator must not be included in source_generators",
    });
  }

  const tables = [
    "process_generated_macs_backup",
    "process_firmware_download_backup",
    "process_firmware_download_log_backup",
    "process_device_test_backup",
    "process_device_test_log_backup",
    "process_mac_check_backup",
    "process_mac_check_log_backup",
    "device_label_print_logs_backup",
    "giftbox_label_print_logs_backup",
    "cartonbox_label_print_logs_backup",
    "cartonbox_label_print_exceptions_backup",
  ];

  let conn;
  try {
    conn = await replicaPool.getConnection();
    await conn.beginTransaction();

    const [metaRows] = await conn.query(
      `
      SELECT generator_name, MIN(artist) AS artist, MIN(lightstick) AS lightstick
      FROM process_generated_macs_backup
      WHERE generator_name IN (?)
      GROUP BY generator_name
      `,
      [sourceGenerators],
    );

    if (metaRows.length !== sourceGenerators.length) {
      await conn.rollback();
      return res.status(404).json({
        success: false,
        message: "some source generators were not found",
      });
    }

    const first = metaRows[0];
    const sameProduct = metaRows.every(
      (row) =>
        row.artist === first.artist && row.lightstick === first.lightstick,
    );

    if (!sameProduct) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        message: "only same artist/lightstick generators can be merged",
      });
    }

    const [targetRows] = await conn.query(
      `
      SELECT 1
      FROM process_generated_macs_backup
      WHERE generator_name = ?
      LIMIT 1
      `,
      [targetGenerator],
    );

    if (targetRows.length > 0) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        message: "target_generator already exists",
      });
    }

    const affectedRows = {};
    for (const table of tables) {
      const result = await safeReplicaExecute(
        conn,
        `
        UPDATE ${table}
        SET generator_name = ?
        WHERE generator_name IN (?)
        `,
        [targetGenerator, sourceGenerators],
        table,
      );
      affectedRows[table] = result?.affectedRows ?? 0;
    }

    await conn.commit();
    return res.json({
      success: true,
      target_generator: targetGenerator,
      source_generators: sourceGenerators,
      affectedRows,
    });
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("[/api/backup/merge] rollback error:", rollbackErr);
      }
    }
    console.error("[/api/backup/merge] error:", err);
    return res.status(500).json({
      success: false,
      message: "server error",
    });
  } finally {
    if (conn) conn.release();
  }
});
module.exports = router;
