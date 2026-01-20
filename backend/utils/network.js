// Helper to get real client IP from proxy headers
export function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
    || req.headers['x-real-ip'] 
    || req.ip
    || req.connection?.remoteAddress
    || 'unknown';
}
