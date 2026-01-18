import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Kein Token bereitgestellt' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Ungültiger Token' });
    }
    req.user = user;
    next();
  });
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    
    next();
  };
}

// Import db for permission checking
import db from '../database.js';

export function requirePermission(permissionName) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }
    
    // Admins always have permission
    if (req.user.role === 'admin') {
      return next();
    }
    
    try {
      // Check if user has permission through any of their groups
      const hasPermission = await db.get(`
        SELECT 1 FROM user_groups ug
        JOIN group_permissions gp ON ug.group_id = gp.group_id
        JOIN permissions p ON gp.permission_id = p.id
        WHERE ug.user_id = ? AND p.name = ?
      `, [req.user.id, permissionName]);
      
      if (!hasPermission) {
        return res.status(403).json({ error: 'Keine Berechtigung für diese Aktion' });
      }
      
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({ error: 'Fehler bei der Berechtigungsprüfung' });
    }
  };
}
