import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Get list of available item images (for avatar selection, all users can access)
router.get('/items', authenticateToken, async (req, res) => {
  try {
    // Path from backend/routes/files.js to items/ directory
    const itemsDir = path.join(__dirname, '../../items');
    console.log(`[FILES] Looking for images in: ${itemsDir}`);
    
    try {
      await fs.access(itemsDir); // Check if directory exists
      const files = await fs.readdir(itemsDir);
      console.log(`[FILES] Found ${files.length} files in directory`);
      
      const imageFiles = files
        .filter(file => /\.(png|jpg|jpeg|gif|webp)$/i.test(file))
        .sort()
        .map(file => ({
          filename: file,
          path: file
        }));

      console.log(`[FILES] Found ${imageFiles.length} image files:`, imageFiles.slice(0, 5).map(f => f.filename));
      res.json({ images: imageFiles });
    } catch (error) {
      console.error(`[FILES] Error reading directory ${itemsDir}:`, error.message);
      console.error(`[FILES] Error stack:`, error.stack);
      // Try alternative path
      const altPath = path.join(__dirname, '../../../items');
      console.log(`[FILES] Trying alternative path: ${altPath}`);
      try {
        const files = await fs.readdir(altPath);
        const imageFiles = files
          .filter(file => /\.(png|jpg|jpeg|gif|webp)$/i.test(file))
          .sort()
          .map(file => ({
            filename: file,
            path: file
          }));
        console.log(`[FILES] Found ${imageFiles.length} image files in alternative path`);
        res.json({ images: imageFiles });
      } catch (altError) {
        console.error(`[FILES] Alternative path also failed:`, altError.message);
        res.json({ images: [] });
      }
    }
  } catch (error) {
    console.error('Get item images error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Bilder' });
  }
});

// Get list of available character images for avatars
router.get('/chars', authenticateToken, async (req, res) => {
  try {
    // Path from backend/routes/files.js to chars/ directory
    // __dirname is backend/routes, so we need to go up one level to backend, then up to root
    const charsDir = path.join(__dirname, '../../chars');
    console.log(`[FILES] Looking for character images in: ${charsDir}`);
    
    // Try alternative paths
    let actualCharsDir = charsDir;
    try {
      await fs.access(charsDir);
    } catch (error) {
      // Try alternative path (if backend is in a subdirectory)
      const altPath = path.join(__dirname, '../../../chars');
      console.log(`[FILES] Trying alternative path: ${altPath}`);
      try {
        await fs.access(altPath);
        actualCharsDir = altPath;
      } catch (altError) {
        console.error(`[FILES] Both paths failed: ${charsDir} and ${altPath}`);
        return res.json({ images: [] });
      }
    }
    
    try {
      const characterDirs = await fs.readdir(actualCharsDir, { withFileTypes: true });
      
      const characterImages = [];
      
      for (const dir of characterDirs) {
        if (dir.isDirectory()) {
          const charDirPath = path.join(actualCharsDir, dir.name);
          const files = await fs.readdir(charDirPath);
          
          // Prefer 32x32 version for avatars, fallback to any png
          const avatarFile = files.find(f => f.includes('32x32') && /\.png$/i.test(f)) ||
                            files.find(f => /\.png$/i.test(f));
          
          if (avatarFile) {
            characterImages.push({
              filename: avatarFile,
              path: `${dir.name}/${avatarFile}`,
              character_name: dir.name
            });
          }
        }
      }
      
      // Sort by character number
      characterImages.sort((a, b) => {
        const numA = parseInt(a.character_name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.character_name.match(/\d+/)?.[0] || 0);
        return numA - numB;
      });
      
      console.log(`[FILES] Found ${characterImages.length} character images`);
      res.json({ images: characterImages });
    } catch (error) {
      console.error(`[FILES] Error reading chars directory ${charsDir}:`, error.message);
      res.json({ images: [] });
    }
  } catch (error) {
    console.error('Get character images error:', error);
    res.status(500).json({ error: 'Serverfehler beim Laden der Character-Bilder' });
  }
});

export default router;
