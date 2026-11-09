import { describe, expect, it } from 'vitest';
import { type AtribuicaoParaAcesso, resolverAcesso } from '../acesso/acesso.ts';
import { type LocalDaArvore, montarArvore } from '../locais/arvore.ts';
import {
  type AlertaQueAbriu,
  type ContaParaNotificar,
  LIMITE_SEM_AGRUPAR,
  notificacoesDosAlertas,
} from './alertas.ts';

const local = (id: string, paiId: string | null): LocalDaArvore => ({
  id,
  paiId,
  nome: id,
  tipo: 'outro',
  situacao: 'ativo',
});

// jun › adm › sala ; cps
const ARVORE = montarArvore([
  local('jun', null),
  local('adm', 'jun'),
  local('sala', 'adm'),
  local('cps', null),
]);

const conta = (id: string, permissoes: string[], localId: string | null): ContaParaNotificar => {
  const atribuicao: AtribuicaoParaAcesso = {
    id: `atribuicao-${id}`,
    perfil: {
      id: `perfil-${id}`,
      nome: `Perfil de ${id}`,
      situacao: 'ativo',
      permissoes,
      todasAsPermissoes: false,
      exigeDoisPassos: false,
    },
    localId,
    encerrada: false,
    origem: { tipo: 'conta' },
  };
  return { id, acesso: resolverAcesso([atribuicao]) };
};

const ANA = conta('ana', ['alertas.ver'], null);
const BRUNO = conta('bruno', ['alertas.ver'], 'jun');
const CARLA = conta('carla', ['alertas.ver'], 'cps');
const DAVI = conta('davi', ['alertas.tratar'], 'jun');
const EVA = conta('eva', ['ativos.ver'], null);

const alerta = (dados: Partial<AlertaQueAbriu> = {}): AlertaQueAbriu => ({
  id: 'toner',
  severidade: 'critico',
  texto: 'Black Toner Cartridge em 8%',
  localId: 'sala',
  descricao: 'HP LaserJet M404 · PAT-00412',
  destino: '/ativos/impressora',
  ...dados,
});

const paraQuem = (notificacoes: { contaId: string }[]) =>
  notificacoes.map(({ contaId }) => contaId).sort();

describe('notificacoesDosAlertas', () => {
  it('notifica quem vê o alerta no local do ativo, com o texto, o ativo e o endereço', () => {
    const notificacoes = notificacoesDosAlertas([alerta()], [ANA, BRUNO, CARLA, EVA], ARVORE);
    expect(paraQuem(notificacoes)).toEqual(['ana', 'bruno']);
    expect(notificacoes.find(({ contaId }) => contaId === 'bruno')).toEqual({
      contaId: 'bruno',
      severidade: 'critico',
      titulo: 'Black Toner Cartridge em 8%',
      descricao: 'HP LaserJet M404 · PAT-00412',
      origem: 'Alertas',
      destino: '/ativos/impressora',
      alertaId: 'toner',
    });
  });

  it('a permissão que inclui ver os alertas também notifica', () => {
    const notificacoes = notificacoesDosAlertas([alerta()], [DAVI], ARVORE);
    expect(paraQuem(notificacoes)).toEqual(['davi']);
  });

  it('o alerta de um coletor, ou de um ativo sem local, só alcança a organização inteira', () => {
    const doColetor = alerta({
      id: 'coletor',
      localId: null,
      texto: 'Sem contato há 10 min',
      descricao: 'Coletor do CPD',
      destino: '/administracao/coletores/cpd',
    });
    expect(paraQuem(notificacoesDosAlertas([doColetor], [ANA, BRUNO, DAVI], ARVORE))).toEqual([
      'ana',
    ]);
  });

  it(`até ${LIMITE_SEM_AGRUPAR} alertas de uma vez, cada um tem a sua notificação`, () => {
    const cinco = ['a', 'b', 'c', 'd', 'e'].map((id) => alerta({ id, texto: `Alerta ${id}` }));
    const notificacoes = notificacoesDosAlertas(cinco, [ANA], ARVORE);
    expect(notificacoes.map(({ alertaId }) => alertaId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('mais de 5 para a mesma conta viram uma notificação só, com a severidade mais alta', () => {
    const emJundiai = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      alerta({ id, severidade: id === 'c' ? 'critico' : 'atencao', texto: `Alerta ${id}` }),
    );
    const emCampinas = alerta({ id: 'g', severidade: 'info', localId: 'cps' });
    const notificacoes = notificacoesDosAlertas([...emJundiai, emCampinas], [ANA, CARLA], ARVORE);
    expect(notificacoes.filter(({ contaId }) => contaId === 'ana')).toEqual([
      {
        contaId: 'ana',
        severidade: 'critico',
        titulo: '7 alertas abertos',
        descricao: null,
        origem: 'Alertas',
        destino: '/alertas',
        alertaId: null,
      },
    ]);
    // Carla vê só o de Campinas: o agrupamento é de cada conta.
    expect(notificacoes.filter(({ contaId }) => contaId === 'carla')).toEqual([
      expect.objectContaining({ alertaId: 'g', severidade: 'info' }),
    ]);
  });

  it('sem alerta aberto, ou sem quem o veja, não há notificação', () => {
    expect(notificacoesDosAlertas([], [ANA], ARVORE)).toEqual([]);
    expect(notificacoesDosAlertas([alerta()], [EVA], ARVORE)).toEqual([]);
  });
});
