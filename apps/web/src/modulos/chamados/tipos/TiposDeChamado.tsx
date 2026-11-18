// Os tipos de chamado (spec tipos-de-chamado; change chamados-da-ti, design, "A tela dos tipos
// (tarefa 5.19)"; m07): a tabela com a ordem por arraste, o editor do tipo escolhido e a prévia do
// colaborador, em três colunas que rolam sozinhas, para quem configura os chamados.
import { avisar, Botao, Dialogo, EstadoVazio, Icone, RotuloDeSituacao } from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useBlocker, useNavigate, useSearch } from '@tanstack/react-router';
import { EyeOff, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { useSessao } from '../../../sessao/useSessao.tsx';
import { useTiposDeAtivo } from '../../operacao/solicitacoes/escolhas.ts';
import {
  CHAVE_DOS_AJUSTES_DOS_CHAMADOS,
  CHAVE_DOS_TIPOS_DE_CHAMADO,
  useContasQueAtendem,
  useTiposDeChamado,
} from '../consultas.ts';
import { PERMISSOES_DE_CONFIGURAR } from '../permissoes.ts';
import { GradeDosTipos } from '../previa/GradeDosTipos.tsx';
import { TelaDaAba } from '../previa/TelaDaAba.tsx';
import { TelaDosChamados } from '../TelaDosChamados.tsx';
import { EditorDoTipo } from './EditorDoTipo.tsx';
import {
  type EdicaoDoTipo,
  edicaoDoTipo,
  errosDoTipo,
  errosQueValem,
  fraseDosAbertos,
  mudouOTipo,
  notasDaPrevia,
  pedidoDoTipo,
  type TipoDeChamado,
  tiposNaPrevia,
} from './edicao.ts';
import { TabelaDosTipos } from './TabelaDosTipos.tsx';
import estilos from './Tipos.module.css';

const ENDERECO = '/chamados/tipos';

/** O primeiro campo recusado, onde o foco vai depois da gravação recusada. */
const FOCAVEL = 'input:not([type="hidden"]), button, textarea';

export function TiposDeChamado() {
  return (
    <TelaDosChamados
      titulo="Tipos de chamado"
      permissoes={PERMISSOES_DE_CONFIGURAR}
      semAcesso="aos tipos de chamado"
    >
      <TelaDosTipos />
    </TelaDosChamados>
  );
}

/** "9 tipos", ao lado do título. */
const contagemDosTipos = (quantos: number) => (quantos === 1 ? '1 tipo' : `${quantos} tipos`);

function TelaDosTipos() {
  const idDoTitulo = useId();
  const consulta = useTiposDeChamado();
  const tipos = consulta.data?.tipos ?? null;

  let lista: React.ReactNode;
  if (consulta.isPending) {
    lista = <p className={estilos.carregando}>Carregando os tipos…</p>;
  } else if (consulta.isError && !tipos) {
    lista = (
      <EstadoVazio
        titulo={consulta.error.message}
        acao={
          <Botao
            carregando={consulta.isFetching}
            rotuloCarregando="Tentando de novo"
            onPress={() => void consulta.refetch()}
          >
            Tentar de novo
          </Botao>
        }
      />
    );
  } else if (tipos && tipos.length === 0) {
    lista = <p className={estilos.carregando}>Nenhum tipo de chamado.</p>;
  }

  return (
    <div className={estilos.tela} data-janela-inteira="rola-por-dentro">
      {tipos && tipos.length > 0 ? (
        <TiposCarregados tipos={tipos} idDoTitulo={idDoTitulo} />
      ) : (
        <section className={estilos.lista} aria-labelledby={idDoTitulo}>
          <CabecalhoDaLista idDoTitulo={idDoTitulo} quantos={null} />
          <div className={estilos.rolagemDaLista}>{lista}</div>
        </section>
      )}
    </div>
  );
}

function CabecalhoDaLista({ idDoTitulo, quantos }: { idDoTitulo: string; quantos: number | null }) {
  return (
    <div className={estilos.cabecalhoDaLista}>
      <div className={estilos.tituloDaLista}>
        <h1 id={idDoTitulo}>Tipos de chamado</h1>
        {quantos !== null && (
          <RotuloDeSituacao situacao="neutra" semIcone>
            {contagemDosTipos(quantos)}
          </RotuloDeSituacao>
        )}
      </div>
      <p>
        Cada tipo tem um formulário, um prazo e quem atende. Arraste as linhas para mudar a ordem na
        aba.
      </p>
    </div>
  );
}

/** A recusa da gravação: as recusas nas chaves da tela e o tipo como estava quando foi recusado. */
interface RecusaDoTipo {
  id: string;
  erros: Record<string, string>;
  naRecusa: EdicaoDoTipo;
}

function TiposCarregados({
  tipos,
  idDoTitulo,
}: {
  tipos: readonly TipoDeChamado[];
  idDoTitulo: string;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const navegar = useNavigate();
  const busca: { tipo?: string } = useSearch({ strict: false });
  const sessao = useSessao();
  const contas = useContasQueAtendem();
  const tiposDeAtivo = useTiposDeAtivo();

  // O tipo do endereço, ou o primeiro da ordem quando não há ou quando ele não existe mais.
  const tipo = tipos.find(({ id }) => id === busca.tipo) ?? (tipos[0] as TipoDeChamado);
  // O que se escreve no tipo escolhido; sem nada escrito, o editor mostra o gravado.
  const [escrito, definirEscrito] = useState<{ id: string; edicao: EdicaoDoTipo } | null>(null);
  const edicao = escrito?.id === tipo.id ? escrito.edicao : edicaoDoTipo(tipo);
  const mudou = mudouOTipo(edicao, tipo);
  const [recusa, definirRecusa] = useState<RecusaDoTipo | null>(null);
  const erros = recusa?.id === tipo.id ? errosQueValem(recusa.erros, recusa.naRecusa, edicao) : {};
  const [salvando, definirSalvando] = useState(false);
  const [falha, definirFalha] = useState<{ texto: string | null; chave: number }>({
    texto: null,
    chave: 0,
  });
  // O tipo que a tabela escolheu com mudanças no editor, à espera da confirmação.
  const [trocaPendente, definirTrocaPendente] = useState<string | null>(null);
  const [pedidoDeFoco, definirPedidoDeFoco] = useState(0);
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pedidoDeFoco === 0) return;
    area.current?.querySelector('[data-recusado]')?.querySelector<HTMLElement>(FOCAVEL)?.focus();
  }, [pedidoDeFoco]);

  // Sair da tela com mudanças pede confirmação; trocar de tipo pede pela tabela.
  const bloqueio = useBlocker({
    shouldBlockFn: ({ next }) => mudou && next.pathname !== ENDERECO,
    enableBeforeUnload: () => mudou,
    withResolver: true,
  });

  const irPara = (id: string) => {
    definirEscrito(null);
    definirRecusa(null);
    definirFalha((anterior) => ({ texto: null, chave: anterior.chave }));
    void navegar({ to: '.', search: { tipo: id }, replace: true });
  };

  const escolher = (id: string) => {
    if (mudou) definirTrocaPendente(id);
    else irPara(id);
  };

  async function reordenarOsTipos(ids: string[]) {
    const anterior = consultas.getQueryData<{ tipos: TipoDeChamado[] }>(CHAVE_DOS_TIPOS_DE_CHAMADO);
    // A ordem nova aparece na hora; a resposta da API fica no lugar dela.
    if (anterior) {
      const porId = new Map(anterior.tipos.map((cada) => [cada.id, cada]));
      consultas.setQueryData(CHAVE_DOS_TIPOS_DE_CHAMADO, {
        tipos: ids.flatMap((id) => porId.get(id) ?? []),
      });
    }
    const resultado = await pedir(
      () => api.PUT('/chamados/tipos/ordem', { body: { ids } }),
      'mudar a ordem dos tipos',
    );
    if ('erro' in resultado) {
      await consultas.invalidateQueries({ queryKey: CHAVE_DOS_TIPOS_DE_CHAMADO });
      avisar({
        situacao: 'critico',
        titulo: 'A ordem não mudou.',
        descricao: resultado.problema?.campos?.ids ?? resultado.erro,
      });
      return;
    }
    consultas.setQueryData(CHAVE_DOS_TIPOS_DE_CHAMADO, resultado.dados);
  }

  async function salvar() {
    if (salvando) return;
    const gravando = edicao;
    definirSalvando(true);
    try {
      const resultado = await pedir(
        () =>
          api.PUT('/chamados/tipos/{id}', {
            params: { path: { id: tipo.id } },
            body: pedidoDoTipo(gravando),
          }),
        'salvar o tipo',
      );
      if ('erro' in resultado) {
        const campos = resultado.problema?.campos;
        if (campos && Object.keys(campos).length > 0) {
          definirRecusa({ id: tipo.id, erros: errosDoTipo(campos), naRecusa: gravando });
          definirFalha((anterior) => ({ texto: null, chave: anterior.chave + 1 }));
          definirPedidoDeFoco((anterior) => anterior + 1);
        } else {
          definirRecusa(null);
          definirFalha((anterior) => ({ texto: resultado.erro, chave: anterior.chave + 1 }));
        }
        return;
      }
      consultas.setQueryData<{ tipos: TipoDeChamado[] }>(CHAVE_DOS_TIPOS_DE_CHAMADO, (atual) =>
        atual
          ? {
              tipos: atual.tipos.map((cada) =>
                cada.id === resultado.dados.id ? resultado.dados : cada,
              ),
            }
          : atual,
      );
      // A gaveta da abertura e o resto dos ajustes leem o tipo novo.
      void consultas.invalidateQueries({ queryKey: CHAVE_DOS_AJUSTES_DOS_CHAMADOS });
      definirEscrito(null);
      definirRecusa(null);
      definirFalha((anterior) => ({ texto: null, chave: anterior.chave }));
      avisar({ situacao: 'sucesso', titulo: 'Tipo salvo.' });
    } finally {
      definirSalvando(false);
    }
  }

  const descartar = () => {
    definirEscrito(null);
    definirRecusa(null);
    definirFalha((anterior) => ({ texto: null, chave: anterior.chave }));
  };

  const editado = { id: tipo.id, edicao };
  const notas = notasDaPrevia(tipos, editado);
  const nomeDaConta = sessao.tipo === 'ativa' ? sessao.conta.nome : '';
  const confirmando = trocaPendente !== null || bloqueio.status === 'blocked';
  const continuar = () => {
    definirTrocaPendente(null);
    if (bloqueio.status === 'blocked') bloqueio.reset();
  };
  const descartarESeguir = () => {
    if (trocaPendente !== null) {
      const id = trocaPendente;
      definirTrocaPendente(null);
      irPara(id);
      return;
    }
    if (bloqueio.status === 'blocked') bloqueio.proceed();
  };

  return (
    <>
      <section className={estilos.lista} aria-labelledby={idDoTitulo}>
        <CabecalhoDaLista idDoTitulo={idDoTitulo} quantos={tipos.length} />
        <div className={estilos.rolagemDaLista}>
          <TabelaDosTipos
            tipos={tipos}
            idDoTitulo={idDoTitulo}
            escolhido={tipo.id}
            aoEscolher={escolher}
            aoReordenar={(ids) => void reordenarOsTipos(ids)}
          />
        </div>
        <div className={estilos.peDaLista}>
          <span>{fraseDosAbertos(tipos)}</span>
          <span>Sem responsável por padrão, o chamado cai na triagem.</span>
        </div>
      </section>

      <EditorDoTipo
        tipo={tipo}
        edicao={edicao}
        aoMudar={(nova) => definirEscrito({ id: tipo.id, edicao: nova })}
        erros={erros}
        contas={{
          lista: contas.data?.contas ?? [],
          falha: contas.isError ? contas.error.message : null,
        }}
        tiposDeAtivo={{
          lista: tiposDeAtivo.data ?? [],
          falha: tiposDeAtivo.isError ? tiposDeAtivo.error.message : null,
        }}
        mudou={mudou}
        salvando={salvando}
        falha={falha}
        aoDescartar={descartar}
        aoSalvar={() => void salvar()}
        area={area}
      />

      <aside className={estilos.previa} aria-labelledby={`${idDoTitulo}-previa`}>
        <h2 id={`${idDoTitulo}-previa`}>Como o colaborador vê</h2>
        <p>Na aba, em Abrir chamado. Mudou o nome, o ícone ou a frase, a prévia muda junto.</p>
        <TelaDaAba
          rotulo="A aba do colaborador"
          trilha={['Aba', 'Abrir chamado']}
          passo="1 de 3"
          quem={nomeDaConta ? { nome: nomeDaConta, voce: true } : undefined}
        >
          <GradeDosTipos tipos={tiposNaPrevia(tipos, editado)} escolhido={tipo.id} />
        </TelaDaAba>
        {notas.soDaTi && (
          <p className={estilos.nota}>
            <Icone icone={EyeOff} tamanho={14} />
            <span>{notas.soDaTi}</span>
          </p>
        )}
        {notas.abertos && (
          <p className={estilos.nota}>
            <Icone icone={TriangleAlert} tamanho={14} />
            <span>{notas.abertos}</span>
          </p>
        )}
      </aside>

      <Dialogo
        alerta
        titulo="Descartar as mudanças no tipo?"
        aberto={confirmando}
        aoMudarAberto={(aberto) => {
          if (!aberto) continuar();
        }}
        acoes={() => (
          <>
            <Botao onPress={continuar}>Continuar editando</Botao>
            <Botao nivel="destrutivo" onPress={descartarESeguir}>
              Descartar mudanças
            </Botao>
          </>
        )}
      >
        <p className={estilos.informacao}>
          As mudanças que não foram salvas saem, e o tipo continua como está gravado.
        </p>
      </Dialogo>
    </>
  );
}
