module.exports = function apiTiming(req, res, next) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1_000_000;

    // 응답/캐시 정보
    const len = res.getHeader("content-length") ?? "-";
    const etag = res.getHeader("etag") ?? "-";
    const ims = req.headers["if-modified-since"] ? "IMS" : "-";
    const inm = req.headers["if-none-match"] ? "INM" : "-";

    // 기본 로그
    let log =
      `[API] ${req.method} ${req.originalUrl} ` +
      `status=${res.statusCode} time=${ms.toFixed(1)}ms ` +
      `len=${len} etag=${etag} cache=${ims}/${inm}`;

    // 느린 요청 경고
    if (ms >= 800) {
      log = `[SLOW] ` + log;
      console.log(log);
    }
  });

  next();
};
