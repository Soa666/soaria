import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './GuildDetail.css';

function GuildDetail() {
  const { guildId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [guild, setGuild] = useState(null);
  const [members, setMembers] = useState([]);
  const [pacts, setPacts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [incomingPacts, setIncomingPacts] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('members');
  const [allGuilds, setAllGuilds] = useState([]);

  useEffect(() => {
    fetchGuildData();
  }, [guildId]);

  const fetchGuildData = async () => {
    try {
      const response = await api.get(`/guilds/${guildId}`);
      setGuild(response.data.guild);
      setMembers(response.data.members || []);
      setPacts(response.data.pacts || []);
      setUserRole(response.data.userRole);
      setIsMember(response.data.isMember);

      // If user is leader or officer, fetch applications
      if (response.data.userRole === 'leader' || response.data.userRole === 'officer') {
        const appsResponse = await api.get(`/guilds/${guildId}/applications`);
        setApplications(appsResponse.data.applications || []);
      }

      // If user is leader, fetch incoming pacts and all guilds
      if (response.data.userRole === 'leader') {
        const [pactsRes, guildsRes] = await Promise.all([
          api.get(`/guilds/${guildId}/pacts/incoming`),
          api.get('/guilds')
        ]);
        setIncomingPacts(pactsRes.data.pacts || []);
        setAllGuilds(guildsRes.data.guilds || []);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Gilde:', error);
      if (error.response?.status === 404) {
        navigate('/guilds');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReviewApplication = async (applicationId, status) => {
    try {
      const response = await api.put(`/guilds/${guildId}/applications/${applicationId}`, { status });
      setMessage(response.data.message);
      fetchGuildData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Bearbeiten');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handlePromote = async (userId, newRole) => {
    try {
      await api.put(`/guilds/${guildId}/members/${userId}/role`, { role: newRole });
      setMessage(`Rolle geändert auf ${newRole === 'officer' ? 'Offizier' : 'Mitglied'}`);
      fetchGuildData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Ändern der Rolle');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleKick = async (userId, username) => {
    if (!confirm(`Möchtest du ${username} wirklich aus der Gilde entfernen?`)) return;
    
    try {
      await api.delete(`/guilds/${guildId}/members/${userId}`);
      setMessage(`${username} wurde entfernt`);
      fetchGuildData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Entfernen');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Möchtest du die Gilde wirklich verlassen?')) return;
    
    try {
      await api.post(`/guilds/${guildId}/leave`);
      setMessage('Du hast die Gilde verlassen');
      setTimeout(() => navigate('/guilds'), 1000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Verlassen');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleDisband = async () => {
    if (!confirm('Möchtest du die Gilde wirklich AUFLÖSEN? Dies kann nicht rückgängig gemacht werden!')) return;
    
    try {
      await api.delete(`/guilds/${guildId}`);
      setMessage('Gilde aufgelöst');
      setTimeout(() => navigate('/guilds'), 1000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Auflösen');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleTransferLeadership = async (newLeaderId) => {
    const member = members.find(m => m.id === newLeaderId);
    if (!confirm(`Möchtest du die Gildenführung an ${member?.username} übertragen?`)) return;
    
    try {
      await api.post(`/guilds/${guildId}/transfer-leadership`, { newLeaderId });
      setMessage('Gildenführung übertragen');
      fetchGuildData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Übertragen');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleRequestPact = async (targetGuildId) => {
    try {
      const response = await api.post(`/guilds/${guildId}/pacts`, { targetGuildId });
      setMessage(response.data.message);
      fetchGuildData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler bei Paktanfrage');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleRespondToPact = async (pactId, status) => {
    try {
      const response = await api.put(`/guilds/${guildId}/pacts/${pactId}`, { status });
      setMessage(response.data.message);
      fetchGuildData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler bei Paktantwort');
      setTimeout(() => setError(''), 5000);
    }
  };

  const handleCancelPact = async (pactId) => {
    if (!confirm('Möchtest du diesen Pakt wirklich beenden?')) return;
    
    try {
      await api.delete(`/guilds/${guildId}/pacts/${pactId}`);
      setMessage('Pakt beendet');
      fetchGuildData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setError(error.response?.data?.error || 'Fehler beim Beenden');
      setTimeout(() => setError(''), 5000);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="loading">Lädt Gilde...</div>
        </div>
      </div>
    );
  }

  if (!guild) {
    return (
      <div className="container">
        <div className="card">
          <p>Gilde nicht gefunden</p>
          <Link to="/guilds">Zurück zur Übersicht</Link>
        </div>
      </div>
    );
  }

  const pendingApps = applications.filter(a => a.status === 'pending');
  const otherGuilds = allGuilds.filter(g => 
    g.id !== parseInt(guildId) && 
    !pacts.some(p => p.guild_1_id === g.id || p.guild_2_id === g.id)
  );

  return (
    <div className="container">
      <div className="card">
        {/* Header */}
        <div className="guild-detail-header">
          <div className="guild-info">
            <h1>
              <span className="guild-tag">[{guild.tag}]</span> {guild.name}
            </h1>
            {guild.description && <p className="guild-description">{guild.description}</p>}
            <div className="guild-stats">
              <span>👥 {members.length} Mitglieder</span>
              <span>👑 {guild.leader_name}</span>
              <span>📅 {new Date(guild.created_at).toLocaleDateString('de-DE')}</span>
            </div>
          </div>
          {isMember && (
            <div className="guild-actions">
              {userRole === 'leader' ? (
                <>
                  <button className="btn btn-danger" onClick={handleDisband}>
                    Gilde auflösen
                  </button>
                </>
              ) : (
                <button className="btn btn-danger" onClick={handleLeave}>
                  Gilde verlassen
                </button>
              )}
            </div>
          )}
        </div>

        {message && <div className="success">{message}</div>}
        {error && <div className="error">{error}</div>}

        {/* Tabs */}
        <div className="guild-tabs">
          <button 
            className={`tab ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            Mitglieder ({members.length})
          </button>
          <button 
            className={`tab ${activeTab === 'pacts' ? 'active' : ''}`}
            onClick={() => setActiveTab('pacts')}
          >
            Pakte ({pacts.length})
          </button>
          {(userRole === 'leader' || userRole === 'officer') && (
            <button 
              className={`tab ${activeTab === 'applications' ? 'active' : ''}`}
              onClick={() => setActiveTab('applications')}
            >
              Bewerbungen {pendingApps.length > 0 && <span className="badge">{pendingApps.length}</span>}
            </button>
          )}
          {userRole === 'leader' && (
            <button 
              className={`tab ${activeTab === 'management' ? 'active' : ''}`}
              onClick={() => setActiveTab('management')}
            >
              Verwaltung
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="members-list">
              {members.map(member => (
                <div key={member.id} className={`member-card role-${member.role}`}>
                  <div className="member-avatar">
                    {member.avatar_path ? (
                      <div 
                        className="avatar-sprite"
                        style={{
                          backgroundImage: `url(/chars/${member.avatar_path})`,
                          backgroundPosition: 'center 0',
                          backgroundSize: '300%',
                        }}
                      />
                    ) : (
                      <div className="avatar-placeholder">👤</div>
                    )}
                  </div>
                  <div className="member-info">
                    <span className="member-name">{member.username}</span>
                    <span className={`member-role role-${member.role}`}>
                      {member.role === 'leader' && '👑 Anführer'}
                      {member.role === 'officer' && '⚔️ Offizier'}
                      {member.role === 'member' && '🛡️ Mitglied'}
                    </span>
                  </div>
                  {userRole === 'leader' && member.id !== user?.id && (
                    <div className="member-actions">
                      {member.role === 'member' && (
                        <button 
                          className="btn btn-small"
                          onClick={() => handlePromote(member.id, 'officer')}
                        >
                          Zum Offizier
                        </button>
                      )}
                      {member.role === 'officer' && (
                        <button 
                          className="btn btn-small"
                          onClick={() => handlePromote(member.id, 'member')}
                        >
                          Degradieren
                        </button>
                      )}
                      {member.role !== 'leader' && (
                        <button 
                          className="btn btn-small btn-danger"
                          onClick={() => handleKick(member.id, member.username)}
                        >
                          Kicken
                        </button>
                      )}
                    </div>
                  )}
                  {userRole === 'officer' && member.role === 'member' && member.id !== user?.id && (
                    <div className="member-actions">
                      <button 
                        className="btn btn-small btn-danger"
                        onClick={() => handleKick(member.id, member.username)}
                      >
                        Kicken
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pacts Tab */}
          {activeTab === 'pacts' && (
            <div className="pacts-section">
              {/* Incoming Pact Requests (Leader only) */}
              {userRole === 'leader' && incomingPacts.length > 0 && (
                <div className="incoming-pacts">
                  <h3>📨 Eingehende Paktanfragen</h3>
                  {incomingPacts.map(pact => (
                    <div key={pact.id} className="pact-request">
                      <span>[{pact.requesting_guild_tag}] {pact.requesting_guild_name}</span>
                      <span className="requested-by">von {pact.requested_by_name}</span>
                      <div className="pact-actions">
                        <button 
                          className="btn btn-small btn-success"
                          onClick={() => handleRespondToPact(pact.id, 'active')}
                        >
                          Annehmen
                        </button>
                        <button 
                          className="btn btn-small btn-danger"
                          onClick={() => handleRespondToPact(pact.id, 'rejected')}
                        >
                          Ablehnen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Active Pacts */}
              <h3>🤝 Aktive Nichtangriffspakte</h3>
              {pacts.length === 0 ? (
                <p className="no-pacts">Keine aktiven Pakte</p>
              ) : (
                <div className="pacts-list">
                  {pacts.map(pact => {
                    const otherGuild = pact.guild_1_id === parseInt(guildId) 
                      ? { name: pact.guild_2_name, tag: pact.guild_2_tag }
                      : { name: pact.guild_1_name, tag: pact.guild_1_tag };
                    return (
                      <div key={pact.id} className="pact-card">
                        <span className="pact-guild">[{otherGuild.tag}] {otherGuild.name}</span>
                        <span className="pact-status">✓ Aktiv</span>
                        {userRole === 'leader' && (
                          <button 
                            className="btn btn-small btn-danger"
                            onClick={() => handleCancelPact(pact.id)}
                          >
                            Beenden
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Request New Pact (Leader only) */}
              {userRole === 'leader' && otherGuilds.length > 0 && (
                <div className="request-pact">
                  <h3>📤 Pakt anfragen</h3>
                  <div className="guilds-for-pact">
                    {otherGuilds.map(g => (
                      <div key={g.id} className="pact-target">
                        <span>[{g.tag}] {g.name}</span>
                        <button 
                          className="btn btn-small"
                          onClick={() => handleRequestPact(g.id)}
                        >
                          Pakt anfragen
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Applications Tab */}
          {activeTab === 'applications' && (userRole === 'leader' || userRole === 'officer') && (
            <div className="applications-section">
              <h3>Offene Bewerbungen</h3>
              {pendingApps.length === 0 ? (
                <p className="no-applications">Keine offenen Bewerbungen</p>
              ) : (
                <div className="applications-list">
                  {pendingApps.map(app => (
                    <div key={app.id} className="application-card">
                      <div className="applicant-info">
                        <span className="applicant-name">{app.username}</span>
                        <span className="applicant-date">
                          Beworben am {new Date(app.created_at).toLocaleDateString('de-DE')}
                        </span>
                        {app.message && <p className="applicant-message">"{app.message}"</p>}
                      </div>
                      <div className="application-actions">
                        <button 
                          className="btn btn-success"
                          onClick={() => handleReviewApplication(app.id, 'accepted')}
                        >
                          Annehmen
                        </button>
                        <button 
                          className="btn btn-danger"
                          onClick={() => handleReviewApplication(app.id, 'rejected')}
                        >
                          Ablehnen
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Management Tab */}
          {activeTab === 'management' && userRole === 'leader' && (
            <div className="management-section">
              <h3>Gildenführung übertragen</h3>
              <p className="warning-text">
                ⚠️ Wenn du die Führung überträgst, wirst du zum Offizier degradiert.
              </p>
              <div className="transfer-list">
                {members.filter(m => m.id !== user?.id).map(member => (
                  <div key={member.id} className="transfer-option">
                    <span>{member.username} ({member.role})</span>
                    <button 
                      className="btn btn-small"
                      onClick={() => handleTransferLeadership(member.id)}
                    >
                      Führung übertragen
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Link to="/guilds" className="back-link">← Zurück zur Gildenübersicht</Link>
      </div>
    </div>
  );
}

export default GuildDetail;
