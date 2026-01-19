import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './Statistics.css';

function Statistics() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const response = await api.get('/quests/statistics');
      setStats(response.data.statistics);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="statistics-page">
        <div className="loading">Lädt Statistiken...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="statistics-page">
        <div className="error">Statistiken konnten nicht geladen werden.</div>
      </div>
    );
  }

  const statCategories = [
    {
      title: 'Kampf',
      icon: '⚔️',
      stats: [
        { label: 'Monster besiegt', value: stats.monsters_killed, icon: '👹' },
        { label: 'Bosse besiegt', value: stats.bosses_killed, icon: '👑' },
        { label: 'Spieler besiegt', value: stats.players_killed, icon: '🎯' },
        { label: 'Tode', value: stats.deaths, icon: '💀' },
        { label: 'Schaden ausgeteilt', value: stats.total_damage_dealt?.toLocaleString(), icon: '💥' },
        { label: 'Schaden erhalten', value: stats.total_damage_received?.toLocaleString(), icon: '🩸' },
      ]
    },
    {
      title: 'Sammeln',
      icon: '🌿',
      stats: [
        { label: 'Ressourcen gesammelt', value: stats.resources_collected, icon: '📦' },
        { label: 'Holz gesammelt', value: stats.wood_collected, icon: '🪵' },
        { label: 'Stein gesammelt', value: stats.stone_collected, icon: '🪨' },
        { label: 'Eisenerz gesammelt', value: stats.iron_ore_collected, icon: '⛏️' },
        { label: 'Kräuter gesammelt', value: stats.herbs_collected, icon: '🌿' },
        { label: 'Sammelzeit (Min)', value: stats.collection_time_minutes, icon: '⏱️' },
      ]
    },
    {
      title: 'Handwerk',
      icon: '🔨',
      stats: [
        { label: 'Items gecraftet', value: stats.items_crafted, icon: '🛠️' },
        { label: 'Ausrüstung gecraftet', value: stats.equipment_crafted, icon: '⚔️' },
        { label: 'Gebäude gebaut', value: stats.buildings_built, icon: '🏠' },
        { label: 'Gebäude aufgewertet', value: stats.buildings_upgraded, icon: '⬆️' },
        { label: 'Handwerkszeit (Min)', value: stats.crafting_time_minutes, icon: '⏱️' },
      ]
    },
    {
      title: 'Reisen',
      icon: '🗺️',
      stats: [
        { label: 'Distanz gelaufen', value: stats.distance_traveled?.toLocaleString(), icon: '👣' },
        { label: 'Felder gelaufen', value: stats.tiles_walked?.toLocaleString(), icon: '🧭' },
      ]
    },
    {
      title: 'Wirtschaft',
      icon: '💰',
      stats: [
        { label: 'Gold verdient', value: stats.gold_earned?.toLocaleString(), icon: '📈' },
        { label: 'Gold ausgegeben', value: stats.gold_spent?.toLocaleString(), icon: '📉' },
        { label: 'Items verkauft', value: stats.items_sold, icon: '🏷️' },
        { label: 'Items gekauft', value: stats.items_bought, icon: '🛒' },
      ]
    },
    {
      title: 'Soziales',
      icon: '💬',
      stats: [
        { label: 'Nachrichten gesendet', value: stats.messages_sent, icon: '✉️' },
        { label: 'Trades abgeschlossen', value: stats.trades_completed, icon: '🤝' },
        { label: 'Quests abgeschlossen', value: stats.quests_completed, icon: '📜' },
        { label: 'Logins', value: stats.logins, icon: '🔐' },
      ]
    },
  ];

  return (
    <div className="statistics-page">
      <div className="statistics-header">
        <h1>📊 Statistiken</h1>
        <p className="subtitle">Deine Erfolge in Soaria</p>
      </div>

      <div className="stats-grid">
        {statCategories.map((category) => (
          <div key={category.title} className="stat-category">
            <h2>
              <span className="category-icon">{category.icon}</span>
              {category.title}
            </h2>
            <div className="stat-list">
              {category.stats.map((stat) => (
                <div key={stat.label} className="stat-item">
                  <span className="stat-icon">{stat.icon}</span>
                  <span className="stat-label">{stat.label}</span>
                  <span className="stat-value">{stat.value || 0}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="stats-footer">
        <p>Statistiken werden automatisch erfasst während du spielst.</p>
      </div>
    </div>
  );
}

export default Statistics;
