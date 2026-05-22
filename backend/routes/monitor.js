// routes/monitor.js
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

async function getCartonboxCompletedMap(from, to) {
  const [logs] = await replicaPool.query(
    `
    SELECT generator_name, COUNT(*) AS completed
    FROM cartonbox_label_print_logs
    WHERE printed_at BETWEEN ? AND ?
    GROUP BY generator_name
    `,
    [from, to],
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
  mac_write: "process_device_test_log",
  compare: "process_compare_log",
  device_print: "device_label_print_logs",
  giftbox_print: "giftbox_label_print_logs",
  cartonbox_print_logs: "cartonbox_label_print_logs",
  cartonbox_print_exceptions: "cartonbox_label_print_exceptions",
};

const DATE_COL_MAP = {
  mac_write: "updated_at",
  compare: "updated_at",
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
    const [[fwWaitingRow]] = await replicaPool.query(
      `
      SELECT COUNT(*) AS waiting
      FROM process_firmware_download
      WHERE (generator_name IS NULL OR TRIM(generator_name) = '')
        AND updated_at BETWEEN ? AND ?
      `,
      [from, to],
    );

    const [[fwFailOverviewRow]] = await replicaPool.query(
      `
      SELECT COUNT(DISTINCT serial) AS fail
      FROM process_firmware_download_log
      WHERE result = 'FAIL'
        AND created_at BETWEEN ? AND ?
        AND serial IS NOT NULL
      `,
      [from, to],
    );

    const fwOverview = {
      waiting: Number(fwWaitingRow?.waiting || 0),
      fail: Number(fwFailOverviewRow?.fail || 0),
    };

    // =========================
    // 1) generator 목록
    // =========================
    const [generators] = await replicaPool.query(
      `
      SELECT
        generator_name,
        SUM(total) AS total,
        MAX(last_updated) AS last_updated
      FROM (
        SELECT
          TRIM(generator_name) AS generator_name,
          COUNT(*) AS total,
          MAX(updated_at) AS last_updated
        FROM process_generated_macs
        WHERE generator_name IS NOT NULL
          AND TRIM(generator_name) <> ''
        GROUP BY TRIM(generator_name)

        UNION ALL

        SELECT
          TRIM(generator_name) AS generator_name,
          0 AS total,
          MAX(updated_at) AS last_updated
        FROM process_firmware_download
        WHERE generator_name IS NOT NULL
          AND TRIM(generator_name) <> ''
        GROUP BY TRIM(generator_name)
      ) x
      GROUP BY generator_name
      ORDER BY last_updated DESC
      `,
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
    const [fwCompletedRows] = await replicaPool.query(
      `
      SELECT
        TRIM(generator_name) AS generator_name,
        COUNT(*) AS completed
      FROM process_firmware_download
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [from, to],
    );

    const [fwFailRows] = await replicaPool.query(
      `
      SELECT
        TRIM(generator_name) AS generator_name,
        COUNT(DISTINCT serial) AS fail
      FROM process_firmware_download_log
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND created_at BETWEEN ? AND ?
        AND result = 'FAIL'
        AND serial IS NOT NULL
      GROUP BY TRIM(generator_name)
      `,
      [from, to],
    );

    // =========================
    // 3) MAC WRITE
    // =========================
    const [mwCompletedRows] = await replicaPool.query(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(*) AS completed
      FROM process_device_test
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
    );

    const [mwFailRows] = await replicaPool.query(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(DISTINCT serial) AS fail
      FROM process_device_test_log
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
        AND result = 'FAIL'
        AND serial IS NOT NULL
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
    );

    // =========================
    // 4) COMPARE
    // =========================
    const [cpCompletedRows] = await replicaPool.query(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(*) AS completed
      FROM process_compare
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
    );

    const [cpFailRows] = await replicaPool.query(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(DISTINCT serial) AS fail
      FROM process_compare_log
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
        AND result = 'FAIL'
        AND serial IS NOT NULL
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
    );

    // =========================
    // 5) LABEL PRINT
    // =========================
    const [dpRows] = await replicaPool.query(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(*) AS completed
      FROM device_label_print_logs
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
    );

    const [gbRows] = await replicaPool.query(
      `
      SELECT TRIM(generator_name) AS generator_name, COUNT(*) AS completed
      FROM giftbox_label_print_logs
      WHERE generator_name IS NOT NULL
        AND TRIM(generator_name) <> ''
        AND TRIM(generator_name) IN (${inSql})
        AND updated_at BETWEEN ? AND ?
      GROUP BY TRIM(generator_name)
      `,
      [...generatorNames, from, to],
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

        compare: {
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
      [mwCompletedDaily],
      [cpCompletedDaily],
      [mwFailDaily],
      [cpFailDaily],
      [deviceDaily],
      [giftboxDaily],
      [cartonLogsDaily],
      [cartonExpsDaily],

      // ✅ last_serial (날짜별 최종 시리얼)
      [mwLastSerialDaily],
      [cpLastSerialDaily],
      [deviceLastSerialDaily],
      [giftboxLastSerialDaily],
      [cartonLastSerialDaily],
    ] = await Promise.all([
      // =======================
      // 1) completed/fail
      // =======================
      replicaPool.query(
        `
        SELECT DATE(updated_at) AS d, COUNT(*) AS completed
        FROM process_device_test
        WHERE generator_name = ? AND updated_at BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),
      replicaPool.query(
        `
        SELECT DATE(updated_at) AS d, COUNT(*) AS completed
        FROM process_compare
        WHERE generator_name = ? AND updated_at BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),
      replicaPool.query(
        `
        SELECT DATE(updated_at) AS d, COUNT(DISTINCT serial) AS fail
        FROM process_device_test_log
        WHERE generator_name = ?
          AND updated_at BETWEEN ? AND ?
          AND result = 'FAIL'
          AND serial IS NOT NULL
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),
      replicaPool.query(
        `
        SELECT DATE(updated_at) AS d, COUNT(DISTINCT serial) AS fail
        FROM process_compare_log
        WHERE generator_name = ?
          AND updated_at BETWEEN ? AND ?
          AND result = 'FAIL'
          AND serial IS NOT NULL
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),
      replicaPool.query(
        `
        SELECT DATE(updated_at) AS d, COUNT(*) AS completed
        FROM device_label_print_logs
        WHERE generator_name = ? AND updated_at BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),
      replicaPool.query(
        `
        SELECT DATE(updated_at) AS d, COUNT(*) AS completed
        FROM giftbox_label_print_logs
        WHERE generator_name = ? AND updated_at BETWEEN ? AND ?
        GROUP BY DATE(updated_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),
      replicaPool.query(
        `
        SELECT DATE(printed_at) AS d, COUNT(*) AS completed
        FROM cartonbox_label_print_logs
        WHERE generator_name = ? AND printed_at BETWEEN ? AND ?
        GROUP BY DATE(printed_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),

      // ✅ 예외는 completed 아님 → exceptions로 별도
      replicaPool.query(
        `
        SELECT DATE(created_at) AS d, COUNT(*) AS exceptions
        FROM cartonbox_label_print_exceptions
        WHERE generator_name = ? AND created_at BETWEEN ? AND ?
        GROUP BY DATE(created_at)
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),

      // =======================
      // 2) last_serial (날짜별 최종 시리얼)
      // =======================

      // mac_write last_serial
      replicaPool.query(
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
          FROM process_device_test
          WHERE generator_name = ?
            AND updated_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),

      // compare last_serial
      replicaPool.query(
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
          FROM process_compare
          WHERE generator_name = ?
            AND updated_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),

      // device print last_serial
      replicaPool.query(
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
          FROM device_label_print_logs
          WHERE generator_name = ?
            AND updated_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),

      // giftbox print last_serial
      replicaPool.query(
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
          FROM giftbox_label_print_logs
          WHERE generator_name = ?
            AND updated_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
      ),

      // cartonbox print last_serial
      // ⚠️ cartonbox_label_print_logs 테이블에 serial 컬럼이 있어야 함
      replicaPool.query(
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
          FROM cartonbox_label_print_logs
          WHERE generator_name = ?
            AND printed_at BETWEEN ? AND ?
            AND serial IS NOT NULL
            AND serial <> ''
        ) t
        WHERE rn = 1
        ORDER BY d ASC
        `,
        [generator_name, from, to],
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
        compare: {
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
    mergeNumber(cpCompletedDaily, "compare", "completed");
    mergeNumber(cpFailDaily, "compare", "fail");
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
    mergeLastSerial(cpLastSerialDaily, "compare");
    mergeLastSerial(deviceLastSerialDaily, "device_print");
    mergeLastSerial(giftboxLastSerialDaily, "giftbox_print");
    mergeLastSerial(cartonLastSerialDaily, "cartonbox_print");

    // input 계산 (현재 정책 유지)
    Object.values(mapByDate).forEach((row) => {
      row.mac_write.input = row.mac_write.completed || 0;
      row.compare.input = row.compare.completed || 0;

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
      "compare",
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
module.exports = router;
