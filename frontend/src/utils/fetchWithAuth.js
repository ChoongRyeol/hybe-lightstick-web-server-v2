export const fetchWithAuth = async (url, options = {}) => {
  const res = await fetch(url, {
    credentials: "include",
    ...options,
  });

  if (res.status === 401) {
    window.location.href = "/login"; // 로그인 페이지로 이동
    return; // 혹은 throw new Error("401");
  }

  return res;
};
