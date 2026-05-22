//zkStatus.js
const { isZkConnected } = require('../zk');

function zkStatusMiddleware(req, res, next) {
  req.zk = {
    isConnected: isZkConnected
  };
  next();
}

module.exports = zkStatusMiddleware;