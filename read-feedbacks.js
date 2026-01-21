import db from './backend/database.js';

async function readFeedbacks() {
  try {
    const feedbacks = await db.all(`
      SELECT 
        f.*,
        u.username as submitter_name,
        u.email as submitter_email,
        r.username as reviewer_name
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN users r ON f.reviewed_by = r.id
      ORDER BY f.created_at DESC
    `);

    if (feedbacks.length === 0) {
      console.log('Keine Feedbacks vorhanden.');
      return;
    }

    console.log(`\n📋 ${feedbacks.length} Feedbacks gefunden:\n`);
    console.log('='.repeat(80));

    feedbacks.forEach((fb, index) => {
      const typeIcons = {
        bug: '🐛',
        suggestion: '💡',
        other: '📋'
      };
      const statusIcons = {
        new: '🆕',
        in_progress: '🔧',
        resolved: '✅',
        wont_fix: '🚫',
        duplicate: '📋'
      };

      console.log(`\n${index + 1}. ${typeIcons[fb.type] || '📝'} ${fb.title}`);
      console.log(`   Status: ${statusIcons[fb.status] || ''} ${fb.status} | Priorität: ${fb.priority || 'normal'}`);
      console.log(`   Von: ${fb.submitter_name || 'Anonym'}${fb.submitter_email ? ` (${fb.submitter_email})` : ''}`);
      console.log(`   Erstellt: ${new Date(fb.created_at).toLocaleString('de-DE')}`);
      if (fb.reviewer_name) {
        console.log(`   Bearbeitet von: ${fb.reviewer_name} am ${fb.reviewed_at ? new Date(fb.reviewed_at).toLocaleString('de-DE') : 'N/A'}`);
      }
      if (fb.page_url) {
        console.log(`   Seite: ${fb.page_url}`);
      }
      if (fb.browser_info) {
        console.log(`   Browser: ${fb.browser_info}`);
      }
      console.log(`   Beschreibung:`);
      console.log(`   ${fb.description}`);
      if (fb.admin_notes) {
        console.log(`   Admin-Notizen: ${fb.admin_notes}`);
      }
      console.log('-'.repeat(80));
    });

    // Statistiken
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN type = 'bug' THEN 1 ELSE 0 END) as bugs,
        SUM(CASE WHEN type = 'suggestion' THEN 1 ELSE 0 END) as suggestions
      FROM feedback
    `);

    console.log(`\n📊 Statistiken:`);
    console.log(`   Gesamt: ${stats.total}`);
    console.log(`   Neu: ${stats.new}`);
    console.log(`   In Bearbeitung: ${stats.in_progress}`);
    console.log(`   Bugs: ${stats.bugs}`);
    console.log(`   Vorschläge: ${stats.suggestions}\n`);

  } catch (error) {
    if (error.message.includes('no such table')) {
      console.log('❌ Feedback-Tabelle existiert noch nicht in der Datenbank.');
      console.log('   Die Tabelle wird beim nächsten Server-Start erstellt.');
    } else {
      console.error('Fehler beim Lesen der Feedbacks:', error);
    }
  }
}

readFeedbacks().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
