export default function handler(_req, res) {
  const backendApiUrl = process.env.FRONTEND_BACKEND_API_URL || "";

  return res.status(200).json({
    backendApiUrl
  });
}