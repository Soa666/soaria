import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../services/api';
import Logo from '../components/Logo';
import './Login.css';

function Activate() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (token) {
      activateAccount();
    } else {
      setError('Kein Aktivierungstoken gefunden');
      setLoading(false);
    }
  }, [token]);

  const activateAccount = async () => {
    try {
      const response = await api.get(`/auth/activate/${token}`);
      setMessage(response.data.message);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Aktivierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const resendActivation = async () => {
    // This would need the email, but for now we'll just show a message
    setMessage('Bitte kontaktiere den Support, um eine neue Aktivierungs-E-Mail anzufordern.');
  };

  if (loading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <Logo size="large" />
          </div>
          <h1>Aktiviere dein Konto</h1>
          <p>Lädt...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo size="large" />
        </div>
        <h1>Konto aktivieren</h1>
        {error && <div className="error">{error}</div>}
        {message && <div className="success">{message}</div>}
        {!message && !error && (
          <p>Bitte warte, während dein Konto aktiviert wird...</p>
        )}
        <p className="auth-link">
          <Link to="/login">Zur Anmeldung</Link>
        </p>
      </div>
    </div>
  );
}

export default Activate;
