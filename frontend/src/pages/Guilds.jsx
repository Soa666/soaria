import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import './Guilds.css';

function Guilds() {
  const navigate = useNavigate();
  const [guilds, setGuilds] = useState([]);
  const [myGuild, setMyGuild] = useState(null);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', tag: '', description: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [guildRequirements, setGuildRequirements] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [guildsRes, myGuildRes, applicationsRes, requirementsRes] = await Promise.all([
        api.get('/guilds'),
        api.get('/guilds/my/guild'),
        api.get('/guilds/my/applications'),
        api.get('/guilds/requirements/create')
      ]);
      setGuilds(guildsRes.data.guilds || []);
      setMyGuild(myGuildRes.data.guild);
      setMyApplications(applicationsRes.data.applications || []);
      setGuildRequirements(requirementsRes.data);
    } catch (error) {
      console.error('Fehler beim Laden:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGuild = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      const response = await api.post('/guilds', createForm);
      setMessage(response.data.message);
      setShowCreateForm(false);
      setCreateForm({ name: '', tag: '', description: '' });
      fetchData();
      setTimeout(() => navigate(`/guilds/${response.data.guild.id}`), 1000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Erstellen der Gilde');
    }
  };

  const handleApply = async (guildId, guildName) => {
    const message = prompt(`Bewerbungsnachricht an ${guildName} (optional):`);
    if (message === null) return; // cancelled

    try {
      const response = await api.post(`/guilds/${guildId}/apply`, { message });
      setMessage(response.data.message);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler bei der Bewerbung');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCancelApplication = async (applicationId) => {
    try {
      await api.delete(`/guilds/my/applications/${applicationId}`);
      setMessage('Bewerbung zurückgezogen');
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Zurückziehen');
      setTimeout(() => setError(''), 5000);
    }
  };

  const filteredGuilds = guilds.filter(guild =>
    guild.name.toLowerCase().includes(search.toLowerCase()) ||
    guild.tag.toLowerCase().includes(search.toLowerCase())
  );

  const pendingApplications = myApplications.filter(app => app.status === 'pending');
  const hasAppliedTo = (guildId) => myApplications.some(app => app.guild_id === guildId && app.status === 'pending');

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="loading">Lädt Gilden...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h1>⚔️ Gilden</h1>

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}

        {/* My Guild Status */}
        {myGuild ? (
          <div className="my-guild-box">
            <h3>Deine Gilde</h3>
            <Link to={`/guilds/${myGuild.guild_id}`} className="my-guild-link">
              <span className="guild-tag">[{myGuild.tag}]</span>
              <span className="guild-name">{myGuild.name}</span>
              {myGuild.role === 'leader' && <span className="role-badge">👑 Anführer</span>}
              {myGuild.role === 'officer' && <span className="role-badge">⚔️ Offizier</span>}
              {myGuild.role === 'member' && <span className="role-badge">🛡️ Mitglied</span>}
            </Link>
          </div>
        ) : (
          <div className="no-guild-box">
            <p>Du bist noch in keiner Gilde.</p>
            <button 
              className="btn btn-primary"
              onClick={() => setShowCreateForm(!showCreateForm)}
            >
              {showCreateForm ? 'Abbrechen' : '🏰 Gilde gründen'}
            </button>
          </div>
        )}

        {/* Pending Applications */}
        {pendingApplications.length > 0 && (
          <div className="pending-applications">
            <h3>Deine Bewerbungen</h3>
            {pendingApplications.map(app => (
              <div key={app.id} className="application-item">
                <span>[{app.guild_tag}] {app.guild_name}</span>
                <span className="status-pending">⏳ Ausstehend</span>
                <button 
                  className="btn btn-small btn-danger"
                  onClick={() => handleCancelApplication(app.id)}
                >
                  Zurückziehen
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Create Guild Form */}
        {showCreateForm && !myGuild && (
          <div className="create-guild-section">
            {/* Requirements Display */}
            {guildRequirements && (
              <div className="guild-requirements">
                <h4>📋 Voraussetzungen zum Gründen</h4>
                
                <div className="requirements-list">
                  {/* Resources */}
                  <div className="requirement-category">
                    <h5>🎒 Benötigte Ressourcen (werden abgezogen)</h5>
                    {guildRequirements.requirements.resources.map((res, idx) => (
                      <div key={idx} className={`requirement-item ${res.fulfilled ? 'fulfilled' : 'missing'}`}>
                        <span>{res.item_name}</span>
                        <span className="requirement-values">
                          {res.current} / {res.required}
                          {res.fulfilled ? ' ✓' : ' ✗'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Buildings */}
                  <div className={`requirement-item ${guildRequirements.requirements.minBuildings.fulfilled ? 'fulfilled' : 'missing'}`}>
                    <span>🏠 Gebäude gebaut</span>
                    <span className="requirement-values">
                      {guildRequirements.requirements.minBuildings.current} / {guildRequirements.requirements.minBuildings.required}
                      {guildRequirements.requirements.minBuildings.fulfilled ? ' ✓' : ' ✗'}
                    </span>
                  </div>

                  {/* Account Age */}
                  <div className={`requirement-item ${guildRequirements.requirements.minAccountAge.fulfilled ? 'fulfilled' : 'missing'}`}>
                    <span>📅 Account-Alter (Tage)</span>
                    <span className="requirement-values">
                      {guildRequirements.requirements.minAccountAge.current} / {guildRequirements.requirements.minAccountAge.required}
                      {guildRequirements.requirements.minAccountAge.fulfilled ? ' ✓' : ' ✗'}
                    </span>
                  </div>
                </div>

                {!guildRequirements.canCreate && (
                  <div className="requirements-warning">
                    ⚠️ Du erfüllst noch nicht alle Voraussetzungen
                  </div>
                )}
              </div>
            )}

            <form className="create-guild-form" onSubmit={handleCreateGuild}>
              <h3>Neue Gilde gründen</h3>
              <div className="form-group">
                <label>Gildenname (3-30 Zeichen)</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="z.B. Die Drachenwächter"
                  minLength={3}
                  maxLength={30}
                  required
                />
              </div>
              <div className="form-group">
                <label>Tag (max. 5 Zeichen)</label>
                <input
                  type="text"
                  value={createForm.tag}
                  onChange={(e) => setCreateForm({ ...createForm, tag: e.target.value.toUpperCase().slice(0, 5) })}
                  placeholder="z.B. DW"
                  maxLength={5}
                  required
                />
              </div>
              <div className="form-group">
                <label>Beschreibung (optional)</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Beschreibe deine Gilde..."
                  rows={3}
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={guildRequirements && !guildRequirements.canCreate}
              >
                🏰 Gilde gründen
              </button>
            </form>
          </div>
        )}

        {/* Search */}
        <div className="search-bar">
          <input
            type="text"
            placeholder="Gilde suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Guild List */}
        <div className="guilds-list">
          {filteredGuilds.map(guild => (
            <div key={guild.id} className="guild-card">
              <div className="guild-header">
                <Link to={`/guilds/${guild.id}`} className="guild-title">
                  <span className="guild-tag">[{guild.tag}]</span>
                  <span className="guild-name">{guild.name}</span>
                </Link>
                <span className="member-count">👥 {guild.member_count}</span>
              </div>
              {guild.description && (
                <p className="guild-description">{guild.description}</p>
              )}
              <div className="guild-footer">
                <span className="guild-leader">👑 {guild.leader_name}</span>
                {!myGuild && !hasAppliedTo(guild.id) && (
                  <button 
                    className="btn btn-small"
                    onClick={() => handleApply(guild.id, guild.name)}
                  >
                    Bewerben
                  </button>
                )}
                {hasAppliedTo(guild.id) && (
                  <span className="already-applied">⏳ Beworben</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredGuilds.length === 0 && (
          <div className="no-results">
            {guilds.length === 0 
              ? 'Noch keine Gilden vorhanden. Gründe die erste!' 
              : 'Keine Gilden gefunden'}
          </div>
        )}
      </div>
    </div>
  );
}

export default Guilds;
