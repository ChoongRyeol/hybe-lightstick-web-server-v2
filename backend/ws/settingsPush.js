// ws/settingsPush.js
const WebSocket = require("ws");
const { catalogPool } = require("../db");

let wss = null;

async function getLatestBleConfig() {
  const [rows] = await catalogPool.query(`
    SELECT rssi_min, created_at
    FROM ble_config
    ORDER BY id DESC
    LIMIT 1
  `);

  return (
    rows?.[0] ?? {
      rssi_min: -85,
      created_at: null,
    }
  );
}

async function getLatestCurrentConfig() {
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

  return (
    rows?.[0] ?? {
      low_current_min: 10,
      low_current_max: 30,

      high_current_min: 80,
      high_current_max: 200,

      created_at: null,
    }
  );
}

/**
 * ✅ noServer 방식: wss 인스턴스만 만들고,
 * upgrade 라우팅은 index.js에서 중앙 처리한다.
 */
function createSettingsWebSocket() {
  wss = new WebSocket.Server({ noServer: true });

  wss.on("connection", async (ws, req) => {
    console.log("📡 Settings WebSocket 클라이언트 접속");

    // ✅ 새로 연결된 클라이언트에게 최신 RSSI + Current 설정값 1회 전송
    try {
      const bleConfig = await getLatestBleConfig();
      const currentConfig = await getLatestCurrentConfig();

      ws.send(
        JSON.stringify({
          type: "settings_ble",
          data: bleConfig,
        }),
      );

      ws.send(
        JSON.stringify({
          type: "settings_current",
          data: currentConfig,
        }),
      );
    } catch (err) {
      console.error("❌ 초기 설정 전송 오류:", err);
    }

    ws.on("close", () => {
      console.log("🔌 Settings WebSocket 클라이언트 연결 종료");
    });
  });

  console.log("✅ Settings WebSocket (noServer) ready");
  return wss;
}

// ✅ BLE 설정 변경 시 전체 클라이언트에 push
function broadcastBleSettingsUpdate(config) {
  if (!wss) {
    console.warn(
      "⚠️ broadcastBleSettingsUpdate 호출됨 - WebSocket 서버가 아직 초기화되지 않음",
    );
    return;
  }

  const message = JSON.stringify({
    type: "settings_ble",
    data: config,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  console.log(
    `📢 BLE 설정 변경 Push: rssi_min=${config?.rssi_min}, created_at=${config?.created_at}`,
  );
}

// ✅ 소모전류 설정 변경 시 전체 클라이언트에 push
function broadcastCurrentSettingsUpdate(config) {
  if (!wss) {
    console.warn(
      "⚠️ broadcastCurrentSettingsUpdate 호출됨 - WebSocket 서버가 아직 초기화되지 않음",
    );
    return;
  }

  const message = JSON.stringify({
    type: "settings_current",
    data: config,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  console.log(
    `📢 Current 설정 변경 Push: ` +
      `LOW=${config?.low_current_min}~${config?.low_current_max}, ` +
      `HIGH=${config?.high_current_min}~${config?.high_current_max}, ` +
      `created_at=${config?.created_at}`,
  );
}

module.exports = {
  createSettingsWebSocket,
  broadcastBleSettingsUpdate,
  broadcastCurrentSettingsUpdate,
};
