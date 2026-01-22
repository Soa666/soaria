import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import db from '../database.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory of this file and load .env from backend folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Transporter cache
let transporter = null;
let lastConfig = null;

// Get active SMTP config from database
async function getActiveSmtpConfig() {
  try {
    const config = await db.get('SELECT * FROM smtp_config WHERE is_active = 1 LIMIT 1');
    return config;
  } catch (error) {
    console.error('Error loading SMTP config from database:', error);
    return null;
  }
}

// Create or update transporter based on config
async function getTransporter() {
  // First try database config
  const dbConfig = await getActiveSmtpConfig();
  
  if (dbConfig) {
    // Check if config changed
    const configKey = `${dbConfig.host}:${dbConfig.port}:${dbConfig.username}`;
    if (lastConfig !== configKey) {
      transporter = nodemailer.createTransport({
        host: dbConfig.host,
        port: dbConfig.port,
        secure: dbConfig.secure === 1,
        auth: {
          user: dbConfig.username,
          pass: dbConfig.password,
        },
      });
      lastConfig = configKey;
      console.log(`[EMAIL] Using SMTP config from database: ${dbConfig.name}`);
    }
    return { transporter, config: dbConfig };
  }
  
  // Fallback to .env config
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const configKey = `env:${process.env.SMTP_HOST}:${process.env.SMTP_USER}`;
    if (lastConfig !== configKey) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      lastConfig = configKey;
      console.log('[EMAIL] Using SMTP config from .env');
    }
    return { 
      transporter, 
      config: { 
        from_name: 'Soaria', 
        from_email: process.env.SMTP_USER 
      } 
    };
  }
  
  console.warn('[EMAIL] Keine SMTP-Konfiguration gefunden!');
  return { transporter: null, config: null };
}

export async function sendPasswordResetEmail(email, username, newPassword) {
  // Try to load template from database
  let template = null;
  try {
    template = await db.get('SELECT * FROM email_templates WHERE name = ?', ['password_reset']);
  } catch (error) {
    console.error('Error loading email template:', error);
  }

  // Use template from database or fallback to default
  let subject = 'Neues Passwort - Soaria';
  let htmlContent = '';
  let textContent = '';

  if (template) {
    subject = template.subject;
    htmlContent = template.html_content;
    textContent = template.text_content || '';
    
    // Replace template variables
    htmlContent = htmlContent.replace(/\{\{username\}\}/g, username);
    htmlContent = htmlContent.replace(/\{\{newPassword\}\}/g, newPassword);
    if (textContent) {
      textContent = textContent.replace(/\{\{username\}\}/g, username);
      textContent = textContent.replace(/\{\{newPassword\}\}/g, newPassword);
    }
  } else {
    // Fallback to default template
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, rgba(20, 15, 30, 0.95) 0%, rgba(40, 25, 50, 0.95) 100%);
          }
          .container {
            background: linear-gradient(145deg, rgba(30, 20, 40, 0.98), rgba(20, 15, 30, 0.98));
            border: 3px solid #8b6914;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          }
          h1 {
            color: #d4af37;
            text-align: center;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
          }
          p {
            color: #e8dcc0;
            margin: 15px 0;
          }
          .password-box {
            background: rgba(0, 0, 0, 0.5);
            border: 2px solid #d4af37;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          .password {
            font-size: 24px;
            font-weight: bold;
            color: #d4af37;
            font-family: monospace;
            letter-spacing: 2px;
            word-break: break-all;
          }
          .warning {
            color: #ff6b6b;
            font-weight: bold;
            margin-top: 20px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid rgba(212, 175, 55, 0.3);
            text-align: center;
            color: #8b7a5a;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔐 Passwort zurückgesetzt</h1>
          <p>Hallo ${username},</p>
          <p>du hast eine Passwort-Zurücksetzung angefordert. Wir haben dir ein neues Passwort zugewiesen:</p>
          <div class="password-box">
            <div class="password">${newPassword}</div>
          </div>
          <p class="warning">⚠️ Wichtig: Bitte ändere dieses Passwort nach dem Login in deinen Einstellungen!</p>
          <p>Du kannst dich jetzt mit deinem Benutzernamen <strong>${username}</strong> und dem neuen Passwort anmelden.</p>
          <p>Falls du keine Passwort-Zurücksetzung angefordert hast, melde dich bitte sofort bei uns.</p>
          <div class="footer">
            <p>Soaria - Fantasy RPG</p>
            <p>Dies ist eine automatische E-Mail. Bitte antworte nicht darauf.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    textContent = `
      Passwort zurückgesetzt - Soaria
      
      Hallo ${username},
      
      du hast eine Passwort-Zurücksetzung angefordert. Wir haben dir ein neues Passwort zugewiesen:
      
      ${newPassword}
      
      ⚠️ Wichtig: Bitte ändere dieses Passwort nach dem Login in deinen Einstellungen!
      
      Du kannst dich jetzt mit deinem Benutzernamen ${username} und dem neuen Passwort anmelden.
      
      Falls du keine Passwort-Zurücksetzung angefordert hast, melde dich bitte sofort bei uns.
      
      Soaria - Fantasy RPG
    `;
  }

  // Get transporter
  const { transporter: emailTransporter, config: smtpConfig } = await getTransporter();

  if (!emailTransporter || !smtpConfig) {
    console.warn('[EMAIL] Kein SMTP konfiguriert. E-Mail wird nicht gesendet.');
    console.warn('[EMAIL] Konfiguriere SMTP im Admin-Panel oder in der .env Datei.');
    return false;
  }

  const mailOptions = {
    from: `"${smtpConfig.from_name || 'Soaria'}" <${smtpConfig.from_email}>`,
    to: email,
    subject: subject,
    html: htmlContent,
    text: textContent,
  };

  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('[EMAIL] Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('[EMAIL] Error sending password reset email:', error);
    return false;
  }
}

export async function sendActivationEmail(email, username, activationToken) {
  const activationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/activate/${activationToken}`;

  // Try to load template from database
  let template = null;
  try {
    template = await db.get('SELECT * FROM email_templates WHERE name = ?', ['activation']);
  } catch (error) {
    console.error('Error loading email template:', error);
  }

  // Use template from database or fallback to default
  let subject = 'Aktiviere dein Soaria-Konto';
  let htmlContent = '';
  let textContent = '';

  if (template) {
    subject = template.subject;
    htmlContent = template.html_content;
    textContent = template.text_content || '';
    
    // Replace template variables
    htmlContent = htmlContent.replace(/\{\{username\}\}/g, username);
    htmlContent = htmlContent.replace(/\{\{activationUrl\}\}/g, activationUrl);
    if (textContent) {
      textContent = textContent.replace(/\{\{username\}\}/g, username);
      textContent = textContent.replace(/\{\{activationUrl\}\}/g, activationUrl);
    }
  } else {
    // Fallback to default template
    htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, rgba(20, 15, 30, 0.95) 0%, rgba(40, 25, 50, 0.95) 100%);
          }
          .container {
            background: linear-gradient(145deg, rgba(30, 20, 40, 0.98), rgba(20, 15, 30, 0.98));
            border: 3px solid #8b6914;
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
          }
          h1 {
            color: #d4af37;
            text-align: center;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
          }
          p {
            color: #e8dcc0;
            margin: 15px 0;
          }
          .button {
            display: inline-block;
            padding: 15px 30px;
            background: linear-gradient(135deg, #4a2c1a 0%, #6b4423 50%, #4a2c1a 100%);
            color: #d4af37;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
            border: 2px solid #8b6914;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
          }
          .button:hover {
            background: linear-gradient(135deg, #5a3c2a 0%, #7b5433 50%, #5a3c2a 100%);
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid rgba(212, 175, 55, 0.3);
            text-align: center;
            color: #8b7a5a;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏰 Willkommen bei Soaria!</h1>
          <p>Hallo ${username},</p>
          <p>vielen Dank für deine Registrierung bei Soaria! Um dein Konto zu aktivieren, klicke bitte auf den folgenden Button:</p>
          <div style="text-align: center;">
            <a href="${activationUrl}" class="button">Konto aktivieren</a>
          </div>
          <p>Oder kopiere diesen Link in deinen Browser:</p>
          <p style="word-break: break-all; color: #d4af37;">${activationUrl}</p>
          <p>Dieser Link ist 24 Stunden gültig.</p>
          <p>Falls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.</p>
          <div class="footer">
            <p>Soaria - Fantasy RPG</p>
            <p>Dies ist eine automatische E-Mail. Bitte antworte nicht darauf.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    textContent = `
      Willkommen bei Soaria!
      
      Hallo ${username},
      
      vielen Dank für deine Registrierung bei Soaria! Um dein Konto zu aktivieren, klicke bitte auf den folgenden Link:
      
      ${activationUrl}
      
      Dieser Link ist 24 Stunden gültig.
      
      Falls du dich nicht registriert hast, kannst du diese E-Mail ignorieren.
      
      Soaria - Fantasy RPG
    `;
  }

  // Get transporter
  const { transporter: emailTransporter, config: smtpConfig } = await getTransporter();

  if (!emailTransporter || !smtpConfig) {
    console.warn('[EMAIL] Kein SMTP konfiguriert. E-Mail wird nicht gesendet.');
    console.warn('[EMAIL] Konfiguriere SMTP im Admin-Panel oder in der .env Datei.');
    return false;
  }

  const mailOptions = {
    from: `"${smtpConfig.from_name || 'Soaria'}" <${smtpConfig.from_email}>`,
    to: email,
    subject: subject,
    html: htmlContent,
    text: textContent,
  };

  try {
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('[EMAIL] Activation email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('[EMAIL] Error sending activation email:', error);
    return false;
  }
}
