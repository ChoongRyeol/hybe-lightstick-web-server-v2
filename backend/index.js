// index.js
const express = require("express");
const session = require("express-session");
const RedisStore = require("connect-redis")(session); // connect-redis@6.x
const { createClient } = require("redis");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const os = require("os");
const cron = require("node-cron");
const fs = require("fs");
const dotenv = require("dotenv");
const http = require("http");

const artistsRoutes = require("./routes/artists");
const lightsticksRoutes = require("./routes/lightsticks");
const printRoutes = require("./routes/print");
const authRoutes = require("./routes/auth");
const writeRoutes = require("./routes/write");
const generateRoutes = require("./routes/generate");
const compareRoutes = require("./routes/compare");
const processStatusRoutes = require("./routes/processStatus");
const monitorRoutes = require("./routes/monitor");
const monitorV2Routes = require("./routes/monitorV2");
const iniReader = require("./routes/iniReader");
const settingsRoutes = require("./routes/settings");
const programRoutes = require("./routes/program");
const backupRoutes = require("./routes/backup");
const monitorV2BackupRoutes = require("./routes/monitorV2Backup");
const exportRoutes = require("./routes/export");
const firmwareDownloadRoutes = require("./routes/processFirmwareDownload");
const processDeviceRoutes = require("./routes/processDevice");

const backupAndCleanLoginLogs = require("./backup/backupLoginLogs");
const backupMacDeleteLogs = require("./backup/backupMacDeleteLogs");

const { createSettingsWebSocket } = require("./ws/settingsPush");
const { createProgramWebSocket } = require("./ws/programPush");

const wssSettings = createSettingsWebSocket();
const wssProgram = createProgramWebSocket();

dotenv.config({ path: path.join(__dirname, "./.env") });

const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === "production";

function getLocalIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "0.0.0.0";
}

// ✅ 전체 비동기 실행 (즉시 실행 함수)
(async () => {
  const app = express();

  // -----------------------------
  // 1. 공통 미들웨어
  // -----------------------------
  app.use(bodyParser.json({ limit: "20mb" }));
  app.use(bodyParser.urlencoded({ limit: "20mb", extended: true }));
  const apiTiming = require("./middleware/apiTiming");
  app.use(apiTiming);

  // 🔐 Redis 세션 설정
  const redisClient = createClient({
    socket: {
      host: "127.0.0.1",
      port: 6379,
    },
    database: Number(process.env.REDIS_DB || 1), // 신규만 DB 1
    legacyMode: true,
  });

  try {
    await redisClient.connect();
    console.log("✅ Redis 연결 성공");
  } catch (err) {
    console.error("❌ Redis 연결 실패:", err);
    process.exit(1);
  }

  // 🔒 Redis Lock 전용 클라이언트
  const redisLockClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
    },
    database: Number(process.env.REDIS_LOCK_DB || 2),
  });

  try {
    await redisLockClient.connect();
    console.log("✅ Redis Lock 연결 성공");
  } catch (err) {
    console.error("❌ Redis Lock 연결 실패:", err);
    process.exit(1);
  }

  // 라우터에서 사용 가능하게 등록
  app.locals.redisLockClient = redisLockClient;

  app.use(
    session({
      name: "lightstick_v2_sid",
      store: new RedisStore({
        client: redisClient,
        ttl: 60 * 60 * 24 * 365 * 100,
      }),
      secret: process.env.SESSION_SECRET || "lightstick-v2",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 100,
        secure: false,
        httpOnly: true,
      },
    }),
  );
  // 🌐 CORS
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );

  // -----------------------------
  // 2. API 라우터 등록
  // -----------------------------
  app.use("/api/artists", artistsRoutes);
  app.use("/api/lightsticks", lightsticksRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/print", printRoutes);
  app.use("/api/write", writeRoutes);
  app.use("/api/generated", generateRoutes);
  app.use("/api/compare", compareRoutes);
  app.use("/api/process-status", processStatusRoutes);
  app.use("/api/monitor", monitorRoutes);
  app.use("/api/monitor", monitorV2Routes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/program", programRoutes);
  app.use("/api/backup", backupRoutes);
  app.use("/api/backup/monitor", monitorV2BackupRoutes);
  app.use("/api/export", exportRoutes);
  app.use("/api", iniReader);
  app.use("/api/firmware-download", firmwareDownloadRoutes);
  app.use("/api/process-device", processDeviceRoutes);
  // ✅ updates는 SPA보다 먼저 + fallthrough 차단
  app.use(
    "/updates",
    express.static("D:\\Lightstick\\MP_Tool\\LigthstickUpdates", {
      fallthrough: false, // 파일 없으면 다음으로 넘기지 말고 404
      index: false, // 디렉토리 index 서빙 방지
      // setHeaders: (res, filePath) => {
      //   // 필요 시 exe에 대해 강제 헤더 (보통은 없어도 됨)
      //   // if (filePath.toLowerCase().endsWith(".exe")) {
      //   //   res.setHeader("Content-Type", "application/octet-stream");
      //   // }
      // },
    }),
  );

  // -----------------------------
  // 3. 정적 파일 (프론트엔드 빌드) 서빙
  // -----------------------------
  if (isProduction) {
    const staticPath = path.join(__dirname, "../frontend/build");
    app.use(express.static(staticPath));

    // ✅ api, updates 제외한 모든 경로만 React SPA로
    app.get(/^\/(?!api|updates).*/, (req, res) => {
      res.sendFile(path.join(staticPath, "index.html"));
    });
  }

  console.log("✅ NODE_ENV =", process.env.NODE_ENV);

  // -----------------------------
  // 4. HTTP 서버 + WebSocket 초기화
  // -----------------------------
  const server = http.createServer(app);

  // ✅ noServer WebSocket 라우팅 (중앙 Upgrade 처리)
  server.on("upgrade", (req, socket, head) => {
    console.log("[UPGRADE]", req.url);

    try {
      const { pathname } = new URL(req.url, "http://localhost");

      if (pathname === "/ws/settings") {
        if (!wssSettings) return socket.destroy();
        wssSettings.handleUpgrade(req, socket, head, (ws) => {
          wssSettings.emit("connection", ws, req);
        });
        return;
      }

      if (pathname === "/ws/program") {
        if (!wssProgram) return socket.destroy();
        wssProgram.handleUpgrade(req, socket, head, (ws) => {
          wssProgram.emit("connection", ws, req);
        });
        return;
      }

      socket.destroy();
    } catch (e) {
      console.error("[UPGRADE] ERROR:", e);
      socket.destroy();
    }
  });
  const localIP = getLocalIPAddress();

  // -----------------------------
  // 서버 리스닝
  // -----------------------------
  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `✅ Light Stick V2 서버가 http://${localIP}:${PORT} 에서 실행 중`,
    );
  });

  // 여기서 zkClient.connect()를 호출하는 구조라면,
  // zk.js 내부에서 이미 connect()를 호출하는지 확인하고
  // 중복 호출되지 않도록 주의.
  // (이미 잘 동작 중이면 건드릴 필요 없음)

  // -----------------------------
  // 6. (선택) 배치 작업 - 로그인 로그/삭제 로그 백업
  // -----------------------------
  // cron.schedule(
  //   "0 2 * * *",
  //   async () => {
  //     await backupAndCleanLoginLogs();
  //     await backupMacDeleteLogs();
  //   },
  //   {
  //     timezone: "Asia/Seoul",
  //   }
  // );

  // -----------------------------
  // 7. 종료 시 정리 (선택)
  // -----------------------------
  const gracefulShutdown = async () => {
    console.log("🛑 서버 종료 시도 중...");

    try {
      await redisClient.quit();
      console.log("✅ Redis 연결 종료");
    } catch (err) {
      console.error("⚠️ Redis 종료 오류:", err);
    }

    server.close(() => {
      console.log("✅ HTTP 서버 종료 완료");
      process.exit(0);
    });
  };

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
})();
