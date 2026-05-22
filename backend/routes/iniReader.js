const fs = require("fs");
const ini = require("ini");
const express = require("express");
const path = require("path");
const router = express.Router();

router.get("/config/:process/:lightstick", (req, res) => {
  const { process, lightstick } = req.params;
  const filePath = path.join(
    "D:",
    "Lightstick",
    "Config",
    process,
    `${lightstick}.ini`
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "파일 없음" });
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const config = ini.parse(raw);
    return res.json({ success: true, data: config });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "파일 파싱 오류" });
  }
});

module.exports = router;
