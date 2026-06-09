// routes/settings.js
const express = require("express");
const router = express.Router();
const { catalogPool } = require("../db");
const requireAuth = require("../middleware/auth");
const {
  broadcastBleSettingsUpdate,
  broadcastCurrentSettingsUpdate,
} = require("../ws/settingsPush");

async function ensureSettingsTables() {
  await catalogPool.query(`
    CREATE TABLE IF NOT EXISTS ble_config (
      id int(11) NOT NULL AUTO_INCREMENT,
      rssi_min int(11) NOT NULL DEFAULT -85,
      created_at timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await catalogPool.query(`
    CREATE TABLE IF NOT EXISTS current_config (
      id int(11) NOT NULL AUTO_INCREMENT,
      created_at datetime NOT NULL DEFAULT current_timestamp(),
      low_current_min decimal(10,3) NOT NULL DEFAULT 10.000,
      low_current_max decimal(10,3) NOT NULL DEFAULT 30.000,
      high_current_min decimal(10,3) NOT NULL DEFAULT 80.000,
      high_current_max decimal(10,3) NOT NULL DEFAULT 200.000,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
  `);
}

// ✅ RSSI 설정 조회
router.get("/ble", requireAuth, async (req, res) => {
  try {
    await ensureSettingsTables();

    const [rows] = await catalogPool.query(
      `
      SELECT rssi_min, created_at
      FROM ble_config
      ORDER BY id DESC
      LIMIT 1
      `,
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          rssi_min: -85,
          created_at: null,
        },
      });
    }

    const row = rows[0];

    res.json({
      success: true,
      data: {
        rssi_min: row.rssi_min,
        created_at: row.created_at,
      },
    });
  } catch (err) {
    console.error("❌ BLE 설정 조회 오류:", err);
    res.status(500).json({
      success: false,
      message: "BLE 설정 조회 중 오류 발생",
    });
  }
});

// ✅ RSSI 설정 추가 + WebSocket으로 전체 PC에 push
router.post("/ble", requireAuth, async (req, res) => {
  const { rssi_min } = req.body;

  if (typeof rssi_min !== "number" || !Number.isFinite(rssi_min)) {
    return res.status(400).json({
      success: false,
      message: "rssi_min 값이 유효하지 않습니다.",
    });
  }

  try {
    // ✅ INSERT ONLY
    await ensureSettingsTables();

    await catalogPool.query(
      `
      INSERT INTO ble_config (rssi_min)
      VALUES (?)
      `,
      [rssi_min],
    );

    // ✅ 방금 INSERT한 값 = 최신값
    const [rows] = await catalogPool.query(
      `
      SELECT rssi_min, created_at
      FROM ble_config
      ORDER BY id DESC
      LIMIT 1
      `,
    );

    const latest = rows[0];

    // ✅ WebSocket 전체 Push
    broadcastBleSettingsUpdate({
      rssi_min: latest.rssi_min,
      created_at: latest.created_at,
    });

    res.json({
      success: true,
      message: "BLE RSSI 설정 등록 완료",
    });
  } catch (err) {
    console.error("❌ BLE 설정 INSERT 오류:", err);
    res.status(500).json({
      success: false,
      message: "BLE 설정 등록 중 오류 발생",
    });
  }
});

// ✅ 소모전류 설정 조회
router.get("/current", requireAuth, async (req, res) => {
  try {
    await ensureSettingsTables();

    const [rows] = await catalogPool.query(`
      SELECT
        low_current_min,
        low_current_max,
        high_current_min,
        high_current_max,
        created_at
      FROM current_config
      ORDER BY id DESC
      LIMIT 1
    `);

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: {
          low_current_min: 10,
          low_current_max: 30,
          high_current_min: 80,
          high_current_max: 200,
          updated_at: null,
        },
      });
    }

    const row = rows[0];

    res.json({
      success: true,
      data: {
        low_current_min: row.low_current_min,
        low_current_max: row.low_current_max,
        high_current_min: row.high_current_min,
        high_current_max: row.high_current_max,
        updated_at: row.created_at,
      },
    });
  } catch (err) {
    console.error("❌ Current 설정 조회 오류:", err);

    res.status(500).json({
      success: false,
      message: "Current 설정 조회 중 오류 발생",
    });
  }
});

// ✅ 소모전류 설정 저장
router.post("/current", requireAuth, async (req, res) => {
  const {
    low_current_min,
    low_current_max,
    high_current_min,
    high_current_max,
  } = req.body;

  if (
    typeof low_current_min !== "number" ||
    !Number.isFinite(low_current_min)
  ) {
    return res.status(400).json({
      success: false,
      message: "low_current_min 값이 유효하지 않습니다.",
    });
  }

  if (
    typeof low_current_max !== "number" ||
    !Number.isFinite(low_current_max)
  ) {
    return res.status(400).json({
      success: false,
      message: "low_current_max 값이 유효하지 않습니다.",
    });
  }

  if (
    typeof high_current_min !== "number" ||
    !Number.isFinite(high_current_min)
  ) {
    return res.status(400).json({
      success: false,
      message: "high_current_min 값이 유효하지 않습니다.",
    });
  }

  if (
    typeof high_current_max !== "number" ||
    !Number.isFinite(high_current_max)
  ) {
    return res.status(400).json({
      success: false,
      message: "high_current_max 값이 유효하지 않습니다.",
    });
  }

  if (low_current_min > low_current_max) {
    return res.status(400).json({
      success: false,
      message: "저휘도 최소값은 최대값보다 클 수 없습니다.",
    });
  }

  if (high_current_min > high_current_max) {
    return res.status(400).json({
      success: false,
      message: "고휘도 최소값은 최대값보다 클 수 없습니다.",
    });
  }

  try {
    await ensureSettingsTables();

    await catalogPool.query(
      `
      INSERT INTO current_config (
        low_current_min,
        low_current_max,
        high_current_min,
        high_current_max
      )
      VALUES (?, ?, ?, ?)
      `,
      [low_current_min, low_current_max, high_current_min, high_current_max],
    );

    const [rows] = await catalogPool.query(`
      SELECT
        low_current_min,
        low_current_max,
        high_current_min,
        high_current_max,
        created_at
      FROM current_config
      ORDER BY id DESC
      LIMIT 1
    `);

    const latest = rows[0];

    broadcastCurrentSettingsUpdate({
      low_current_min: latest.low_current_min,
      low_current_max: latest.low_current_max,
      high_current_min: latest.high_current_min,
      high_current_max: latest.high_current_max,
      created_at: latest.created_at,
    });

    res.json({
      success: true,
      message: "소모전류 설정 저장 완료",
    });
  } catch (err) {
    console.error("❌ Current 설정 저장 오류:", err);

    res.status(500).json({
      success: false,
      message: "소모전류 설정 저장 중 오류 발생",
    });
  }
});
// ✅ 소모전류 설정 저장

module.exports = router;
