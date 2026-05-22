const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const { replicaPool } = require("../db");
const requireAuth = require("../middleware/auth");

const EXPORT_DIR = path.join(__dirname, "..", "exports");
const MAX_EXPORT_RANGE = 100000;

if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function sanitizeFileName(name) {
  return String(name || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";

  const str = String(value);

  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function parseSerialInfo(serial) {
  const value = String(serial || "").trim();
  const match = value.match(/^(.*?)(\d+)$/);

  if (!match) return null;

  return {
    raw: value,
    prefix: match[1],
    number: Number(match[2]),
  };
}

function makeExportFileName(serialStart, serialEnd) {
  const start = sanitizeFileName(serialStart);
  const end = sanitizeFileName(serialEnd);

  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  return `${start}_${end}_${yyyy}${mm}${dd}_${hh}${mi}${ss}.csv`;
}

function scheduleDelete(filePath, delayMs = 60000) {
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("❌ export 파일 삭제 실패:", err.message);
      } else {
        console.log("🗑 export 파일 삭제:", filePath);
      }
    });
  }, delayMs);
}

/**
 * CSV 생성
 */
router.post("/create", requireAuth, async (req, res) => {
  let writeStream = null;
  let filePath = "";

  try {
    const { generator_name, serial_start, serial_end } = req.body;

    const generatorName = String(generator_name || "").trim();
    const serialStart = String(serial_start || "").trim();
    const serialEnd = String(serial_end || "").trim();

    if (!generatorName || !serialStart || !serialEnd) {
      return res.status(400).json({
        success: false,
        message: "generator_name, serial_start, serial_end 필요",
      });
    }

    const startInfo = parseSerialInfo(serialStart);
    const endInfo = parseSerialInfo(serialEnd);

    if (!startInfo || !endInfo) {
      return res.status(400).json({
        success: false,
        message: "시리얼 형식 오류",
      });
    }

    if (startInfo.prefix !== endInfo.prefix) {
      return res.status(400).json({
        success: false,
        message: "시리얼 prefix 불일치",
      });
    }

    if (endInfo.number < startInfo.number) {
      return res.status(400).json({
        success: false,
        message: "시리얼 범위 오류",
      });
    }

    const rangeCount = endInfo.number - startInfo.number + 1;

    if (rangeCount > MAX_EXPORT_RANGE) {
      return res.status(400).json({
        success: false,
        message: `CSV Export 최대 ${MAX_EXPORT_RANGE.toLocaleString()}건`,
      });
    }

    const fileName = makeExportFileName(serialStart, serialEnd);
    filePath = path.join(EXPORT_DIR, fileName);

    const sql = `
      SELECT
        generator_name,
        artist,
        serial,
        mac_address,
        created_at
      FROM process_generated_macs
      WHERE generator_name = ?
        AND serial >= ?
        AND serial <= ?
      ORDER BY serial
    `;

    const [rows] = await replicaPool.query(sql, [
      generatorName,
      serialStart,
      serialEnd,
    ]);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "데이터 없음",
      });
    }

    writeStream = fs.createWriteStream(filePath, { encoding: "utf8" });

    writeStream.write(
      "\uFEFFgenerator_name,artist,serial,mac_address,created_at\n",
    );

    for (const row of rows) {
      const line = [
        escapeCsvValue(row.generator_name),
        escapeCsvValue(row.artist),
        escapeCsvValue(row.serial),
        escapeCsvValue(row.mac_address),
        escapeCsvValue(row.created_at),
      ].join(",");

      writeStream.write(line + "\n");
    }

    writeStream.end();

    writeStream.on("finish", () => {
      res.json({
        success: true,
        message: `CSV 생성 완료 (${rows.length}건)`,
        downloadUrl: `/api/export/download/${encodeURIComponent(fileName)}`,
      });
    });

    writeStream.on("error", (err) => {
      console.error("CSV write error:", err);
      if (filePath && fs.existsSync(filePath)) fs.unlink(filePath, () => {});
      res.status(500).json({ success: false, message: "CSV 생성 실패" });
    });
  } catch (err) {
    console.error("export/create error:", err);

    if (writeStream) writeStream.destroy();
    if (filePath && fs.existsSync(filePath)) fs.unlink(filePath, () => {});

    res.status(500).json({
      success: false,
      message: "서버 오류",
    });
  }
});

/**
 * CSV 다운로드
 */
router.get("/download/:fileName", requireAuth, async (req, res) => {
  try {
    const fileName = req.params.fileName;
    const filePath = path.join(EXPORT_DIR, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("파일 없음");
    }

    res.download(filePath, fileName, (err) => {
      if (!err) {
        scheduleDelete(filePath, 5000);
      }
    });
  } catch (err) {
    console.error("download error:", err);
    res.status(500).send("서버 오류");
  }
});

module.exports = router;
