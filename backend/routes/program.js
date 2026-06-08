// routes/program.js
const express = require("express");
const router = express.Router();
const { catalogPool } = require("../db");
const { broadcastProgramVersionUpdate } = require("../ws/programPush");

/**
 * ✅ 고정 프로그램 목록 (코드에 박기)
 */
const ALLOWED_PROGRAMS = new Set([
  "MacWriteToolV2",
  "FWMonitorTool",
  "LabelPrintToolV2",
  "MacCheckTool",
]);

/**
 * GET /api/program/version?program=MacWriteTool
 * 단일 프로그램 버전 조회
 */
router.get("/version", async (req, res) => {
  try {
    const { program } = req.query;

    if (!program) {
      return res
        .status(400)
        .json({ success: false, message: "program is required" });
    }

    if (!ALLOWED_PROGRAMS.has(program)) {
      return res.status(400).json({
        success: false,
        message: `invalid program. allowed=${Array.from(ALLOWED_PROGRAMS).join(",")}`,
      });
    }

    const [rows] = await catalogPool.query(
      `
      SELECT program_name, latest_version,
             is_force_update, release_note, download_url, updated_at
      FROM process_program_versions
      WHERE program_name = ?
      LIMIT 1
      `,
      [program],
    );

    if (rows.length === 0) {
      // ✅ DB에 없으면 404 (앱에서 "등록 안됨" 처리)
      return res
        .status(404)
        .json({ success: false, message: "not registered" });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error("[/api/program/version] error:", err);
    return res
      .status(500)
      .json({ success: false, message: "internal server error" });
  }
});

/**
 * GET /api/program/versions
 * 전체 프로그램 버전 목록
 */
router.get("/versions", async (req, res) => {
  try {
    const [rows] = await catalogPool.query(
      `
      SELECT program_name, latest_version,
             is_force_update, release_note, download_url, updated_at
      FROM process_program_versions
      ORDER BY program_name ASC
      `,
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[/api/program/versions] error:", err);
    return res
      .status(500)
      .json({ success: false, message: "internal server error" });
  }
});

/**
 * PUT /api/program/version
 * 프로그램 버전 등록/수정 (Upsert)
 * → 저장 성공 시 WebSocket 즉시 브로드캐스트
 *
 * ✅ 정책: 무조건 최신 사용 (min_required_version 제거)
 * latest_version: x.x.x.x
 */
router.put("/version", async (req, res) => {
  try {
    const {
      program_name,
      latest_version,
      is_force_update = 0,
      release_note = "",
      download_url = "",
    } = req.body;

    // ✅ 필수 체크
    if (!program_name || !latest_version) {
      return res.status(400).json({
        success: false,
        message: "program_name, latest_version are required",
      });
    }

    if (!ALLOWED_PROGRAMS.has(program_name)) {
      return res.status(400).json({
        success: false,
        message: `invalid program_name. allowed=${Array.from(ALLOWED_PROGRAMS).join(",")}`,
      });
    }

    // ✅ 버전 포맷: x.x.x.x
    const verOk = /^\d+\.\d+\.\d+$/.test(latest_version);
    if (!verOk) {
      return res.status(400).json({
        success: false,
        message: "latest_version must be x.x.x.x",
      });
    }

    // ✅ Upsert
    await catalogPool.query(
      `
      INSERT INTO process_program_versions
        (program_name, latest_version, is_force_update, release_note, download_url)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        latest_version = VALUES(latest_version),
        is_force_update = VALUES(is_force_update),
        release_note = VALUES(release_note),
        download_url = VALUES(download_url),
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        program_name,
        latest_version,
        is_force_update ? 1 : 0,
        release_note,
        download_url,
      ],
    );

    // ✅ DB에서 최신 row 다시 읽어서 updated_at 포함해서 push (클라이언트 표시용)
    const [rows] = await catalogPool.query(
      `
      SELECT program_name, latest_version,
             is_force_update, release_note, download_url, updated_at
      FROM process_program_versions
      WHERE program_name = ?
      LIMIT 1
      `,
      [program_name],
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("[/api/program/version PUT] error:", err);
    return res
      .status(500)
      .json({ success: false, message: "internal server error" });
  }
});
/**
 * POST /api/program/version/push
 * 수동 푸시 재전송 (DB 최신값 기준)
 * body: { program_name: "MacWriteTool" }
 */
router.post("/version/push", async (req, res) => {
  try {
    const { program_name } = req.body;

    if (!program_name) {
      return res
        .status(400)
        .json({ success: false, message: "program_name is required" });
    }

    if (!ALLOWED_PROGRAMS.has(program_name)) {
      return res.status(400).json({
        success: false,
        message: `invalid program_name. allowed=${Array.from(ALLOWED_PROGRAMS).join(",")}`,
      });
    }

    const [rows] = await catalogPool.query(
      `
      SELECT program_name, latest_version,
             is_force_update, release_note, download_url, updated_at
      FROM process_program_versions
      WHERE program_name = ?
      LIMIT 1
      `,
      [program_name],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "not registered" });
    }

    broadcastProgramVersionUpdate(rows[0]);

    return res.json({ success: true, message: "pushed", data: rows[0] });
  } catch (err) {
    console.error("[/api/program/version/push] error:", err);
    return res
      .status(500)
      .json({ success: false, message: "internal server error" });
  }
});

module.exports = router;
