const express = require("express");
const router = express.Router();
const { catalogPool } = require("../db");
const requireAuth = require("../middleware/auth");

// ✅ 전체 목록 조회
router.get("/", async (req, res) => {
  try {
    const [rows] = await catalogPool.query(
      `SELECT artist, created_at, updated_at FROM artists ORDER BY updated_at DESC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("artist 목록 조회 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ✅ 등록 또는 업데이트 (upsert 방식)
router.post("/", requireAuth, async (req, res) => {
  const { artist } = req.body;

  if (!artist) {
    return res
      .status(400)
      .json({ success: false, message: "artist 필수 입력" });
  }

  try {
    await catalogPool.query(
      `INSERT INTO artists (artist, created_at, updated_at)
       VALUES (?, NOW(6), NOW(6))
       ON DUPLICATE KEY UPDATE updated_at = NOW(6)`,
      [artist]
    );

    res.json({ success: true, message: "등록 또는 업데이트 완료" });
  } catch (err) {
    console.error("artist 등록/업데이트 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ✅ 삭제
router.delete("/", requireAuth, async (req, res) => {
  const { artist } = req.body;

  if (!artist) {
    return res
      .status(400)
      .json({ success: false, message: "artist 필수 입력" });
  }

  try {
    const [result] = await catalogPool.query(
      `DELETE FROM artists WHERE artist = ?`,
      [artist]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "존재하지 않는 artist" });
    }

    res.json({ success: true, message: "삭제 완료" });
  } catch (err) {
    console.error("artist 삭제 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

module.exports = router;
