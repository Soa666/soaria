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
import SmtpManagement from '../components/admin/SmtpManagement';
import ReportsManagement from '../components/admin/ReportsManagement';
import MonsterManagement from '../components/admin/MonsterManagement';
import NpcManagement from '../components/admin/NpcManagement';
import QuestManagement from '../components/admin/QuestManagement';
import ApiManagement from '../components/admin/ApiManagement';
import FeedbackManagement from '../components/admin/FeedbackManagement';
import WebhooksManagement from '../components/admin/WebhooksManagement';
import OnlineUsers from '../components/admin/OnlineUsers';
import BuffsManagement from '../components/admin/BuffsManagement';
import PlayerInventoryManagement from '../components/admin/PlayerInventoryManagement';
import ResourceNodeManagement from '../components/admin/ResourceNodeManagement';
import './Admin.css';

const menuItems = [
  { id: 'online', icon: '🟢', label: 'Online Spieler', category: 'Übersicht' },
  { id: 'items', icon: '📦', label: 'Items', category: 'Spielinhalte' },
  { id: 'recipes', icon: '📜', label: 'Rezepte', category: 'Spielinhalte' },
  { id: 'buildings', icon: '🏠', label: 'Gebäude', category: 'Spielinhalte' },
  { id: 'quests', icon: '🗺️', label: 'Quests', category: 'Spielinhalte' },
  { id: 'monsters', icon: '👹', label: 'Monster', category: 'NPCs' },
  { id: 'npcs', icon: '🏪', label: 'Händler', category: 'NPCs' },
  { id: 'resources', icon: '⛏️', label: 'Ressourcen & Drops', category: 'Spielinhalte' },
  { id: 'users', icon: '👥', label: 'Benutzer', category: 'Verwaltung' },
  { id: 'playerinv', icon: '🎒', label: 'Spieler-Inventar', category: 'Verwaltung' },
  { id: 'groups', icon: '🛡️', label: 'Gruppen', category: 'Verwaltung' },
  { id: 'reports', icon: '🚩', label: 'Meldungen', category: 'Verwaltung' },
  { id: 'feedback', icon: '💬', label: 'Feedback', category: 'Verwaltung' },
  { id: 'buffs', icon: '✨', label: 'Buffs', category: 'Verwaltung' },
  { id: 'smtp', icon: '📧', label: 'SMTP E-Mail', category: 'System' },
  { id: 'email', icon: '📝', label: 'E-Mail Vorlagen', category: 'System' },
  { id: 'webhooks', icon: '🔔', label: 'Discord Webhooks', category: 'System' },
  { id: 'api', icon: '🔧', label: 'API & Debug', category: 'System' },
];

function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('online');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'mod')) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  if (!user || user.role !== 'admin') {
    return null;
  }

  // Group menu items by category
  const categories = menuItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const activeItem = menuItems.find(item => item.id === activeTab);

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <h2>🔧 Admin</h2>
          <button 
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>
        
        <nav className="sidebar-nav">
          {Object.entries(categories).map(([category, items]) => (
            <div key={category} className="nav-category">
              <div className="category-title">{category}</div>
              {items.map(item => (
                <button
                  key={item.id}
                  className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-user">
            <span className="admin-avatar">👤</span>
            <span className="admin-name">{user?.username}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <header className="admin-header">
          <h1>
            <span className="header-icon">{activeItem?.icon}</span>
            {activeItem?.label}
          </h1>
          <div className="header-breadcrumb">
            Admin / {activeItem?.category} / {activeItem?.label}
          </div>
        </header>

        <div className="admin-content">
          {activeTab === 'online' && <OnlineUsers />}
          {activeTab === 'items' && <ItemsManagement />}
          {activeTab === 'recipes' && <RecipesManagement />}
          {activeTab === 'users' && <UsersManagement />}
          {activeTab === 'groups' && <GroupsManagement />}
          {activeTab === 'buildings' && <BuildingsManagement />}
          {activeTab === 'smtp' && <SmtpManagement />}
          {activeTab === 'email' && <EmailManagement />}
          {activeTab === 'reports' && <ReportsManagement />}
          {activeTab === 'monsters' && <MonsterManagement />}
          {activeTab === 'npcs' && <NpcManagement />}
          {activeTab === 'resources' && <ResourceNodeManagement />}
          {activeTab === 'quests' && <QuestManagement />}
          {activeTab === 'api' && <ApiManagement />}
          {activeTab === 'feedback' && <FeedbackManagement />}
          {activeTab === 'webhooks' && <WebhooksManagement />}
          {activeTab === 'buffs' && <BuffsManagement />}
          {activeTab === 'playerinv' && <PlayerInventoryManagement />}
        </div>
      </main>
    </div>
  );
}

export default Admin;
