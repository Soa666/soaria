import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { trackBuilding } from '../helpers/statistics.js';

const router = express.Router();

// Get all available buildings
router.get('/', authenticateToken, async (req, res) => {
  try {
    const buildings = await db.all(`
      SELECT 
        b.id,
        b.name,
        b.display_name,
        b.description,
        b.image_path,
        b.position_x,
        b.position_y,
        b.size_width,
        b.size_height,
        b.unlock_order,
        b.max_level,
        CASE WHEN ub.id IS NOT NULL THEN 1 ELSE 0 END as is_built,
        ub.level
      FROM buildings b
      LEFT JOIN user_buildings ub ON b.id = ub.building_id AND ub.user_id = ?
      ORDER BY b.unlock_order
    `, [req.user.id]);

    // Get requirements for each building
    for (const building of buildings) {
      const requirements = await db.all(`
        SELECT 
          i.id,
          i.name,
          i.display_name,
          i.image_path,
          br.quantity,
          COALESCE(inv.quantity, 0) as user_quantity
        FROM building_requirements br
        JOIN items i ON br.item_id = i.id
        LEFT JOIN user_inventory inv ON i.id = inv.item_id AND inv.user_id = ?
        WHERE br.building_id = ?
      `, [req.user.id, building.id]);
      
      building.requirements = requirements;
    }

    res.json({ buildings });
  } catch (error) {
    console.error('Get buildings error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Gebäude' });
  }
});

// Get user's built buildings
router.get('/my-buildings', authenticateToken, async (req, res) => {
  try {
    const userBuildings = await db.all(`
      SELECT 
        ub.id,
        ub.building_id,
        ub.level,
        ub.built_at,
        b.name,
        b.display_name,
        b.description,
        b.image_path,
        b.position_x,
        b.position_y,
        b.size_width,
        b.size_height,
        b.max_level
      FROM user_buildings ub
      JOIN buildings b ON ub.building_id = b.id
      WHERE ub.user_id = ?
      ORDER BY b.unlock_order
    `, [req.user.id]);

    res.json({ buildings: userBuildings });
  } catch (error) {
    console.error('Get my buildings error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden deiner Gebäude' });
  }
});

// Helper: Check if user has any active job that is NOT ready to collect
async function hasActiveJob(userId) {
  const now = new Date().toISOString();
  
  // Check collection jobs - only if not yet completed
  const collectionJob = await db.get(
    "SELECT id FROM collection_jobs WHERE user_id = ? AND status IN ('active', 'paused') AND completed_at > ?",
    [userId, now]
  );
  if (collectionJob) return { active: true, type: 'Sammel-Auftrag' };
  
  // Check building jobs - only if not yet completed
  const buildingJob = await db.get(
    "SELECT id FROM building_jobs WHERE user_id = ? AND status IN ('active', 'paused') AND completed_at > ?",
    [userId, now]
  );
  if (buildingJob) return { active: true, type: 'Bau-/Upgrade-Auftrag' };
  
  // Check crafting jobs - only if not yet finished
  const craftingJob = await db.get(
    "SELECT id, finish_at, paused_at FROM crafting_jobs WHERE user_id = ? AND is_completed = 0",
    [userId]
  );
  if (craftingJob) {
    if (craftingJob.paused_at) {
      return { active: true, type: 'Herstellungs-Auftrag (pausiert)' };
    }
    if (new Date(craftingJob.finish_at) > new Date()) {
      return { active: true, type: 'Herstellungs-Auftrag' };
    }
  }
  
  return { active: false };
}

// Build a building
router.post('/build/:buildingId', authenticateToken, async (req, res) => {
  try {
    const buildingId = parseInt(req.params.buildingId);
    
    // Check if player is at home (their Grundstück)
    const user = await db.get('SELECT world_x, world_y, home_x, home_y FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const homeX = user.home_x ?? user.world_x;
    const homeY = user.home_y ?? user.world_y;
    const distanceFromHome = Math.sqrt(Math.pow(user.world_x - homeX, 2) + Math.pow(user.world_y - homeY, 2));
    if (distanceFromHome > 50) {
      return res.status(400).json({ 
        error: 'Du musst zu Hause sein um zu bauen! Reise zuerst zu deinem Grundstück.',
        notAtHome: true
      });
    }

    // Check if building exists
    const building = await db.get('SELECT * FROM buildings WHERE id = ?', [buildingId]);
    if (!building) {
      return res.status(404).json({ error: 'Gebäude nicht gefunden' });
    }

    // Check if already built
    const existing = await db.get(
      'SELECT * FROM user_buildings WHERE user_id = ? AND building_id = ?',
      [req.user.id, buildingId]
    );
    if (existing) {
      return res.status(400).json({ error: 'Gebäude bereits gebaut' });
    }

    // Check if user has ANY active job
    const jobCheck = await hasActiveJob(req.user.id);
    if (jobCheck.active) {
      return res.status(400).json({ 
        error: `Du hast bereits einen aktiven ${jobCheck.type}. Schließe ihn zuerst ab!`,
        hasActiveJob: true
      });
    }

    // Check requirements (only build requirements)
    const requirements = await db.all(`
      SELECT 
        br.item_id,
        br.quantity,
        i.display_name,
        COALESCE(inv.quantity, 0) as user_quantity
      FROM building_requirements br
      JOIN items i ON br.item_id = i.id
      LEFT JOIN user_inventory inv ON i.id = inv.item_id AND inv.user_id = ?
      WHERE br.building_id = ? AND br.requirement_type = 'build'
    `, [req.user.id, buildingId]);

    const missing = [];
    for (const reqItem of requirements) {
      if (reqItem.user_quantity < reqItem.quantity) {
        missing.push({
          item: reqItem.display_name,
          required: reqItem.quantity,
          have: reqItem.user_quantity
        });
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({ 
        error: 'Nicht genug Ressourcen',
        missing 
      });
    }

    // Deduct resources
    for (const reqItem of requirements) {
      await db.run(`
        UPDATE user_inventory
        SET quantity = quantity - ?
        WHERE user_id = ? AND item_id = ?
      `, [reqItem.quantity, req.user.id, reqItem.item_id]);
      
      // Remove item if quantity reaches 0
      await db.run(`
        DELETE FROM user_inventory
        WHERE user_id = ? AND item_id = ? AND quantity <= 0
      `, [req.user.id, reqItem.item_id]);
    }

    // Create building job
    const durationMinutes = building.build_duration_minutes || 5;
    const startedAt = new Date();
    const completedAt = new Date(startedAt.getTime() + durationMinutes * 60000);

    const job = await db.run(`
      INSERT INTO building_jobs (user_id, building_id, job_type, target_level, duration_minutes, started_at, completed_at, status)
      VALUES (?, ?, 'build', 1, ?, ?, ?, 'active')
    `, [req.user.id, buildingId, durationMinutes, startedAt.toISOString(), completedAt.toISOString()]);

    res.json({ 
      message: `Bau von ${building.display_name} gestartet!`,
      job: {
        id: job.lastID,
        duration_minutes: durationMinutes,
        completed_at: completedAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Build building error:', error);
    res.status(500).json({ error: 'Serverfehler beim Bauen' });
  }
});

// Upgrade a building
router.post('/upgrade/:buildingId', authenticateToken, async (req, res) => {
  try {
    const buildingId = parseInt(req.params.buildingId);
    
    // Check if player is at home (their Grundstück)
    const user = await db.get('SELECT world_x, world_y, home_x, home_y FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'Benutzer nicht gefunden' });
    }

    const homeX = user.home_x ?? user.world_x;
    const homeY = user.home_y ?? user.world_y;
    const distanceFromHome = Math.sqrt(Math.pow(user.world_x - homeX, 2) + Math.pow(user.world_y - homeY, 2));
    if (distanceFromHome > 50) {
      return res.status(400).json({ 
        error: 'Du musst zu Hause sein um zu upgraden! Reise zuerst zu deinem Grundstück.',
        notAtHome: true
      });
    }

    // Get building info
    const building = await db.get('SELECT * FROM buildings WHERE id = ?', [buildingId]);
    if (!building) {
      return res.status(404).json({ error: 'Gebäude nicht gefunden' });
    }
    
    // Check if building is built
    const userBuilding = await db.get(
      'SELECT * FROM user_buildings WHERE user_id = ? AND building_id = ?',
      [req.user.id, buildingId]
    );
    if (!userBuilding) {
      return res.status(404).json({ error: 'Gebäude nicht gefunden oder nicht gebaut' });
    }

    // Check if user has ANY active job
    const jobCheck = await hasActiveJob(req.user.id);
    if (jobCheck.active) {
      return res.status(400).json({ 
        error: `Du hast bereits einen aktiven ${jobCheck.type}. Schließe ihn zuerst ab!`,
        hasActiveJob: true
      });
    }

    // Check max level (use COALESCE to handle NULL values)
    const maxLevel = building.max_level || 5;
    if (userBuilding.level >= maxLevel) {
      return res.status(400).json({ 
        error: `Gebäude ist bereits auf maximalem Level (${maxLevel})`,
        max_level: maxLevel,
        current_level: userBuilding.level
      });
    }
    
    // Also check if level somehow exceeds max (safety check)
    if (userBuilding.level > maxLevel) {
      // Auto-fix: set to max level
      await db.run(`
        UPDATE user_buildings
        SET level = ?
        WHERE user_id = ? AND building_id = ?
      `, [maxLevel, req.user.id, buildingId]);
      return res.status(400).json({ 
        error: `Gebäude-Level wurde auf maximales Level (${maxLevel}) korrigiert`,
        max_level: maxLevel,
        corrected_level: maxLevel
      });
    }

    const newLevel = userBuilding.level + 1;
    
    // Get upgrade requirements for this level
    const upgradeRequirements = await db.all(`
      SELECT 
        br.item_id,
        br.quantity,
        i.display_name,
        COALESCE(inv.quantity, 0) as user_quantity
      FROM building_requirements br
      JOIN items i ON br.item_id = i.id
      LEFT JOIN user_inventory inv ON i.id = inv.item_id AND inv.user_id = ?
      WHERE br.building_id = ? 
        AND br.requirement_type = 'upgrade' 
        AND (br.level = ? OR br.level = 0)
    `, [req.user.id, buildingId, newLevel]);
    
    // If no specific upgrade requirements, use build requirements * level multiplier
    let requirements = upgradeRequirements;
    if (requirements.length === 0) {
      const baseRequirements = await db.all(`
        SELECT 
          br.item_id,
          br.quantity,
          i.display_name,
          COALESCE(inv.quantity, 0) as user_quantity
        FROM building_requirements br
        JOIN items i ON br.item_id = i.id
        LEFT JOIN user_inventory inv ON i.id = inv.item_id AND inv.user_id = ?
        WHERE br.building_id = ? AND br.requirement_type = 'build'
      `, [req.user.id, buildingId]);
      
      // Multiply by level (minimum 1)
      const multiplier = Math.max(1, Math.floor(newLevel * 0.5));
      requirements = baseRequirements.map(req => ({
        ...req,
        quantity: req.quantity * multiplier
      }));
    }

    const missing = [];
    for (const reqItem of requirements) {
      if (reqItem.user_quantity < reqItem.quantity) {
        missing.push({
          item: reqItem.display_name,
          required: reqItem.quantity,
          have: reqItem.user_quantity
        });
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({ 
        error: 'Nicht genug Ressourcen für das Upgrade',
        missing 
      });
    }

    // Deduct resources
    for (const reqItem of requirements) {
      await db.run(`
        UPDATE user_inventory
        SET quantity = quantity - ?
        WHERE user_id = ? AND item_id = ?
      `, [reqItem.quantity, req.user.id, reqItem.item_id]);
      
      // Remove item if quantity reaches 0
      await db.run(`
        DELETE FROM user_inventory
        WHERE user_id = ? AND item_id = ? AND quantity <= 0
      `, [req.user.id, reqItem.item_id]);
    }
    
    // Create upgrade job
    const durationMinutes = building.upgrade_duration_minutes || 3;
    const startedAt = new Date();
    const completedAt = new Date(startedAt.getTime() + durationMinutes * 60000);

    const job = await db.run(`
      INSERT INTO building_jobs (user_id, building_id, job_type, target_level, duration_minutes, started_at, completed_at, status)
      VALUES (?, ?, 'upgrade', ?, ?, ?, ?, 'active')
    `, [req.user.id, buildingId, newLevel, durationMinutes, startedAt.toISOString(), completedAt.toISOString()]);

    res.json({ 
      message: `Upgrade von ${building.display_name} auf Level ${newLevel} gestartet!`,
      job: {
        id: job.lastID,
        duration_minutes: durationMinutes,
        completed_at: completedAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Upgrade building error:', error);
    res.status(500).json({ error: 'Serverfehler beim Aufwerten' });
  }
});

// Helper: Check if user is at home
async function isUserAtHome(userId) {
  const user = await db.get('SELECT world_x, world_y, home_x, home_y FROM users WHERE id = ?', [userId]);
  if (!user) return false;
  const homeX = user.home_x ?? 0;
  const homeY = user.home_y ?? 0;
  const distance = Math.sqrt(
    Math.pow((user.world_x || 0) - homeX, 2) + 
    Math.pow((user.world_y || 0) - homeY, 2)
  );
  return distance <= 50;
}

// Get building job status
router.get('/job/status', authenticateToken, async (req, res) => {
  try {
    let job = await db.get(`
      SELECT 
        bj.*,
        b.display_name as building_name
      FROM building_jobs bj
      JOIN buildings b ON bj.building_id = b.id
      WHERE bj.user_id = ? AND bj.status IN ('active', 'paused')
      ORDER BY bj.started_at DESC
      LIMIT 1
    `, [req.user.id]);

    if (!job) {
      return res.json({ job: null });
    }

    const now = new Date();
    const atHome = await isUserAtHome(req.user.id);

    // Resume paused job if user is at home
    if (job.status === 'paused' && atHome && job.remaining_seconds) {
      const newCompletedAt = new Date(now.getTime() + job.remaining_seconds * 1000);
      await db.run(`
        UPDATE building_jobs 
        SET status = 'active', paused_at = NULL, remaining_seconds = NULL, completed_at = ?
        WHERE id = ?
      `, [newCompletedAt.toISOString(), job.id]);
      job.status = 'active';
      job.completed_at = newCompletedAt.toISOString();
      job.paused_at = null;
    }

    // Pause active job if user left home
    if (job.status === 'active' && !atHome) {
      const completedAt = new Date(job.completed_at);
      const remainingMs = Math.max(0, completedAt.getTime() - now.getTime());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      await db.run(`
        UPDATE building_jobs 
        SET status = 'paused', paused_at = ?, remaining_seconds = ?
        WHERE id = ?
      `, [now.toISOString(), remainingSeconds, job.id]);
      job.status = 'paused';
      job.paused_at = now.toISOString();
      job.remaining_seconds = remainingSeconds;
    }

    const completedAt = new Date(job.completed_at);
    let isCompleted = false;
    let timeRemainingSeconds = 0;

    if (job.status === 'paused') {
      timeRemainingSeconds = job.remaining_seconds;
    } else {
      isCompleted = now >= completedAt;
      timeRemainingSeconds = isCompleted ? 0 : Math.max(0, Math.floor((completedAt - now) / 1000));
    }

    res.json({
      job: {
        ...job,
        is_completed: isCompleted,
        is_paused: job.status === 'paused',
        time_remaining_seconds: timeRemainingSeconds
      }
    });
  } catch (error) {
    console.error('Get job status error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden des Job-Status' });
  }
});

// Claim completed building job
router.post('/job/claim', authenticateToken, async (req, res) => {
  try {
    const job = await db.get(`
      SELECT * FROM building_jobs
      WHERE user_id = ? AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `, [req.user.id]);

    if (!job) {
      return res.status(404).json({ error: 'Kein aktiver Job gefunden' });
    }

    const now = new Date();
    const completedAt = new Date(job.completed_at);
    
    if (now < completedAt) {
      return res.status(400).json({ 
        error: 'Job ist noch nicht fertig',
        time_remaining_seconds: Math.floor((completedAt - now) / 1000)
      });
    }

    const building = await db.get('SELECT * FROM buildings WHERE id = ?', [job.building_id]);

    if (job.job_type === 'build') {
      // Build the building
      await db.run(`
        INSERT INTO user_buildings (user_id, building_id, level)
        VALUES (?, ?, 1)
        ON CONFLICT(user_id, building_id) DO NOTHING
      `, [req.user.id, job.building_id]);
    } else if (job.job_type === 'upgrade') {
      // Upgrade the building
      await db.run(`
        UPDATE user_buildings
        SET level = ?
        WHERE user_id = ? AND building_id = ?
      `, [job.target_level, req.user.id, job.building_id]);
    }

    // Mark job as claimed
    await db.run(`
      UPDATE building_jobs
      SET status = 'claimed'
      WHERE id = ?
    `, [job.id]);

    // Track building statistics
    await trackBuilding(req.user.id, job.building_id, job.job_type === 'upgrade');

    res.json({
      message: job.job_type === 'build' 
        ? `${building.display_name} erfolgreich gebaut!`
        : `${building.display_name} erfolgreich auf Level ${job.target_level} aufgewertet!`,
      building: {
        id: building.id,
        name: building.name,
        display_name: building.display_name
      },
      level: job.job_type === 'upgrade' ? job.target_level : 1
    });
  } catch (error) {
    console.error('Claim job error:', error);
    res.status(500).json({ error: 'Serverfehler beim Abholen' });
  }
});

// Get property settings and hotspots (for property page)
router.get('/property', authenticateToken, async (req, res) => {
  try {
    const settings = await db.get('SELECT * FROM property_settings ORDER BY id DESC LIMIT 1');
    const hotspots = await db.all('SELECT * FROM property_hotspots ORDER BY sort_order, building_name');
    
    res.json({ 
      settings: settings || { image_path: '/buildings/huette1.jpg' },
      hotspots: hotspots || []
    });
  } catch (error) {
    console.error('Get property error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;
