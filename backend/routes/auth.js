// backend/routes/auth.js (세션 인증 적용)
const express = require("express");
const router = express.Router();
const { authPool } = require("../db");
const requireAuth = require("../middleware/auth");

// ✅ admin 전용 가드
function requireAdmin(req, res, next) {
  try {
    const user = req.session?.user;
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "로그인이 필요합니다" });
    }
    if (user.role !== "admin") {
      return res
        .status(403)
        .json({ success: false, message: "관리자만 접근할 수 있습니다" });
    }
    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: "권한 확인 실패" });
  }
}

/**
 * ─────────────────────────────────────────────────────────
 * 계정 관리 API (AccountManager 용)
 *  - GET    /api/auth/users                : 계정 리스트
 *  - POST   /api/auth/users                : 계정 생성
 *  - PATCH  /api/auth/users/:id/role       : 권한 변경
 *  - DELETE /api/auth/users/:id            : 계정 삭제
 * ─────────────────────────────────────────────────────────
 */

// ✅ 계정 리스트 (password는 절대 내려주지 않음)
router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await authPool.query(
      "SELECT id, name, role, is_active FROM users ORDER BY id ASC"
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("users 조회 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ✅ 계정 생성
router.post("/users", requireAuth, requireAdmin, async (req, res) => {
  const { id, name, password, role } = req.body;

  if (!id || !name || !password || !role) {
    return res.status(400).json({ success: false, message: "필수 항목 누락" });
  }
  if (role !== "admin" && role !== "operator") {
    return res.status(400).json({ success: false, message: "role 값 오류" });
  }

  try {
    const [existing] = await authPool.query(
      "SELECT id FROM users WHERE id = ? LIMIT 1",
      [id]
    );
    if (existing.length > 0) {
      return res.json({ success: false, message: "이미 존재하는 ID입니다" });
    }

    await authPool.query(
      "INSERT INTO users (id, name, password, role) VALUES (?, ?, ?, ?)",
      [id, name, password, role]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("계정 생성 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ✅ 권한 변경
router.patch("/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
  const targetId = req.params.id;
  const { role } = req.body;

  if (!targetId || !role) {
    return res.status(400).json({ success: false, message: "필수 항목 누락" });
  }
  if (role !== "admin" && role !== "operator") {
    return res.status(400).json({ success: false, message: "role 값 오류" });
  }

  try {
    const [r] = await authPool.query("UPDATE users SET role = ? WHERE id = ?", [
      role,
      targetId,
    ]);

    if (r.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "대상 계정을 찾을 수 없습니다" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("권한 변경 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ✅ 계정 삭제
router.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const targetId = req.params.id;

  if (!targetId) {
    return res.status(400).json({ success: false, message: "id 누락" });
  }

  try {
    // (선택) 자기 자신 삭제 방지
    if (req.session?.user?.id === targetId) {
      return res
        .status(400)
        .json({ success: false, message: "본인 계정은 삭제할 수 없습니다" });
    }

    // (선택) 마지막 admin 삭제 방지
    const [target] = await authPool.query(
      "SELECT role FROM users WHERE id = ? LIMIT 1",
      [targetId]
    );
    if (target.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "대상 계정을 찾을 수 없습니다" });
    }
    if (target[0].role === "admin") {
      const [admins] = await authPool.query(
        "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'"
      );
      const adminCnt = admins?.[0]?.cnt ?? 0;
      if (adminCnt <= 1) {
        return res
          .status(400)
          .json({
            success: false,
            message: "마지막 admin은 삭제할 수 없습니다",
          });
      }
    }

    const [r] = await authPool.query("DELETE FROM users WHERE id = ?", [
      targetId,
    ]);

    if (r.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "대상 계정을 찾을 수 없습니다" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("계정 삭제 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * ─────────────────────────────────────────────────────────
 * 기존 기능들
 * ─────────────────────────────────────────────────────────
 */

// 사용자 등록 (기존 /register 유지하되, ✅ admin 전용으로 강화 권장)
router.post("/register", requireAuth, async (req, res) => {
  const { name, id, password, role } = req.body;

  if (!name || !id || !password || !role) {
    return res.status(400).json({ success: false, message: "필수 항목 누락" });
  }

  try {
    const [existing] = await authPool.query(
      "SELECT * FROM users WHERE id = ?",
      [id]
    );
    if (existing.length > 0) {
      return res.json({ success: false, message: "이미 존재하는 ID입니다" });
    }

    await authPool.query(
      "INSERT INTO users (id, name, password, role) VALUES (?, ?, ?, ?)",
      [id, name, password, role]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("등록 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// 로그인 및 세션 저장
router.post("/login", async (req, res) => {
  const { id, password } = req.body;
  const ip = req.ip;

  try {
    const [users] = await authPool.query("SELECT * FROM users WHERE id = ?", [
      id,
    ]);
    const user = users[0];

    let success = false;
    if (user && user.password === password && user.is_active !== false) {
      success = true;
      req.session.user = {
        id: user.id,
        name: user.name,
        role: user.role,
      };
    }

    // 로그인 로그 기록
    await authPool.query(
      "INSERT INTO login_logs (user_id, success, ip_address) VALUES (?, ?, ?)",
      [id, success, ip]
    );

    if (success) {
      res.json({ success: true, role: user.role, name: user.name });
    } else {
      res.json({ success: false, message: "ID 또는 비밀번호가 틀렸습니다" });
    }
  } catch (err) {
    console.error("로그인 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// 세션 상태 확인
router.get("/check-session", (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// 로그아웃
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: "로그아웃 실패" });
    }
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// routes/auth.js
router.post("/auto_login", async (req, res) => {
  const { user_id } = req.body;

  // 🔒 실제로는 DB 확인 등 인증 로직 필요
  if (!user_id) {
    return res.status(400).json({ success: false, message: "user_id 누락됨" });
  }

  // ✅ 세션 생성
  req.session.user = {
    id: user_id,
    name: user_id,
    role: "user",
  };

  //console.log("✅ 자동 로그인 세션 생성:", req.session.user);
  res.json({ success: true });
});

module.exports = router;
