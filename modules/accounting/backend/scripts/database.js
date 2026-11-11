// Migrations use the host configuration and the accounting SQL namespace.
if(process.argv[2]&&process.argv[2]!=='migrate')throw new Error('Executeu npm run db:migrate:accounting des de l?arrel; no s?apliquen llavors Demo.');
await import('../../../../backend/src/scripts/migrateAccounting.js');
