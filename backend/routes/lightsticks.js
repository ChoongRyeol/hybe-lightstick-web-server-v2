// routes/lightsticks.js
const express = require("express");
const router = express.Router();
const { catalogPool } = require("../db");
const { dataPool } = require("../db");
const requireAuth = require("../middleware/auth");

// ✅ 전체 조회 or Artist
router.get("/", async (req, res) => {
  const { artist } = req.query;

  try {
    let query = `
      SELECT 
        lightstick,
        artist,
        device_name, 
        model,         
        fw_version, 
        certification_info,
        created_at,
        updated_at
      FROM lightsticks
    `;
    const params = [];

    if (artist) {
      query += ` WHERE artist = ?`;
      params.push(artist);
    }

    query += ` ORDER BY updated_at DESC`;

    const [rows] = await catalogPool.query(query, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("lightsticks 조회 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ✅ 등록 (신규 응원봉)
router.post("/", requireAuth, async (req, res) => {
  const {
    lightstick,
    artist,
    certification_info,
    fw_version,
    device_name,
    model,
  } = req.body;

  if (!lightstick || !artist) {
    return res.status(400).json({ success: false, message: "필수 항목 누락" });
  }

  try {
    // 중복 체크 (lightstick + artist 기준)
    const [rows] = await catalogPool.query(
      "SELECT 1 FROM lightsticks WHERE lightstick = ? AND artist = ?",
      [lightstick, artist]
    );

    if (rows.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: "이미 등록된 응원봉입니다." });
    }

    await catalogPool.query(
      `
        INSERT INTO lightsticks (
          lightstick,
          artist,
          device_name,
          model,
          fw_version,
          certification_info,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, NOW(6), NOW(6))
      `,
      [
        lightstick,
        artist,
        device_name || "",
        model || "",
        fw_version || "",
        certification_info || "",
      ]
    );

    res.json({ success: true, message: "등록 완료" });
  } catch (err) {
    console.error("lightstick 등록 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ✅ 업데이트 (기존 응원봉 필드 수정)
router.put("/update", requireAuth, async (req, res) => {
  const { lightstick, certification_info, fw_version, device_name, model } =
    req.body;

  if (!lightstick) {
    return res.status(400).json({ success: false, message: "필수 항목 누락" });
  }

  try {
    const [rows] = await catalogPool.query(
      "SELECT 1 FROM lightsticks WHERE lightstick = ?",
      [lightstick]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "존재하지 않는 응원봉입니다." });
    }

    // catalog DB 업데이트
    await catalogPool.query(
      `
        UPDATE lightsticks
        SET 
          certification_info = ?,
          fw_version = ?,
          device_name = ?,
          model = ?,
          updated_at = NOW(6)
        WHERE lightstick = ?
      `,
      [
        certification_info || "",
        fw_version || "",
        device_name || "",
        model || "",
        lightstick,
      ]
    );

    // data DB 업데이트 (해당 응원봉으로 생성된 MAC 정보에도 반영)
    // 251118 - kohlrabi 반영안함
    /*
    await dataPool.query(
      `
        UPDATE process_generated_macs
        SET
          certification_info = ?,
          fw_version = ?,
          device_name = ?,
          model = ?
        WHERE lightstick = ?
      `,
      [
        certification_info || "",
        fw_version || "",
        device_name || "",
        model || "",
        lightstick,
      ]
    );*/

    res.json({ success: true, message: "수정 완료" });
  } catch (err) {
    console.error("응원봉 항목 수정 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ✅ 삭제
router.delete("/", requireAuth, async (req, res) => {
  const { lightstick, artist } = req.body;

  if (!lightstick || !artist) {
    return res
      .status(400)
      .json({ success: false, message: "lightstick 필수입니다" });
  }

  try {
    const [result] = await catalogPool.query(
      `DELETE FROM lightsticks WHERE lightstick = ? AND artist = ?`,
      [lightstick, artist]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "존재하지 않음" });
    }

    res.json({ success: true, message: "삭제 완료" });
  } catch (err) {
    console.error("lightstick 삭제 오류:", err);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

module.exports = router;
