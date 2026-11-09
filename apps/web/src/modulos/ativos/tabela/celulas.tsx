// As células da tabela dos ativos (spec cadastro-de-ativos): cada coluna mostra o valor como a ficha
// o mostra, pelo motor de campos, com a pessoa, o local e o ativo pelo nome atual, o arquivo pelo
// nome e a imagem pela miniatura, as datas do cadastro com a hora no fuso escolhido, e "Fora do seu
// acesso" no restrito que a conta não vê ali.
import type { components } from '@grafite/api-client';
import { COLUNA_PRINCIPAL_DOS_ATIVOS, type ColunaDosAtivos, mostrarValor } from '@grafite/domain';
import { type DataHora, MiniaturaDeAtivo, RotuloDeSituacao } from '@grafite/ui';
import type { ReactNode } from 'react';
import { ReferenciaAoLocal } from '../../administracao/locais/ReferenciaAoLocal.tsx';
import { ReferenciaAPessoa } from '../../administracao/pessoas/ReferenciaAPessoa.tsx';
import estilos from '../Ativos.module.css';
import { situacaoDoAtivo } from '../cadastro/situacao.ts';
import type { AtivoNaLista } from '../consultas.ts';
import { COLUNA_DO_CONTROL_ID, ControlIdNaCelula, rotuloDoControlId } from '../control-id.tsx';
import {
  COLUNA_DA_DISPONIBILIDADE,
  DisponibilidadeNaCelula,
  rotuloDaDisponibilidade,
} from '../disponibilidade.tsx';
import { ReferenciaAoModelo } from '../modelos/ReferenciaAoModelo.tsx';
import {
  COLUNA_DAS_PAGINAS,
  COLUNA_DOS_SUPRIMENTOS,
  PaginasNaCelula,
  SuprimentosNaCelula,
  textoDasPaginas,
  textoDosSuprimentos,
} from '../suprimentos.tsx';
import { ReferenciaAoTipo } from '../tipos/ReferenciaAoTipo.tsx';

export type ReferenciasDaLista = components['schemas']['ListaDeAtivos']['referencias'];

/**
 * O nome atual de quem o valor aponta: a pessoa, o local, o ativo ou o fornecedor, com "(inativo)"
 * no inativo; ou o nome do arquivo.
 */
function nomeDoRegistro(
  tipo: string,
  id: string,
  referencias: ReferenciasDaLista,
): string | undefined {
  if (tipo === 'pessoa') return referencias.pessoas[id];
  if (tipo === 'local') return referencias.locais[id];
  if (tipo === 'ativo') return referencias.ativos[id] ?? 'Ativo fora do seu acesso';
  if (tipo === 'fornecedor') return referencias.fornecedores[id];
  if (tipo === 'arquivo' || tipo === 'imagem') return referencias.arquivos[id]?.nome;
  return undefined;
}

/** A coluna de um campo restrito num ativo onde a conta não vê os restritos. */
export const foraDoAcesso = (coluna: ColunaDosAtivos, ativo: AtivoNaLista) =>
  coluna.restrita === true && !ativo.permite.verRestritos;

/**
 * O valor da coluna no ativo, em texto, como a tabela o mostra; nulo quando vazio ou fora do acesso.
 * É o que se copia e o que o resumo e a prévia mostram.
 */
export function textoDaCelula(
  coluna: ColunaDosAtivos,
  ativo: AtivoNaLista,
  referencias: ReferenciasDaLista,
  dataHora: DataHora,
): string | null {
  if (foraDoAcesso(coluna, ativo)) return null;
  switch (coluna.chave) {
    case COLUNA_PRINCIPAL_DOS_ATIVOS:
      return ativo.rotulo;
    case 'ativo.tipo':
      return ativo.tipo.nome;
    case 'ativo.modelo':
      return ativo.modelo ? `${ativo.modelo.fabricante} ${ativo.modelo.nome}` : null;
    case 'ativo.situacao':
      return situacaoDoAtivo(ativo).texto;
    case 'ativo.patrimonio':
      return ativo.patrimonio;
    case 'ativo.serie':
      return ativo.serie;
    case 'ativo.hostname':
      return ativo.hostname;
    case 'ativo.local':
      return ativo.local?.caminho ?? null;
    case 'ativo.responsavel':
      return ativo.responsavel?.nome ?? null;
    case 'ativo.criado-em':
      return dataHora.formatarDataEHora(new Date(ativo.criadoEm));
    case 'ativo.atualizado-em':
      return dataHora.formatarDataEHora(new Date(ativo.atualizadoEm));
    case COLUNA_DA_DISPONIBILIDADE:
      return ativo.disponibilidade ? rotuloDaDisponibilidade(ativo.disponibilidade) : null;
    case COLUNA_DO_CONTROL_ID:
      return ativo.controlId ? rotuloDoControlId(ativo.controlId) : null;
    case COLUNA_DOS_SUPRIMENTOS:
      return textoDosSuprimentos(ativo.suprimentos);
    case COLUNA_DAS_PAGINAS:
      return textoDasPaginas(ativo.suprimentos);
  }
  const valor = ativo.valores[coluna.chave];
  const campo = coluna.campo;
  if (valor === undefined || !campo) return null;
  const texto = mostrarValor(campo, valor, (id) => nomeDoRegistro(campo.tipo, id, referencias));
  return texto === '' ? null : texto;
}

/**
 * As relações do ativo como referências com cartão (spec cadastro-de-ativos, "Relações do ativo à
 * vista"): o tipo, o modelo, o local e o responsável; nenhuma nas outras colunas e no vazio.
 */
export function referenciaNaColuna(chave: string, ativo: AtivoNaLista): ReactNode | undefined {
  switch (chave) {
    case 'ativo.tipo':
      return <ReferenciaAoTipo tipo={ativo.tipo} />;
    case 'ativo.modelo':
      return ativo.modelo ? <ReferenciaAoModelo modelo={ativo.modelo} /> : undefined;
    case 'ativo.local':
      return ativo.local ? <ReferenciaAoLocal local={ativo.local} /> : undefined;
    case 'ativo.responsavel':
      return ativo.responsavel ? (
        <ReferenciaAPessoa pessoa={ativo.responsavel} comCartao={ativo.permite.verResponsavel} />
      ) : undefined;
  }
  return undefined;
}

/** O conteúdo da célula: a situação com o rótulo, o nome com o tipo, o texto, "—" ou fora do acesso. */
export function ConteudoDaCelula({
  coluna,
  ativo,
  texto,
  agora,
}: {
  coluna: ColunaDosAtivos;
  ativo: AtivoNaLista;
  texto: string | null;
  /** O momento de agora, para a idade dos valores coletados. */
  agora?: Date;
}) {
  if (foraDoAcesso(coluna, ativo)) {
    return <span className={estilos.semValor}>Fora do seu acesso</span>;
  }
  if (coluna.chave === 'ativo.situacao') {
    const situacao = situacaoDoAtivo(ativo);
    return <RotuloDeSituacao situacao={situacao.tipo}>{situacao.texto}</RotuloDeSituacao>;
  }
  if (coluna.chave === COLUNA_DA_DISPONIBILIDADE && ativo.disponibilidade) {
    return (
      <DisponibilidadeNaCelula
        disponibilidade={ativo.disponibilidade}
        agora={agora ?? new Date()}
      />
    );
  }
  if (coluna.chave === COLUNA_DO_CONTROL_ID && ativo.controlId) {
    return <ControlIdNaCelula saude={ativo.controlId} agora={agora ?? new Date()} />;
  }
  if (coluna.chave === COLUNA_DOS_SUPRIMENTOS && ativo.suprimentos?.menor) {
    return <SuprimentosNaCelula menor={ativo.suprimentos.menor} agora={agora ?? new Date()} />;
  }
  if (coluna.chave === COLUNA_DAS_PAGINAS && ativo.suprimentos?.total) {
    return <PaginasNaCelula total={ativo.suprimentos.total} agora={agora ?? new Date()} />;
  }
  if (coluna.chave === COLUNA_PRINCIPAL_DOS_ATIVOS) {
    return (
      <span className={estilos.nomeETipo}>
        <span>{ativo.rotulo}</span>
        <span>{ativo.tipo.nome}</span>
      </span>
    );
  }
  const referencia = referenciaNaColuna(coluna.chave, ativo);
  if (referencia) return referencia;
  const imagem = coluna.campo?.tipo === 'imagem' ? ativo.valores[coluna.chave] : undefined;
  if (typeof imagem === 'string') {
    // No tamanho da miniatura da linha; o nome do arquivo é o texto alternativo.
    return (
      <MiniaturaDeAtivo
        tipo="generico"
        imagemDoAtivo={`/api/ativos/${ativo.id}/campos/${coluna.chave}/arquivo/${imagem}/64`}
        rotulo={texto ?? undefined}
      />
    );
  }
  return texto === null ? <span className={estilos.semValor}>—</span> : texto;
}
