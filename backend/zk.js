// zk.js
// const zookeeper = require("node-zookeeper-client");
// const mkdirp = require("./utils/mkdirp");

// const zkClient = zookeeper.createClient("localhost:2181", {
//   sessionTimeout: 5000,
// });
// const lockBasePath = "/locks";

// zkClient.connect();

// // 연결 시 write와 compare 디렉토리 자동 생성
// zkClient.once("connected", () => {
//   mkdirp(zkClient, `${lockBasePath}/write`, (err) => {
//     if (err) console.error("❌ /locks/write 생성 실패:", err);
//     else console.log("✅ /locks/write 생성 완료");
//   });

//   mkdirp(zkClient, `${lockBasePath}/compare`, (err) => {
//     if (err) console.error("❌ /locks/compare 생성 실패:", err);
//     else console.log("✅ /locks/compare 생성 완료");
//   });

//   mkdirp(zkClient, `${lockBasePath}/cartonbox`, (err) => {
//     if (err) console.error("❌ /locks/cartonbox 생성 실패:", err);
//     else console.log("✅ /locks/cartonbox 생성 완료");
//   });
// });

// function isZkConnected() {
//   return zkClient.getState().getName() === "SYNC_CONNECTED";
// }

// function getLockPathForWrite() {
//   return `${lockBasePath}/write/`;
// }

// function getLockPathForCompare() {
//   return `${lockBasePath}/compare/`;
// }
// function getLockPathForCartonbox() {
//   return `${lockBasePath}/cartonbox/`;
// }
// module.exports = {
//   zkClient,
//   lockBasePath,
//   isZkConnected,
//   getLockPathForWrite,
//   getLockPathForCompare,
//   getLockPathForCartonbox,
// };
