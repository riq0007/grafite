// "Instalar outro pacote nesta máquina" (spec inventario-pelo-agente, "Softwares na ficha do
// ativo"; change software-por-pacote, design, decisão 13; m10): a camada sobreposta e opaca, presa
// ao cabeçalho da seção, com a busca dos pacotes ativos e a relação de cada um com a máquina, o
// quando e a distribuição de uma máquina só. O Esc e o "Cancelar" fecham, e o foco volta ao botão.
import { explicarOComando, normalizarTexto, versaoCortada } from '@grafite/domain';
import {
  avisar,
  Botao,
  CampoDeBusca,
  ControleSegmentado,
  GrupoDeRadios,
  Icone,
  Popover,
  Radio,
  RotuloDeSituacao,
  Segmento,
  type Situacao,
  useDataHora,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { CornerDownRight, Plus, Send } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { CHAVE_DO_SOFTWARE, type SoftwareDaMaquina } from './consultas.ts';
import { nomeComVersao, plural, tipoETamanho } from './formatos.ts';
import { IconeDoPacote } from './Pecas.tsx';
import estilos from './SoftwareDaMaquina.module.css';

export type PacoteParaInstalar = NonNullable<SoftwareDaMaquina['distribuir']>['pacotes'][number];

/** A máquina da ficha: o nome e a pessoa, que a camada repete no "Vai direto para esta máquina". */
export interface MaquinaDaFicha {
  id: string;
  rotulo: string;
  pessoa: string | null;
}

/**
 * A relação do pacote com a máquina; o que já está na versão ou já na fila dela, noutra distribuição
 * (decisão 10), não pode ser escolhido, e o "Já na versão" vem antes. A versão do inventário sai
 * cortada no tamanho da versão-alvo, como nas barras da ficha do pacote.
 */
function relacao(pacote: PacoteParaInstalar): { situacao: Situacao; texto: string } {
  if (pacote.situacao !== 'na-versao' && pacote.naFila) {
    return { situacao: 'neutra', texto: 'Já na fila' };
  }
  switch (pacote.situacao) {
    case 'desatualizada': {
      const versao = versaoCortada(pacote.versao, pacote.pacote.versao);
      return {
        situacao: 'atencao',
        texto: versao ? `Atualiza a ${versao}` : 'Atualiza a instalada',
      };
    }
    case 'na-versao':
      return { situacao: 'sucesso', texto: 'Já na versão' };
    case 'instalado-sem-alvo':
      return { situacao: 'neutra', texto: 'Já instalado' };
    default:
      return { situacao: 'neutra', texto: 'Não instalado' };
  }
}

/** Os pacotes com o nome e a versão que têm o termo da busca. */
function filtrar(pacotes: readonly PacoteParaInstalar[], busca: string) {
  const termo = normalizarTexto(busca.trim());
  if (!termo) return pacotes;
  return pacotes.filter(({ pacote }) => normalizarTexto(nomeComVersao(pacote)).includes(termo));
}

export function InstalarNaMaquina({
  maquina,
  pacotes,
  semContato,
  ancora,
  botao,
  aoInstalar,
  nivel,
}: {
  maquina: MaquinaDaFicha;
  pacotes: readonly PacoteParaInstalar[];
  /** O agente sem contato: o pedido fica na fila até a máquina voltar, e o aviso diz isso. */
  semContato: boolean;
  /** O cabeçalho da seção, de ponta a ponta: a camada abre logo abaixo dele, na largura dele. */
  ancora: RefObject<HTMLDivElement | null>;
  /**
   * A referência do botão, que a aba guarda: o primeiro mandado leva o botão dos instalados aos
   * mandados, e a aba põe o foco no que ficou no lugar.
   */
  botao: RefObject<HTMLButtonElement | null>;
  /** O pedido saiu: a aba espera os dados novos chegarem à tela para cuidar do foco. */
  aoInstalar: () => void;
  nivel: 'primario' | 'secundario';
}) {
  const [aberta, definirAberta] = useState(false);
  return (
    <>
      <Botao ref={botao} nivel={nivel} icone={Plus} onPress={() => definirAberta(true)}>
        Instalar outro pacote nesta máquina
      </Botao>
      <Popover
        titulo="Instalar outro pacote nesta máquina"
        ocultarTitulo
        opaco
        ancora={ancora}
        aberto={aberta}
        aoMudarAberto={definirAberta}
        posicao="bottom start"
      >
        <Camada
          maquina={maquina}
          pacotes={pacotes}
          semContato={semContato}
          aoInstalar={aoInstalar}
          aoFechar={() => definirAberta(false)}
        />
      </Popover>
    </>
  );
}

function Camada({
  maquina,
  pacotes,
  semContato,
  aoInstalar,
  aoFechar,
}: {
  maquina: MaquinaDaFicha;
  pacotes: readonly PacoteParaInstalar[];
  semContato: boolean;
  aoInstalar: () => void;
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const { fuso } = useDataHora();
  const [busca, definirBusca] = useState('');
  const [escolhido, definirEscolhido] = useState<string | null>(null);
  const [quando, definirQuando] = useState<'agora' | 'noite'>('agora');
  const [enviando, definirEnviando] = useState(false);
  const [recusa, definirRecusa] = useState<string | null>(null);
  const achados = filtrar(pacotes, busca);
  const pacote = pacotes.find((um) => um.pacote.id === escolhido)?.pacote ?? null;

  /** A busca que esconde o escolhido tira a escolha: o que não está na tela não vai ser instalado. */
  function buscar(texto: string) {
    definirBusca(texto);
    if (escolhido && !filtrar(pacotes, texto).some((um) => um.pacote.id === escolhido)) {
      definirEscolhido(null);
    }
  }

  function escolher(id: string | null) {
    definirEscolhido(id);
    definirRecusa(null);
  }

  async function instalar() {
    if (!pacote) return;
    definirEnviando(true);
    definirRecusa(null);
    const resultado = await pedir(
      () =>
        api.POST('/software/distribuicoes', {
          body: {
            pacoteId: pacote.id,
            alvo: { locais: [], visoes: [], ativoIds: [maquina.id], lista: '', fora: [], fuso },
            quando,
            aPartirDe: null,
            fuso,
          },
        }),
      'instalar o pacote nesta máquina',
    );
    definirEnviando(false);
    if ('erro' in resultado) {
      const { campos } = recusaDe<'alvo' | 'pacoteId'>(resultado);
      definirRecusa(campos?.alvo ?? campos?.pacoteId ?? resultado.erro);
      return;
    }
    avisar({
      situacao: 'sucesso',
      titulo: semContato
        ? `${nomeComVersao(pacote)}: o pedido foi para ${maquina.rotulo} e fica na fila até ela voltar.`
        : `${nomeComVersao(pacote)}: o pedido foi para ${maquina.rotulo}.`,
    });
    aoInstalar();
    aoFechar();
    void consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
  }

  return (
    <div className={estilos.camada}>
      <CampoDeBusca
        rotulo="Procurar na base"
        autoComplete="off"
        // A camada abre para procurar: o foco vai direto ao campo.
        autoFocus
        value={busca}
        onChange={buscar}
        fim={<span role="status">{plural(achados.length, 'pacote', 'pacotes')} na base</span>}
      />
      {achados.length === 0 ? (
        <p className={estilos.nota}>
          {pacotes.length === 0 ? 'Nenhum pacote ativo na base.' : 'Nenhum pacote com esse nome.'}
        </p>
      ) : (
        // A lista rola sozinha: a busca e as ações ficam sempre à vista, com a base inteira.
        <div className={estilos.listaDaCamada}>
          <GrupoDeRadios
            rotulo="Pacotes ativos"
            ocultarRotulo
            value={escolhido}
            onChange={escolher}
            className={estilos.opcoes}
          >
            {achados.map((umPacote) => {
              const { situacao, texto } = relacao(umPacote);
              const { resumo } = explicarOComando(umPacote.pacote.comando);
              return (
                <Radio
                  key={umPacote.pacote.id}
                  value={umPacote.pacote.id}
                  isDisabled={umPacote.situacao === 'na-versao' || umPacote.naFila}
                  className={estilos.opcao}
                >
                  <IconeDoPacote nome={umPacote.pacote.nome} tamanho="p" />
                  <span className={estilos.textoDaOpcao}>
                    <b className={estilos.nomeDaOpcao}>{nomeComVersao(umPacote.pacote)}</b>
                    <span>
                      {[tipoETamanho(umPacote.pacote), resumo && `instala ${resumo}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <RotuloDeSituacao situacao={situacao}>{texto}</RotuloDeSituacao>
                </Radio>
              );
            })}
          </GrupoDeRadios>
        </div>
      )}
      <p className={estilos.vai}>
        <Icone icone={CornerDownRight} tamanho={16} />
        <span>
          <b className={estilos.forte}>Vai direto para esta máquina.</b> {maquina.rotulo}
          {maquina.pessoa ? `, ${maquina.pessoa}` : ''}: a distribuição leva só ela.
        </span>
      </p>
      {recusa && (
        <p role="alert" className={estilos.recusa}>
          {recusa}
        </p>
      )}
      <div className={estilos.acoesDaCamada}>
        {/* "QUANDO" no estilo do carimbo, como no m10; o nome do grupo vai para o leitor de tela. */}
        <span aria-hidden="true" className={estilos.rotuloDoQuando}>
          Quando
        </span>
        <ControleSegmentado
          rotulo="Quando"
          ocultarRotulo
          value={quando}
          onChange={(valor) => definirQuando(valor === 'noite' ? 'noite' : 'agora')}
        >
          <Segmento value="agora">Agora</Segmento>
          <Segmento value="noite">Janela da noite</Segmento>
        </ControleSegmentado>
        <div className={estilos.fimDaCamada}>
          <Botao aria-keyshortcuts="Escape" onPress={aoFechar}>
            Cancelar
            <span aria-hidden="true" className={estilos.tecla}>
              Esc
            </span>
          </Botao>
          <Botao
            nivel="primario"
            icone={Send}
            isDisabled={!pacote}
            carregando={enviando}
            rotuloCarregando="Enviando…"
            onPress={() => void instalar()}
          >
            {pacote ? `Instalar o ${nomeComVersao(pacote)} nesta máquina` : 'Escolha um pacote'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
