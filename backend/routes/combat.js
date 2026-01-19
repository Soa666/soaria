import express from 'express';
import db from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendSystemMessage } from './messages.js';
import { trackKill, updateStatistic, updateMultipleStats } from '../helpers/statistics.js';

const router = express.Router();

// Maximum interaction distance for combat
const MAX_COMBAT_DISTANCE = 100;

// Helper to calculate distance between two points
function getDistance(x1, y1, x2, y2) {
  return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

// Helper to check if player is near an NPC
async function checkPlayerNearNpc(userId, npcId) {
  const user = await db.get('SELECT world_x, world_y FROM users WHERE id = ?', [userId]);
  const npc = await db.get('SELECT world_x, world_y FROM world_npcs WHERE id = ?', [npcId]);
  
  if (!user || !npc) {
    return { isNear: false, error: 'Spieler oder NPC nicht gefunden' };
  }
  
  const distance = getDistance(user.world_x, user.world_y, npc.world_x, npc.world_y);
  
  if (distance > MAX_COMBAT_DISTANCE) {
    return { 
      isNear: false, 
      error: `Du bist zu weit entfernt! (Entfernung: ${Math.round(distance)}, Maximum: ${MAX_COMBAT_DISTANCE})`,
      distance 
    };
  }
  
  return { isNear: true, distance };
}

// Experience needed per level (exponential growth)
function getExpForLevel(level) {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

// Calculate combat result
function calculateCombat(attacker, defender) {
  // Base damage calculation with some randomness
  const attackRoll = Math.random() * 0.4 + 0.8; // 0.8 - 1.2 multiplier
  const defenseRoll = Math.random() * 0.4 + 0.8;
  
  // Calculate damage (attack - defense/2, minimum 1)
  const attackerDamage = Math.max(1, Math.floor((attacker.attack * attackRoll) - (defender.defense * defenseRoll / 2)));
  const defenderDamage = Math.max(1, Math.floor((defender.attack * defenseRoll) - (attacker.defense * attackRoll / 2)));
  
  // Simulate combat rounds
  let attackerHealth = attacker.current_health;
  let defenderHealth = defender.current_health;
  let rounds = 0;
  const maxRounds = 20;
  
  const combatLog = [];
  
  while (attackerHealth > 0 && defenderHealth > 0 && rounds < maxRounds) {
    rounds++;
    
    // Attacker hits first
    const dmgToDefender = Math.floor(attackerDamage * (Math.random() * 0.3 + 0.85));
    defenderHealth -= dmgToDefender;
    combatLog.push({ round: rounds, action: 'attacker_hit', damage: dmgToDefender });
    
    if (defenderHealth <= 0) break;
    
    // Defender counter-attacks
    const dmgToAttacker = Math.floor(defenderDamage * (Math.random() * 0.3 + 0.85));
    attackerHealth -= dmgToAttacker;
    combatLog.push({ round: rounds, action: 'defender_hit', damage: dmgToAttacker });
  }
  
  let winner = 'draw';
  if (defenderHealth <= 0 && attackerHealth > 0) winner = 'attacker';
  else if (attackerHealth <= 0 && defenderHealth > 0) winner = 'defender';
  else if (attackerHealth > defenderHealth) winner = 'attacker';
  else if (defenderHealth > attackerHealth) winner = 'defender';
  
  return {
    winner,
    attackerHealth: Math.max(0, attackerHealth),
    defenderHealth: Math.max(0, defenderHealth),
    attackerDamageDealt: attacker.current_health - attackerHealth,
    defenderDamageDealt: defender.current_health - defenderHealth,
    rounds,
    combatLog
  };
}

// Attack a monster
router.post('/monster/:npcId', authenticateToken, async (req, res) => {
  try {
    const { npcId } = req.params;
    const userId = req.user.id;

    // Check distance to monster first
    const proximityCheck = await checkPlayerNearNpc(userId, npcId);
    if (!proximityCheck.isNear) {
      return res.status(400).json({ error: proximityCheck.error, tooFar: true });
    }

    // Get monster
    const worldNpc = await db.get(`
      SELECT 
        wn.*,
        mt.display_name,
        mt.base_health,
        mt.health_per_level,
        mt.base_attack,
        mt.attack_per_level,
        mt.base_defense,
        mt.defense_per_level,
        mt.is_boss
      FROM world_npcs wn
      JOIN monster_types mt ON wn.monster_type_id = mt.id
      WHERE wn.id = ? AND wn.monster_type_id IS NOT NULL
    `, [npcId]);

    if (!worldNpc) {
      return res.status(404).json({ error: 'Monster nicht gefunden' });
    }

    // Check if monster is alive
    if (!worldNpc.is_active) {
      // Check respawn
      if (worldNpc.last_killed_at) {
        const respawnTime = new Date(worldNpc.last_killed_at);
        respawnTime.setMinutes(respawnTime.getMinutes() + worldNpc.respawn_minutes);
        if (new Date() < respawnTime) {
          const minutesLeft = Math.ceil((respawnTime - new Date()) / 60000);
          return res.status(400).json({ error: `Monster respawnt in ${minutesLeft} Minuten` });
        }
        // Respawn the monster
        const maxHealth = worldNpc.base_health + (worldNpc.level - 1) * worldNpc.health_per_level;
        await db.run('UPDATE world_npcs SET is_active = 1, current_health = ? WHERE id = ?', [maxHealth, npcId]);
        worldNpc.current_health = maxHealth;
        worldNpc.is_active = 1;
      }
    }

    // Get player stats
    let playerStats = await db.get('SELECT * FROM player_stats WHERE user_id = ?', [userId]);
    if (!playerStats) {
      await db.run(`
        INSERT INTO player_stats (user_id, level, experience, max_health, current_health, base_attack, base_defense)
        VALUES (?, 1, 0, 100, 100, 10, 5)
      `, [userId]);
      playerStats = await db.get('SELECT * FROM player_stats WHERE user_id = ?', [userId]);
    }

    if (playerStats.current_health <= 0) {
      return res.status(400).json({ error: 'Du musst dich erst erholen! Deine HP sind zu niedrig.' });
    }

    // Get equipment bonuses
    const QUALITY_MULTIPLIERS = {
      poor: 0.7, normal: 1.0, good: 1.2, excellent: 1.5, masterwork: 1.8, legendary: 2.5
    };
    
    const equippedItems = await db.all(`
      SELECT ue.quality, et.base_attack, et.base_defense, et.base_health
      FROM user_equipment ue
      JOIN equipment_types et ON ue.equipment_type_id = et.id
      WHERE ue.user_id = ? AND ue.is_equipped = 1
    `, [userId]);

    let equipmentAttack = 0;
    let equipmentDefense = 0;
    let equipmentHealth = 0;

    for (const eq of equippedItems) {
      const multiplier = QUALITY_MULTIPLIERS[eq.quality] || 1.0;
      equipmentAttack += Math.floor(eq.base_attack * multiplier);
      equipmentDefense += Math.floor(eq.base_defense * multiplier);
      equipmentHealth += Math.floor(eq.base_health * multiplier);
    }

    // Calculate monster stats
    const monsterLevel = worldNpc.level || 1;
    const monsterMaxHealth = worldNpc.base_health + (monsterLevel - 1) * worldNpc.health_per_level;
    const monsterAttack = worldNpc.base_attack + (monsterLevel - 1) * worldNpc.attack_per_level;
    const monsterDefense = worldNpc.base_defense + (monsterLevel - 1) * worldNpc.defense_per_level;

    // Player total stats = base + equipment
    const playerTotalAttack = playerStats.base_attack + equipmentAttack;
    const playerTotalDefense = playerStats.base_defense + equipmentDefense;
    const playerMaxHealthWithEquipment = playerStats.max_health + equipmentHealth;

    const attacker = {
      attack: playerTotalAttack,
      defense: playerTotalDefense,
      current_health: Math.min(playerStats.current_health, playerMaxHealthWithEquipment),
      max_health: playerMaxHealthWithEquipment
    };

    const defender = {
      attack: monsterAttack,
      defense: monsterDefense,
      current_health: worldNpc.current_health || monsterMaxHealth,
      max_health: monsterMaxHealth
    };

    // Fight!
    const result = calculateCombat(attacker, defender);

    // Update player health
    await db.run('UPDATE player_stats SET current_health = ? WHERE user_id = ?', 
      [result.attackerHealth, userId]);

    let goldGained = 0;
    let expGained = 0;
    const lootItems = [];

    if (result.winner === 'attacker') {
      // Monster defeated!
      await db.run(`
        UPDATE world_npcs SET is_active = 0, current_health = 0, last_killed_at = datetime('now') WHERE id = ?
      `, [npcId]);

      // Calculate rewards
      expGained = Math.floor(10 * monsterLevel * (worldNpc.is_boss ? 5 : 1));
      
      // Get loot
      const lootTable = await db.all(`
        SELECT * FROM monster_loot WHERE monster_type_id = ?
      `, [worldNpc.monster_type_id]);

      for (const loot of lootTable) {
        // Gold
        if (loot.gold_min > 0 || loot.gold_max > 0) {
          goldGained += Math.floor(Math.random() * (loot.gold_max - loot.gold_min + 1)) + loot.gold_min;
        }
        
        // Item drop
        if (Math.random() < loot.drop_chance) {
          const qty = Math.floor(Math.random() * (loot.max_quantity - loot.min_quantity + 1)) + loot.min_quantity;
          
          const item = await db.get('SELECT display_name FROM items WHERE id = ?', [loot.item_id]);
          lootItems.push({ item_id: loot.item_id, quantity: qty, name: item?.display_name || 'Unbekannt' });
          
          // Add to inventory
          await db.run(`
            INSERT INTO user_inventory (user_id, item_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?
          `, [userId, loot.item_id, qty, qty]);
        }
      }

      // Add gold
      if (goldGained > 0) {
        await db.run('UPDATE users SET gold = gold + ? WHERE id = ?', [goldGained, userId]);
      }

      // Add experience
      const currentExp = playerStats.experience + expGained;
      const expNeeded = getExpForLevel(playerStats.level + 1);
      
      if (currentExp >= expNeeded) {
        // Level up!
        const newLevel = playerStats.level + 1;
        const newMaxHealth = 100 + (newLevel - 1) * 20;
        const newAttack = 10 + (newLevel - 1) * 3;
        const newDefense = 5 + (newLevel - 1) * 2;
        
        await db.run(`
          UPDATE player_stats 
          SET level = ?, experience = ?, max_health = ?, current_health = ?, base_attack = ?, base_defense = ?
          WHERE user_id = ?
        `, [newLevel, currentExp - expNeeded, newMaxHealth, newMaxHealth, newAttack, newDefense, userId]);

        result.levelUp = {
          newLevel,
          newMaxHealth,
          newAttack,
          newDefense
        };
      } else {
        await db.run('UPDATE player_stats SET experience = ? WHERE user_id = ?', [currentExp, userId]);
      }
    } else {
      // Update monster health
      await db.run('UPDATE world_npcs SET current_health = ? WHERE id = ?', [result.defenderHealth, npcId]);
    }

    // Log combat
    await db.run(`
      INSERT INTO combat_log (attacker_user_id, world_npc_id, winner, attacker_damage_dealt, defender_damage_dealt, gold_gained, experience_gained)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [userId, npcId, result.winner, result.defenderDamageDealt, result.attackerDamageDealt, goldGained, expGained]);

    // Track statistics
    await updateMultipleStats(userId, {
      total_damage_dealt: result.defenderDamageDealt,
      total_damage_received: result.attackerDamageDealt
    });

    if (result.winner === 'attacker') {
      await trackKill(userId, worldNpc.monster_type_id, worldNpc.is_boss);
      if (goldGained > 0) {
        await updateStatistic(userId, 'gold_earned', goldGained);
      }
    } else {
      await updateStatistic(userId, 'deaths', 1);
    }

    // Send combat report message
    const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
    const lootText = lootItems.length > 0 
      ? `\n\nBeute:\n${lootItems.map(l => `• ${l.quantity}x ${l.name}`).join('\n')}`
      : '';
    
    const goldText = goldGained > 0 ? `\n💰 Gold: +${goldGained}` : '';
    const expText = expGained > 0 ? `\n✨ EP: +${expGained}` : '';
    const levelUpText = result.levelUp ? `\n\n🎉 **LEVEL UP!** Du bist jetzt Level ${result.levelUp.newLevel}!` : '';
    
    const messageContent = result.winner === 'attacker'
      ? `⚔️ Du hast **${worldNpc.display_name}** (Lv.${monsterLevel}) besiegt!\n\nKampf dauerte ${result.rounds} Runden.\nDu hast ${result.attackerDamageDealt} Schaden erlitten.${goldText}${expText}${lootText}${levelUpText}`
      : `💀 Du wurdest von **${worldNpc.display_name}** (Lv.${monsterLevel}) besiegt!\n\nKampf dauerte ${result.rounds} Runden.\nDu hast ${result.attackerDamageDealt} Schaden erlitten.`;

    await sendSystemMessage(
      userId,
      result.winner === 'attacker' ? '⚔️ Sieg!' : '💀 Niederlage',
      messageContent,
      'combat'
    );

    res.json({
      result: result.winner,
      playerHealth: result.attackerHealth,
      playerMaxHealth: playerStats.max_health,
      monsterHealth: result.defenderHealth,
      monsterMaxHealth,
      damageDealt: result.defenderDamageDealt,
      damageTaken: result.attackerDamageDealt,
      rounds: result.rounds,
      goldGained,
      expGained,
      lootItems,
      levelUp: result.levelUp,
      monsterName: worldNpc.display_name,
      monsterLevel
    });
  } catch (error) {
    console.error('Combat error:', error);
    res.status(500).json({ error: 'Serverfehler beim Kampf' });
  }
});

// Note: Healing is now automatic when player is at home (checked in /npcs/player/stats)

// Get combat history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const history = await db.all(`
      SELECT 
        cl.*,
        wn.world_x,
        wn.world_y,
        mt.display_name as monster_name,
        wn.level as monster_level
      FROM combat_log cl
      LEFT JOIN world_npcs wn ON cl.world_npc_id = wn.id
      LEFT JOIN monster_types mt ON wn.monster_type_id = mt.id
      WHERE cl.attacker_user_id = ?
      ORDER BY cl.created_at DESC
      LIMIT 50
    `, [userId]);

    res.json({ history });
  } catch (error) {
    console.error('Get combat history error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

export default router;
