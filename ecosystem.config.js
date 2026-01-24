module.exports = {
  apps: [
    {
      name: 'realmultillm-nextjs',
      script: 'npm start',
      cwd: './',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'realmultillm-python',
      script: 'uvicorn src.core.main:app --host 127.0.0.1 --port 8008 --reload',
      interpreter: 'python3',
      cwd: './',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};