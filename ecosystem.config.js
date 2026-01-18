// Try to load .env if available (optional - values can be set directly below)
try {
  require('dotenv').config({ path: './backend/.env' });
} catch (e) {
  // dotenv not available, continue with hardcoded values
}

module.exports = {
  apps: [
    {
      name: 'soaria-backend',
      script: './backend/server.js',
      cwd: process.cwd(),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Load from .env or use fallback values
        JWT_SECRET: process.env.JWT_SECRET || 'CHANGE-THIS-SECRET-IN-PRODUCTION',
        FRONTEND_URL: process.env.FRONTEND_URL || 'https://soaria.soa666.de',
        SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
        SMTP_PORT: process.env.SMTP_PORT || '587',
        SMTP_USER: process.env.SMTP_USER || '',
        SMTP_PASS: process.env.SMTP_PASS || ''
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'soaria-frontend',
      script: 'npm',
      args: 'run preview:prod',
      cwd: './frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false
    }
  ]
};
