import jwt from "jsonwebtoken";

export const authenticate = (req, res, next) => {
  try {
    // Get access token from Authorization header
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "NO_TOKEN",
        message: "No token provided. Unauthorized!"
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify token using access token secret
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach decoded user info to request
    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      code: "TOKEN_EXPIRED",
      message: "Invalid or expired access token."
    });
  }
};

export const verifyRefreshToken = (req, res, next) => {
  try {
    let token = null;

    // 1. Extract from Authorization header (Bearer <refresh_token>)
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
    // 2. Extract from x-refresh-token header
    else if (req.headers["x-refresh-token"]) {
      token = req.headers["x-refresh-token"];
    }
    // 3. Extract from refreshtoken header
    else if (req.headers["refreshtoken"]) {
      token = req.headers["refreshtoken"];
    }
    // 4. Fallback to request body if sent in body
    else if (req.body && (req.body.token || req.body.refreshToken || req.body.refresh_token)) {
      token = req.body.token || req.body.refreshToken || req.body.refresh_token;
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        code: "REFRESH_TOKEN_REQUIRED",
        message: "Refresh token is required in request header."
      });
    }

    // Verify refresh token using refresh token secret
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // Attach decoded user info and raw refresh token to request
    req.user = decoded;
    req.refreshToken = token;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      code: "REFRESH_TOKEN_EXPIRED",
      message: "Invalid or expired refresh token."
    });
  }
};
