import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../database.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse Wang-Tile XML to extract terrain mappings
async function parseWangTiles() {
  try {
    const tilesetPath = path.join(__dirname, '../../world/Tiled/punyworld-overworld-tiles.tsx');
    const content = await fs.readFile(tilesetPath, 'utf-8');
    
    // Extract wangcolor mappings (ID -> name)
    const wangColorRegex = /<wangcolor name="([^"]+)"[^>]*>/g;
    const wangColors = {};
    let match;
    let colorIndex = 1; // Colors are numbered starting from 1
    
    while ((match = wangColorRegex.exec(content)) !== null) {
      const name = match[1];
      wangColors[colorIndex] = name;
      colorIndex++;
    }
    
    // Map color names to our terrain types
    const terrainMapping = {
      'grass': 'grass',
      'dirt': 'dirt',
      'sand': 'sand',
      'cliff': 'cliff',
      'trees': 'forest',
      'trees2': 'forest',
      'river': 'water',
      'seawater-light': 'water',
      'seawater-medium': 'water',
      'seawater-deep': 'water',
      'air': 'other',
      'cliff-transparent': 'cliff'
    };
    
    // Extract wangtile mappings (tileid -> wangid)
    const wangTileRegex = /<wangtile tileid="(\d+)" wangid="([^"]+)"/g;
    const tileMappings = {};
    
    while ((match = wangTileRegex.exec(content)) !== null) {
      const tileId = parseInt(match[1]);
      const wangId = match[2].split(',').map(Number);
      
      // Get the most common color in the corners (for simple terrain detection)
      const cornerColors = wangId.filter((_, i) => i % 2 === 1); // Every second value is a color
      const colorCounts = {};
      cornerColors.forEach(color => {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
      });
      
      // Find dominant color
      let dominantColor = 0;
      let maxCount = 0;
      for (const [color, count] of Object.entries(colorCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantColor = parseInt(color);
        }
      }
      
      // Map to terrain type
      const colorName = wangColors[dominantColor];
      if (colorName && terrainMapping[colorName]) {
        tileMappings[tileId] = terrainMapping[colorName];
      }
    }
    
    return tileMappings;
  } catch (error) {
    console.error('Error parsing Wang tiles:', error);
    return {};
  }
}

// Get suggested mappings from Wang-Tile file
router.get('/suggestions', async (req, res) => {
  try {
    const suggestions = await parseWangTiles();
    res.json({ suggestions });
  } catch (error) {
    console.error('Get suggestions error:', error);
    res.status(500).json({ error: 'Serverfehler' });
  }
});

// Apply suggestions to database
router.post('/apply-suggestions', async (req, res) => {
  try {
    const suggestions = await parseWangTiles();
    let applied = 0;
    
    for (const [tileId, terrain] of Object.entries(suggestions)) {
      // Check if mapping already exists
      const existing = await db.get('SELECT * FROM tileset_mappings WHERE tile_id = ?', [tileId]);
      
      if (!existing) {
        await db.run(
          'INSERT INTO tileset_mappings (tile_id, terrain) VALUES (?, ?)',
          [tileId, terrain]
        );
        applied++;
      }
    }
    
    res.json({ 
      message: `${applied} Mappings aus Wang-Tile-Datei angewendet`,
      applied,
      total: Object.keys(suggestions).length
    });
  } catch (error) {
    console.error('Apply suggestions error:', error);
    res.status(500).json({ error: 'Serverfehler: ' + error.message });
  }
});

export default router;
