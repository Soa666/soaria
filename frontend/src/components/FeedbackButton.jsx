import { useState } from 'react';
import api from '../services/api';
import './FeedbackButton.css';

function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api.post('/feedback', {
        type,
        title,
        description,
        pageUrl: window.location.href,
        browserInfo: navigator.userAgent
      });
      
      setSubmitted(true);
      setTitle('');
      setDescription('');
      
      // Auto-close after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Fehler beim Senden');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError('');
    setSubmitted(false);
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        className="feedback-floating-btn"
        onClick={() => setIsOpen(true)}
        title="Bug melden oder Vorschlag einreichen"
      >
        <span className="feedback-icon">💬</span>
        <span className="feedback-text">Feedback</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="feedback-overlay" onClick={handleClose}>
          <div className="feedback-modal" onClick={e => e.stopPropagation()}>
            <button className="feedback-close" onClick={handleClose}>×</button>
            
            {submitted ? (
              <div className="feedback-success">
                <span className="success-icon">✅</span>
                <h3>Danke für dein Feedback!</h3>
                <p>Wir werden es uns ansehen.</p>
              </div>
            ) : (
              <>
                <h2>📝 Feedback senden</h2>
                <p className="feedback-subtitle">Hilf uns, das Spiel zu verbessern!</p>

                <form onSubmit={handleSubmit}>
                  {/* Type Selection */}
                  <div className="feedback-type-selector">
                    <button 
                      type="button"
                      className={`type-btn ${type === 'bug' ? 'active' : ''}`}
                      onClick={() => setType('bug')}
                    >
                      🐛 Bug melden
                    </button>
                    <button 
                      type="button"
                      className={`type-btn ${type === 'suggestion' ? 'active' : ''}`}
                      onClick={() => setType('suggestion')}
                    >
                      💡 Vorschlag
                    </button>
                    <button 
                      type="button"
                      className={`type-btn ${type === 'other' ? 'active' : ''}`}
                      onClick={() => setType('other')}
                    >
                      📋 Sonstiges
                    </button>
                  </div>

                  {/* Title */}
                  <div className="feedback-field">
                    <label htmlFor="feedback-title">
                      {type === 'bug' ? 'Was ist passiert?' : type === 'suggestion' ? 'Deine Idee' : 'Betreff'}
                    </label>
                    <input
                      id="feedback-title"
                      type="text"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder={type === 'bug' ? 'z.B. Button funktioniert nicht' : 'Kurze Beschreibung'}
                      required
                      maxLength={100}
                    />
                  </div>

                  {/* Description */}
                  <div className="feedback-field">
                    <label htmlFor="feedback-desc">
                      {type === 'bug' ? 'Wie kann man den Bug reproduzieren?' : 'Beschreibung'}
                    </label>
                    <textarea
                      id="feedback-desc"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder={type === 'bug' 
                        ? '1. Gehe zu...\n2. Klicke auf...\n3. Fehler erscheint' 
                        : 'Beschreibe deinen Vorschlag...'}
                      required
                      rows={4}
                      maxLength={1000}
                    />
                    <span className="char-count">{description.length}/1000</span>
                  </div>

                  {error && <div className="feedback-error">{error}</div>}

                  <button 
                    type="submit" 
                    className="feedback-submit"
                    disabled={submitting || !title.trim() || !description.trim()}
                  >
                    {submitting ? '⏳ Wird gesendet...' : '📤 Absenden'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default FeedbackButton;
