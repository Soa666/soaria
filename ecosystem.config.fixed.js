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
        JWT_SECRET: 'DEIN-GEHEIMER-JWT-SECRET-HIER-EINTRAGEN',
        FRONTEND_URL: 'https://soaria.soa666.de',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_USER: 'DEINE-EMAIL@gmail.com',
        SMTP_PASS: 'DEIN-APP-PASSWORT'
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
