// middleware/auditLogger.js

import db from "../models/index.js";

const  {
AuditLog
} = db
export const auditLogger = async (req, res, next) => {
  const startTime = Date.now();

  // Capture response data
  const originalSend = res.send;
  res.send = async function (body) {
    const responseTime = Date.now() - startTime;

    try {
      await AuditLog.create({
        method: req.method,
        api_route: req.originalUrl,
        ip_address: req.ip,
        user_id: req.user ? req.user.id : null, // Assuming user added by auth middleware
        audit_fields: "Modification API", // You can customize this if you want to track field-level changes
        payload_history: JSON.stringify(req.body || {}),
        response_history: typeof body === "object" ? JSON.stringify(body) : body,
        response_status: res.statusCode,
        response_time: responseTime,
      });
    } catch (err) {
      console.error("Error saving audit log:", err);
    }

    return originalSend.call(this, body);
  };

  next();
};
