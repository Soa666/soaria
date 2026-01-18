import db from '../database.js';

// Check if user has a specific permission
export async function hasPermission(userId, permissionName) {
  try {
    // Get user's groups
    const userGroups = await db.all(`
      SELECT g.id, g.name
      FROM user_groups ug
      JOIN groups g ON ug.group_id = g.id
      WHERE ug.user_id = ?
    `, [userId]);

    // Also check legacy role system (for backward compatibility)
    const user = await db.get('SELECT role FROM users WHERE id = ?', [userId]);
    
    // Admin role has all permissions
    if (user && user.role === 'admin') {
      return true;
    }

    // Check if any of user's groups has the permission
    if (userGroups.length > 0) {
      const groupIds = userGroups.map(g => g.id);
      const placeholders = groupIds.map(() => '?').join(',');
      
      const permission = await db.get(`
        SELECT p.id
        FROM permissions p
        JOIN group_permissions gp ON p.id = gp.permission_id
        WHERE p.name = ? AND gp.group_id IN (${placeholders})
      `, [permissionName, ...groupIds]);

      if (permission) {
        return true;
      }
    }

    // Legacy role-based permissions
    if (user) {
      if (user.role === 'mod' && ['manage_items', 'manage_recipes', 'manage_users', 'view_admin', 'manage_settings'].includes(permissionName)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking permission:', error);
    return false;
  }
}

// Middleware to require a specific permission
export function requirePermission(permissionName) {
  return async (req, res, next) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Nicht authentifiziert' });
    }

    const hasPerm = await hasPermission(req.user.id, permissionName);
    if (!hasPerm) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Aktion' });
    }

    next();
  };
}
