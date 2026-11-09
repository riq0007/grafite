import { UserCog } from 'lucide-react';
import { CHAVE_DOS_RESUMOS } from '../../relacoes/resumos.ts';
import { definirModulo } from '../tipos.ts';
import { CHAVE_DO_BACKUP } from './backup/Backup.tsx';
import { ENTRADAS_DA_ADMINISTRACAO, provedorDePessoas } from './busca.ts';
import { CHAVE_DOS_COLETORES } from './coletores/consultas.ts';
import { CHAVE_DO_DIRETORIO } from './diretorio/consultas.ts';
import { CHAVE_DO_FORNECEDOR, CHAVE_DOS_FORNECEDORES } from './fornecedores/consultas.ts';
import { NovoFornecedorNaAba } from './fornecedores/NovoFornecedorNaAba.tsx';
import { NovoLocalNaAba } from './locais/NovoLocalNaAba.tsx';
import { CHAVE_DOS_MODULOS } from './modulos/Modulos.tsx';
import { NovaPessoa } from './pessoas/NovaPessoa.tsx';
import { rotasDaAdministracao } from './rotas.tsx';
import { SECOES } from './secoes.ts';
import { CHAVE_DAS_TAREFAS } from './tarefas/Tarefas.tsx';

/**
 * A Administração no registro (spec modulo-administracao): para quem tem ao menos a permissão de
 * uma das seções, com o menu de cada seção só para quem a pode usar. No celular, fica em "Mais".
 * Na busca, as pessoas e as ações de cadastro, cada uma com a permissão dela. Os eventos atualizam
 * as listas e as fichas abertas (spec eventos-em-tempo-real).
 */
export const administracao = definirModulo({
  id: 'administracao',
  nome: 'Administração',
  icone: UserCog,
  endereco: '/administracao',
  prioridadeNoCelular: 'mais',
  rotas: rotasDaAdministracao,
  permissoes: [...new Set(SECOES.map((secao) => secao.permissao))],
  menu: SECOES.map((secao) => ({
    rotulo: secao.nome,
    destino: secao.endereco,
    permissoes: [secao.permissao],
  })),
  busca: { entradas: ENTRADAS_DA_ADMINISTRACAO, provedores: [provedorDePessoas] },
  // Os cadastros que os campos dos outros módulos abrem numa aba (change cadastro-em-abas).
  cadastros: [
    {
      alvo: 'local',
      titulo: 'Novo local',
      link: 'Cadastrar novo local',
      permissoes: ['locais.editar'],
      componente: NovoLocalNaAba,
    },
    {
      alvo: 'pessoa',
      titulo: 'Nova pessoa',
      link: 'Cadastrar nova pessoa',
      permissoes: ['pessoas.editar'],
      componente: NovaPessoa,
    },
    {
      alvo: 'fornecedor',
      titulo: 'Novo fornecedor',
      link: 'Cadastrar novo fornecedor',
      permissoes: ['fornecedores.editar'],
      componente: NovoFornecedorNaAba,
    },
  ],
  eventos: {
    // Uma pessoa, a conta ou a foto dela: as listas e a ficha, o acesso e as sessões da conta, e os
    // resumos dos cartões, que mostram a pessoa e as pessoas de cada local.
    'pessoas.mudaram': ({ alvo }) => [
      ['pessoas'],
      CHAVE_DOS_RESUMOS,
      alvo?.tipo === 'pessoa' ? ['pessoa', alvo.id] : ['pessoa'],
      ['acesso-da-conta'],
      ['sessoes-da-conta'],
    ],
    // O caminho de um local aparece nas pessoas e nos escopos do acesso.
    'locais.mudaram': () => [
      ['locais'],
      ['pessoas'],
      ['pessoa'],
      ['acesso-da-conta'],
      CHAVE_DOS_RESUMOS,
    ],
    'acessos.mudaram': () => [
      ['perfis'],
      ['perfil'],
      ['grupos'],
      ['grupo'],
      ['acesso-da-conta'],
      ['acesso'],
    ],
    // Uma tarefa entrou na lista das tarefas com falha ou saiu dela.
    'tarefas.mudaram': () => [CHAVE_DAS_TAREFAS],
    // Um backup ou um teste de restauração terminou, ou o horário deles mudou.
    'operacao.mudou': () => [CHAVE_DO_BACKUP],
    // Um módulo opcional foi ligado ou desligado.
    'modulos.mudaram': () => [CHAVE_DOS_MODULOS],
    // Um coletor foi cadastrado, alterado, inativado ou reativado, ou trocou o token.
    'coletores.mudaram': () => [CHAVE_DOS_COLETORES],
    // O diretório ou um mapeamento mudou.
    'diretorio.mudou': () => [CHAVE_DO_DIRETORIO],
    // Um fornecedor foi cadastrado, editado, inativado ou reativado: as listas, as fichas e a origem
    // da tabela dos ativos, que mostra o nome dele.
    'fornecedores.mudaram': () => [CHAVE_DOS_FORNECEDORES, CHAVE_DO_FORNECEDOR, CHAVE_DOS_RESUMOS],
  },
});
