import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import api from '../services/api';
import './Login.css';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Login fehlgeschlagen';
      setError(errorMessage);
      
      // If account is not activated, show resend option
      if (err.response?.data?.requiresActivation) {
        setShowResend(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendActivation = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    if (!email) {
      setError('Bitte gib deine E-Mail-Adresse ein');
      return;
    }

    try {
      const response = await api.post('/auth/resend-activation', { email });
      setMessage(response.data.message);
      setShowResend(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Senden der Aktivierungs-E-Mail');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo size="large" />
        </div>
        <h1>Anmelden</h1>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        {showResend && (
          <div className="error">
            <p>Dein Konto ist noch nicht aktiviert.</p>
            <form onSubmit={handleResendActivation} style={{ marginTop: '1rem' }}>
              <div className="form-group">
                <label>E-Mail-Adresse</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Deine E-Mail-Adresse"
                />
              </div>
              <button type="submit" className="btn btn-secondary" style={{ marginRight: '0.5rem' }}>
                Aktivierungs-E-Mail erneut senden
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowResend(false)}>
                Abbrechen
              </button>
            </form>
          </div>
        )}
        {!showResend && (
          <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Benutzername oder E-Mail</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
              <Link to="/forgot-password" style={{ fontSize: '0.9rem', color: '#8b6914' }}>
                Passwort vergessen?
              </Link>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Lädt...' : 'Anmelden'}
          </button>
        </form>
        )}
        <p className="auth-link">
          Noch kein Konto? <Link to="/register">Registrieren</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
