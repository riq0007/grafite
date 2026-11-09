import { cadastroDosAgentes, locais, type Transacao, tiposDeAtivo } from '@grafite/db';
import { camposDoAtivo, type InventarioDoAgente, lerValor, SEM_ACESSO } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { lerArvore } from '../arvore.ts';
import { camposDaOrganizacao, gravarAtivo, lerTipoDoAtivo } from '../ativos/escrita.ts';
import { lerAtivo } from '../ativos/leitura.ts';
import { dadosInvalidos } from '../problemas.ts';
import { modeloDoInventario } from './modelo.ts';

/** Tipo nulo conserva o recebimento e a ligação manual, sem criar computadores. */
export async function lerCadastroDosAgentes(tx: Transacao) {
  const [linha] = await tx.select().from(cadastroDosAgentes);
  return { tipoId: linha?.tipoId ?? null, localId: linha?.localId ?? null };
}

/** O savepoint preserva o recebimento quando um cadastro é recusado pelo motor de campos. */
export async function cadastrarComputador(
  tx: Transacao,
  {
    orgId,
    inventario,
    momento,
    ip,
    autor,
    configuracao,
  }: {
    orgId: string;
    inventario: InventarioDoAgente;
    momento: Date;
    ip: string;
    autor: string;
    configuracao: { tipoId: string; localId: string | null };
  },
) {
  const tipoId = configuracao.tipoId;
  return tx.transaction(async (cadastro) => {
    const [linha] = await cadastro
      .select()
      .from(tiposDeAtivo)
      .where(eq(tiposDeAtivo.id, tipoId))
      .for('share');
    if (linha?.situacao !== 'ativo' || !linha.capacidades.includes('hardware.inventario'))
      throw dadosInvalidos({
        tipoId: 'O tipo de entrada não está ativo com Inventário de hardware.',
      });
    if (configuracao.localId) {
      const [local] = await cadastro
        .select()
        .from(locais)
        .where(eq(locais.id, configuracao.localId))
        .for('share');
      if (local?.situacao !== 'ativo')
        throw dadosInvalidos({ localId: 'O local de entrada está indisponível.' });
    }
    const tipo = await lerTipoDoAtivo(cadastro, tipoId);
    if (!tipo) return null;
    const definicoes = camposDoAtivo({ tipo, campos: await camposDaOrganizacao(cadastro) });
    const valores: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(inventario.valores)) {
      const campo = definicoes.porChave.get(chave);
      if (campo && lerValor(campo, valor).ok) valores[chave] = valor;
    }
    valores['ativo.nome'] = inventario.nome;
    valores['ativo.hostname'] = inventario.nome;
    if (inventario.serie) valores['ativo.serie'] = inventario.serie;
    if (configuracao.localId) valores['ativo.local'] = configuracao.localId;
    const modeloId = await modeloDoInventario(cadastro, {
      orgId,
      tipo,
      inventario,
      momento,
      autor,
      ip,
    });
    const gravado = await gravarAtivo(cadastro, {
      quem: { contaId: '', acesso: SEM_ACESSO, origem: 'agente', sistema: autor, rastreio: { ip } },
      arvore: await lerArvore(cadastro),
      momento,
      atual: null,
      tipoId,
      pedido: { valores, ...(modeloId ? { modeloId } : {}) },
      lerLinha: (id) => lerAtivo(cadastro, id),
    });
    return gravado.id;
  });
}

/** Exibe o rótulo do campo recusado, sem guardar o valor enviado pelo agente. */
export async function rotulosDosCamposRecusados(tx: Transacao, tipoId: string, chaves: string[]) {
  const tipo = await lerTipoDoAtivo(tx, tipoId);
  if (!tipo) return [];
  const campos = camposDoAtivo({ tipo, campos: await camposDaOrganizacao(tx) });
  return [
    ...new Set(
      chaves.flatMap((chave) => {
        const campo = campos.porChave.get(chave.replace(/^valores\./, ''));
        return campo ? [campo.rotulo] : [];
      }),
    ),
  ];
}
