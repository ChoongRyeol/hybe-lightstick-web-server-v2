// utils/lockHandler.js
const { zkClient, lockBasePath } = require("../zk");
const zookeeper = require("node-zookeeper-client");

function createEphemeralLock(path, clientId = "UNKNOWN_CLIENT") {
  return new Promise((resolve, reject) => {
    zkClient.create(
      path,
      null,
      zookeeper.ACL.OPEN_ACL_UNSAFE,
      zookeeper.CreateMode.EPHEMERAL,
      (error) => {
        if (error) {
          if (
            error.getCode &&
            error.getCode() === zookeeper.Exception.NODE_EXISTS
          ) {
            const err = new Error(`Node ${path} already exists.`);
            err.code = "NODE_EXISTS";
            return reject(err);
          }

          // 기타 오류 로그
          // console.error(
          //   `[${new Date().toISOString()}] CREATE ERROR by ${clientId}:`,
          //   error
          // );
          return reject(error);
        }

        // 성공 시 로그
        // console.log(
        //   `[${new Date().toISOString()}] NODE CREATE by ${clientId}: ${path}`
        // );
        resolve();
      }
    );
  });
}

function releaseLock(path) {
  return new Promise((resolve, reject) => {
    zkClient.remove(path, (error) => {
      if (
        error &&
        error.getCode &&
        error.getCode() !== zookeeper.Exception.NO_NODE
      ) {
        return reject(error);
      }
      resolve();
    });
  });
}

function autoReleaseLock(path, timeout = 2000) {
  setTimeout(() => {
    zkClient.remove(path, (err) => {
      if (err && err.getCode && err.getCode() !== zookeeper.Exception.NO_NODE) {
        console.error(`⏰ Failed to auto-release lock ${path}:`, err);
      } else {
        console.log(`⏰ Auto-released lock: ${path}`);
      }
    });
  }, timeout);
}

module.exports = { createEphemeralLock, releaseLock, autoReleaseLock };
