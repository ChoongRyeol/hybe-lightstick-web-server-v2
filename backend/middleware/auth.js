function requireAuth(req, res, next) {
  const user = req.session.user;
  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: "인증되지 않은 사용자입니다" });
  }

  req.user = user;

  next();
}

module.exports = requireAuth;
