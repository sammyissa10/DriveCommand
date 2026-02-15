import { execSync } from 'child_process';

const url = process.env.DATABASE_URL;

if (!url) {
  console.log('WARNING: No DATABASE_URL found in environment');
  console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG')).join(', ') || 'none matching');
  console.log('Skipping migrations, starting app without database...');
  process.exit(0);
}

console.log('DATABASE_URL found, running prisma migrate deploy...');

try {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
  console.log('Migrations complete');
} catch (e) {
  console.error('Migration failed:', e.message);
  console.log('Starting app anyway...');
}
