// O papel do backup no banco do desenvolvimento (design do F2d, decisão 11): o pnpm dev o garante
// antes das migrations, com o superusuário do contêiner e a senha do .env. Um banco criado antes do
// papel o ganha aqui, com a leitura, e a senha acompanha o .env.
// Uso: node --env-file=.env packages/db/scripts/papel-do-backup.ts
import { garantirPapelDoBackup } from '../src/papeis.ts';

const {
  GRAFITE_DB_PORT: porta,
  GRAFITE_DB_SUPERUSER_PASSWORD: senhaDoSuperusuario,
  GRAFITE_DB_BACKUP_PASSWORD: senhaDoBackup,
} = process.env;
if (!porta || !senhaDoSuperusuario || !senhaDoBackup) {
  console.error(
    'GRAFITE_DB_PORT, GRAFITE_DB_SUPERUSER_PASSWORD e GRAFITE_DB_BACKUP_PASSWORD: obrigatórias no .env',
  );
  process.exit(1);
}
await garantirPapelDoBackup(
  `postgres://postgres:${encodeURIComponent(senhaDoSuperusuario)}@localhost:${porta}/grafite`,
  senhaDoBackup,
);
console.log('Papel do backup garantido.');
