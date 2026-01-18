import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ItemsManagement from '../components/admin/ItemsManagement';
import RecipesManagement from '../components/admin/RecipesManagement';
import UsersManagement from '../components/admin/UsersManagement';
import GroupsManagement from '../components/admin/GroupsManagement';
import BuildingsManagement from '../components/admin/BuildingsManagement';
import EmailManagement from '../components/admin/EmailManagement';
import ReportsManagement from '../components/admin/ReportsManagement';
import './Admin.css';

function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('items');

  useEffect(() => {
    // Check if user has admin role or view_admin permission
    // For now, we check role. Later we can check permissions via API
    if (!user || (user.role !== 'admin' && user.role !== 'mod')) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  if (!user || user.role !== 'admin') {
    return null;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>🔧 Admin-Panel</h1>
        <p className="admin-subtitle">Soaria - Verwaltung</p>

        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'items' ? 'active' : ''}`}
            onClick={() => setActiveTab('items')}
          >
            Items verwalten
          </button>
          <button
            className={`admin-tab ${activeTab === 'recipes' ? 'active' : ''}`}
            onClick={() => setActiveTab('recipes')}
          >
            Rezepte verwalten
          </button>
          <button
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            User-Verwaltung
          </button>
          <button
            className={`admin-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            Gruppen-Verwaltung
          </button>
          <button
            className={`admin-tab ${activeTab === 'buildings' ? 'active' : ''}`}
            onClick={() => setActiveTab('buildings')}
          >
            Gebäude-Verwaltung
          </button>
          <button
            className={`admin-tab ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => setActiveTab('email')}
          >
            📧 E-Mail-Verwaltung
          </button>
          <button
            className={`admin-tab ${activeTab === 'reports' ? 'active' : ''}`}
            onClick={() => setActiveTab('reports')}
          >
            🚩 Meldungen
          </button>
        </div>

        <div className="admin-content">
          {activeTab === 'items' && <ItemsManagement />}
          {activeTab === 'recipes' && <RecipesManagement />}
          {activeTab === 'users' && <UsersManagement />}
          {activeTab === 'groups' && <GroupsManagement />}
          {activeTab === 'buildings' && <BuildingsManagement />}
          {activeTab === 'email' && <EmailManagement />}
          {activeTab === 'reports' && <ReportsManagement />}
        </div>
      </div>
    </div>
  );
}

export default Admin;
