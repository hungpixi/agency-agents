export function requireAuth(req) {
  const token = process.env.CONTROL_PLANE_TOKEN;
  if (!token || token.includes("<")) return;

  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${token}`) {
    const error = new Error("unauthorized");
    error.statusCode = 401;
    throw error;
  }
}
