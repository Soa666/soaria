import { useState, useEffect } from 'react';
import api from '../services/api';
import './Quests.css';

function Quests() {
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [filter, setFilter] = useState('all'); // all, available, active, completed
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchQuests();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const fetchQuests = async () => {
    try {
      const response = await api.get('/quests');
      setQuests(response.data.quests);
    } catch (error) {
      console.error('Error fetching quests:', error);
    } finally {
      setLoading(false);
    }
  };

  const acceptQuest = async (questId) => {
    try {
      const response = await api.post(`/quests/${questId}/accept`);
      setMessage(response.data.message);
      fetchQuests();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Annehmen');
    }
  };

  const claimReward = async (questId) => {
    try {
      const response = await api.post(`/quests/${questId}/claim`);
      setMessage(response.data.message);
      fetchQuests();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Abholen');
    }
  };

  const abandonQuest = async (questId) => {
    if (!confirm('Quest wirklich abbrechen?')) return;
    try {
      const response = await api.post(`/quests/${questId}/abandon`);
      setMessage(response.data.message);
      fetchQuests();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Fehler beim Abbrechen');
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      main: '📜',
      side: '📋',
      daily: '🌅',
      weekly: '📅',
      achievement: '🏆'
    };
    return icons[category] || '📜';
  };

  const getCategoryName = (category) => {
    const names = {
      main: 'Hauptquest',
      side: 'Nebenquest',
      daily: 'Tägliche Quest',
      weekly: 'Wöchentliche Quest',
      achievement: 'Erfolg'
    };
    return names[category] || category;
  };

  const getQuestStatus = (quest) => {
    if (quest.user_status === 'claimed') return 'completed';
    if (quest.user_status === 'completed') return 'claimable';
    if (quest.user_status === 'active') return 'active';
    return 'available';
  };

  const filteredQuests = quests.filter(quest => {
    const status = getQuestStatus(quest);
    if (filter === 'all') return true;
    if (filter === 'available') return status === 'available';
    if (filter === 'active') return status === 'active' || status === 'claimable';
    if (filter === 'completed') return status === 'completed';
    return true;
  });

  const getObjectiveIcon = (type) => {
    const icons = {
      kill_monster: '⚔️',
      kill_boss: '👑',
      kill_specific_monster: '🎯',
      collect_resource: '🌿',
      collect_specific_item: '📦',
      craft_item: '🔨',
      craft_specific_item: '🛠️',
      craft_equipment: '⚔️',
      build_building: '🏠',
      upgrade_building: '⬆️',
      build_specific_building: '🏗️',
      travel_distance: '👣',
      visit_location: '📍',
      reach_level: '⭐',
      earn_gold: '💰',
      spend_gold: '💸',
      complete_trade: '🤝',
      send_message: '✉️',
      defeat_player: '🎯'
    };
    return icons[type] || '📋';
  };

  if (loading) {
    return (
      <div className="quests-page">
        <div className="loading">Lädt Quests...</div>
      </div>
    );
  }

  return (
    <div className="quests-page">
      <div className="quests-header">
        <h1>📜 Quests</h1>
        <div className="quest-filters">
          <button 
            className={filter === 'all' ? 'active' : ''} 
            onClick={() => setFilter('all')}
          >
            Alle ({quests.length})
          </button>
          <button 
            className={filter === 'available' ? 'active' : ''} 
            onClick={() => setFilter('available')}
          >
            Verfügbar ({quests.filter(q => getQuestStatus(q) === 'available').length})
          </button>
          <button 
            className={filter === 'active' ? 'active' : ''} 
            onClick={() => setFilter('active')}
          >
            Aktiv ({quests.filter(q => ['active', 'claimable'].includes(getQuestStatus(q))).length})
          </button>
          <button 
            className={filter === 'completed' ? 'active' : ''} 
            onClick={() => setFilter('completed')}
          >
            Abgeschlossen ({quests.filter(q => getQuestStatus(q) === 'completed').length})
          </button>
        </div>
      </div>

      {message && <div className="quest-message">{message}</div>}

      <div className="quests-content">
        <div className="quests-list">
          {filteredQuests.length === 0 ? (
            <div className="no-quests">
              <p>Keine Quests gefunden.</p>
            </div>
          ) : (
            filteredQuests.map(quest => {
              const status = getQuestStatus(quest);
              return (
                <div 
                  key={quest.id}
                  className={`quest-card ${status} ${selectedQuest?.id === quest.id ? 'selected' : ''}`}
                  onClick={() => setSelectedQuest(quest)}
                >
                  <div className="quest-card-header">
                    <span className="quest-category">{getCategoryIcon(quest.category)}</span>
                    <h3>{quest.display_name}</h3>
                    <span className={`quest-status-badge ${status}`}>
                      {status === 'available' && 'Verfügbar'}
                      {status === 'active' && 'Aktiv'}
                      {status === 'claimable' && '✓ Fertig!'}
                      {status === 'completed' && '✓ Abgeschlossen'}
                    </span>
                  </div>
                  
                  {status === 'active' && (
                    <div className="quest-progress-bar">
                      <div 
                        className="progress-fill"
                        style={{ width: `${(quest.completed_objectives / quest.total_objectives) * 100}%` }}
                      />
                      <span className="progress-text">
                        {quest.completed_objectives}/{quest.total_objectives}
                      </span>
                    </div>
                  )}

                  <div className="quest-rewards-preview">
                    {quest.reward_gold > 0 && <span>💰 {quest.reward_gold}</span>}
                    {quest.reward_experience > 0 && <span>⭐ {quest.reward_experience} XP</span>}
                    {quest.reward_item_name && <span>📦 {quest.reward_item_name}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {selectedQuest && (
          <div className="quest-details">
            <div className="quest-details-header">
              <span className="category-badge">{getCategoryName(selectedQuest.category)}</span>
              <h2>{selectedQuest.display_name}</h2>
              {selectedQuest.min_level > 1 && (
                <span className="level-req">Ab Level {selectedQuest.min_level}</span>
              )}
            </div>

            {selectedQuest.description && (
              <p className="quest-description">{selectedQuest.description}</p>
            )}

            <div className="quest-objectives">
              <h3>📋 Aufgaben</h3>
              {selectedQuest.objectives?.map((obj, idx) => (
                <div 
                  key={idx} 
                  className={`objective ${obj.is_completed ? 'completed' : ''}`}
                >
                  <span className="obj-icon">{getObjectiveIcon(obj.objective_type)}</span>
                  <span className="obj-text">
                    {obj.description || `${obj.target_name || obj.objective_type}`}
                  </span>
                  <span className="obj-progress">
                    {obj.current_amount}/{obj.required_amount}
                  </span>
                  {obj.is_completed && <span className="obj-check">✓</span>}
                </div>
              ))}
            </div>

            <div className="quest-rewards">
              <h3>🎁 Belohnungen</h3>
              <div className="rewards-list">
                {selectedQuest.reward_gold > 0 && (
                  <div className="reward-item">
                    <span className="reward-icon">💰</span>
                    <span>{selectedQuest.reward_gold} Gold</span>
                  </div>
                )}
                {selectedQuest.reward_experience > 0 && (
                  <div className="reward-item">
                    <span className="reward-icon">⭐</span>
                    <span>{selectedQuest.reward_experience} Erfahrung</span>
                  </div>
                )}
                {selectedQuest.reward_item_name && (
                  <div className="reward-item">
                    {selectedQuest.reward_item_image && (
                      <img src={`/items/${selectedQuest.reward_item_image}`} alt="" className="reward-img" />
                    )}
                    <span>{selectedQuest.reward_item_quantity}x {selectedQuest.reward_item_name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="quest-actions">
              {getQuestStatus(selectedQuest) === 'available' && (
                <>
                  {!selectedQuest.prerequisite_completed && (
                    <p className="prereq-warning">⚠️ Voraussetzung: {selectedQuest.prerequisite_name}</p>
                  )}
                  <button 
                    className="btn-accept"
                    onClick={() => acceptQuest(selectedQuest.id)}
                    disabled={!selectedQuest.prerequisite_completed}
                  >
                    Quest annehmen
                  </button>
                </>
              )}
              {getQuestStatus(selectedQuest) === 'active' && (
                <button 
                  className="btn-abandon"
                  onClick={() => abandonQuest(selectedQuest.id)}
                >
                  Quest abbrechen
                </button>
              )}
              {getQuestStatus(selectedQuest) === 'claimable' && (
                <button 
                  className="btn-claim"
                  onClick={() => claimReward(selectedQuest.id)}
                >
                  🎁 Belohnung abholen
                </button>
              )}
              {getQuestStatus(selectedQuest) === 'completed' && (
                <p className="completed-text">✓ Quest abgeschlossen am {new Date(selectedQuest.claimed_at).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Quests;
