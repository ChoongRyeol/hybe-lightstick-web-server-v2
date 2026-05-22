const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { authPool } = require("../db");

const DB_USER = "root"; // 또는 backup_user
const DB_PASSWORD = "wearable"; // 또는 backup_user
const DB_NAME = "lightstickv2_auth"; // DB 이름
const TABLE_NAME = "login_logs";
const BACKUP_DIR = `D:\\LightstickV2\\DB\\data\\backup\\${TABLE_NAME}`;
const RETENTION_DAYS = 30;

function getDateString() {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

function getCutoffDateStr() {
  const date = new Date();
  date.setDate(date.getDate() - RETENTION_DAYS);
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function backupAndCleanLoginLogs() {
  const cutoffDateStr = getCutoffDateStr();

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const filename = `${TABLE_NAME}_backup_${getDateString()}.sql`;
  const filePath = path.join(BACKUP_DIR, filename);
  const whereClause = `login_time < '${cutoffDateStr}'`;

  // ✅ mysqldump 명령어 구성
  const dumpCmd = `"C:\\Program Files\\MariaDB 11.6\\bin\\mysqldump.exe" -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} ${TABLE_NAME} --where="${whereClause}" > "${filePath}"`;

  //console.log("📦 백업 시작...");
  exec(dumpCmd, async (err, stdout, stderr) => {
    if (err) {
      console.error("❌ mysqldump 실패:", err.message);
      return;
    }

    //console.log("✅ 백업 완료:", filePath);

    try {
      // ✅ 백업 성공 시 오래된 로그 삭제
      const deleteSql = `DELETE FROM ${TABLE_NAME} WHERE login_time < ?`;
      const [result] = await authPool.query(deleteSql, [cutoffDateStr]);
      //console.log(`🧹 ${DB_NAME} : ${result.affectedRows}건 삭제 완료`);
    } catch (deleteErr) {
      console.error("⚠️ 삭제 중 오류:", deleteErr);
    }
  });
}

module.exports = backupAndCleanLoginLogs;
