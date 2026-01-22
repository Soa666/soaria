import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Crafting from './pages/Crafting';
import Workbench from './pages/Workbench';
import Profile from './pages/Profile';
import Collection from './pages/Collection';
import Admin from './pages/Admin';
import Grundstueck from './pages/Grundstueck';
import Map from './pages/Map';
import Activate from './pages/Activate';
import Players from './pages/Players';
import PlayerProfile from './pages/PlayerProfile';
import Guilds from './pages/Guilds';
import GuildDetail from './pages/GuildDetail';
import Messages from './pages/Messages';
import Quests from './pages/Quests';
import Statistics from './pages/Statistics';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import FeedbackButton from './components/FeedbackButton';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="loading">Lädt...</div>;
  }
  
  return user ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <>
      {user && <Navbar />}
      {user && <FeedbackButton />}
      <Routes>
        <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />
        <Route path="/forgot-password" element={!user ? <ForgotPassword /> : <Navigate to="/dashboard" />} />
        <Route path="/activate/:token" element={<Activate />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute>
              <Inventory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/crafting"
          element={
            <ProtectedRoute>
              <Crafting />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workbench"
          element={
            <ProtectedRoute>
              <Workbench />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collection"
          element={
            <ProtectedRoute>
              <Collection />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/grundstueck"
          element={
            <ProtectedRoute>
              <Grundstueck />
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <ErrorBoundary>
                <Map />
              </ErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/players"
          element={
            <ProtectedRoute>
              <Players />
            </ProtectedRoute>
          }
        />
        <Route path="/player/:username" element={<PlayerProfile />} />
        <Route
          path="/guilds"
          element={
            <ProtectedRoute>
              <Guilds />
            </ProtectedRoute>
          }
        />
        <Route
          path="/guilds/:guildId"
          element={
            <ProtectedRoute>
              <GuildDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/messages"
          element={
            <ProtectedRoute>
              <Messages />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quests"
          element={
            <ProtectedRoute>
              <Quests />
            </ProtectedRoute>
          }
        />
        <Route
          path="/statistics"
          element={
            <ProtectedRoute>
              <Statistics />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <div className="App">
          <AppRoutes />
        </div>
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
