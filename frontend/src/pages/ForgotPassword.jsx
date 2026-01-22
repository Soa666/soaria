import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo';
import api from '../services/api';
import './Login.css';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (!email) {
      setError('Bitte gib deine E-Mail-Adresse ein');
      setLoading(false);
      return;
    }

    try {
      const response = await api.post('/auth/forgot-password', { email });
      setMessage(response.data.message);
      setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Senden der E-Mail');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo size="large" />
        </div>
        <h1>Passwort vergessen?</h1>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>E-Mail-Adresse</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Deine E-Mail-Adresse"
            />
            <p style={{ fontSize: '0.9rem', color: '#8b7a5a', marginTop: '0.5rem' }}>
              Wir senden dir ein neues Passwort per E-Mail zu.
            </p>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Lädt...' : 'Neues Passwort anfordern'}
          </button>
        </form>
        <p className="auth-link">
          <Link to="/login">Zurück zur Anmeldung</Link>
        </p>
      </div>
    </div>
  );
}

export default ForgotPassword;
