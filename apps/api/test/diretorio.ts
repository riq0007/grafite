// O diretório ligado ao AD em memória, para os testes de integração: a conta de serviço no Cofre, a
// configuração do diretório e os mapeamentos dos grupos do AD aos do Grafite.
import { diretorios, mapeamentosDoDiretorio, naOrganizacao, segredos } from '@grafite/db';
import { normalizarDn, normalizarTexto } from '@grafite/domain';
import { sql } from 'drizzle-orm';
import { cifrarSegredo } from '../src/cofre/cifra.ts';
import { CONTA_DE_SERVICO_SIMULADA } from '../src/diretorio/simulado.ts';
import { CHAVES_DO_COFRE_DE_TESTE } from './dependencias.ts';
import type { ApiDeTeste } from './integracao.ts';

/** Liga o diretório da organização, com cada grupo do AD (pelo DN) mapeado ao grupo do Grafite. */
export async function ligarDiretorioSimulado(
  api: ApiDeTeste,
  orgId: string,
  mapeamentos: [grupoDn: string, grupoId: string][],
) {
  await naOrganizacao(api.banco, orgId, async (tx) => {
    const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
    const segredoId = rows[0]?.id ?? '';
    await tx.insert(segredos).values({
      id: segredoId,
      orgId,
      nome: 'Conta do Grafite no AD',
      nomeNormalizado: normalizarTexto('Conta do Grafite no AD'),
      tipo: 'conta-administrativa',
      classificacao: 'equipamento',
      identificador: CONTA_DE_SERVICO_SIMULADA.usuario,
      ...cifrarSegredo({ valor: CONTA_DE_SERVICO_SIMULADA.senha }, CHAVES_DO_COFRE_DE_TESTE, {
        orgId,
        segredoId,
      }),
    });
    await tx.insert(diretorios).values({
      orgId,
      servidor: 'ldaps://dc01.empresa.local',
      baseDn: 'DC=empresa,DC=local',
      segredoId,
      atributoDoUsuario: 'sAMAccountName',
      filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
      ligado: true,
    });
    for (const [grupoDn, grupoId] of mapeamentos) {
      await tx.insert(mapeamentosDoDiretorio).values({
        orgId,
        grupoDn,
        grupoDnNormalizado: normalizarDn(grupoDn),
        grupoId,
      });
    }
  });
}
