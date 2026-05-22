// ws/programPush.js
const WebSocket = require("ws");
const { catalogPool } = require("../db");

let wssProgram = null;

function createProgramWebSocket() {
  wssProgram = new WebSocket.Server({ noServer: true });

  wssProgram.on("connection", async (ws, req) => {
    console.log("📡 Program WebSocket 클라이언트 접속:", req.url);

    const url = new URL(req.url, "http://localhost");
    const programName = (url.searchParams.get("program") || "").trim();

    ws.programName = programName || null;

    // ✅ 초기 전송(접속 직후 send) 제거: 버튼 눌렀을 때만 broadcast 한다.
    // 필요하면 아래처럼 'ready'만 알려주는 정도는 가능
    ws.send(
      JSON.stringify({
        type: "program_ws_ready",
        data: { program: ws.programName },
      }),
    );

    ws.on("close", () =>
      console.log("🔌 Program WebSocket 클라이언트 연결 종료"),
    );
  });

  console.log("✅ Program WebSocket(noServer) 준비 완료");
  return wssProgram;
}

function broadcastProgramVersionUpdate(info) {
  if (!wssProgram) return;

  const msg = JSON.stringify({ type: "program_version_updated", data: info });

  wssProgram.clients.forEach((c) => {
    if (c.readyState !== WebSocket.OPEN) return;
    if (!c.programName || c.programName === info.program_name) c.send(msg);
  });

  console.log(
    `📢 Program 업데이트 Push → ${info.program_name} v${info.latest_version}`,
  );
}

module.exports = {
  createProgramWebSocket,
  broadcastProgramVersionUpdate,
};
