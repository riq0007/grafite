// Os agentes do GLPI pela tela (spec inventario-pelo-agente, "Endereço dos agentes" e "Agentes da
// organização"; change inventario-pelo-agente-glpi, design, decisão 7): o endereço com o token, que
// aparece uma vez só; a lista dos agentes, com a situação em texto e o ativo ligado; e a ligação à
// mão. Tudo com `coletores.administrar`.
import {
  agentes,
  ativos,
  type Banco,
  contas,
  MOTIVOS_DA_PENDENCIA_DO_AGENTE,
  modelos,
  naOrganizacao,
  pessoas,
  tiposDeAtivo,
  tokensDosAgentes,
} from '@grafite/db';
import { situacaoDoAgente } from '@grafite/domain';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sessaoDa } from '../acesso/escopo.ts';
import { gerarTokenDosAgentes } from '../agentes/agentes.ts';
import { rotuloNoBanco } from '../ativos/colunas.ts';
import { registrarNaAuditoria } from '../auditoria.ts';
import { dadosInvalidos, naoEncontrado, RespostaDeProblema } from '../problemas.ts';
import { rotasDoCadastroDosAgentes } from './agentes-cadastro.ts';
import { origemDa, PROBLEMAS_DO_ACESSO } from './sessao.ts';

const AgenteDoGlpi = z
  .object({
    id: z.uuid(),
    deviceid: z.string(),
    nome: z.string(),
    versao: z.string().nullable(),
    serie: z.string().nullable(),
    sistema: z.string().nullable(),
    ip: z.string().nullable(),
    ativo: z
      .object({ id: z.uuid(), rotulo: z.string(), patrimonio: z.string().nullable() })
      .nullable(),
    ligadoAMao: z.boolean(),
    pendenciaCadastro: z
      .object({
        motivo: z.enum(MOTIVOS_DA_PENDENCIA_DO_AGENTE),
        campos: z.array(z.string()),
      })
      .nullable()
      .optional(),
    ultimoContato: z.string(),
    ultimoInventario: z.string().nullable(),
    situacao: z.object({ tipo: z.enum(['sucesso', 'atencao', 'neutra']), texto: z.string() }),
  })
  .meta({ id: 'AgenteDoGlpi' });

const AgentesDoGlpi = z
  .object({
    /** O endereço em vigor, sem o token, que só aparece na geração. */
    endereco: z.object({ geradoEm: z.string(), geradoPor: z.string() }).nullable(),
    agentes: z.array(AgenteDoGlpi),
  })
  .meta({ id: 'AgentesDoGlpi' });

const PROBLEMAS = { 401: RespostaDeProblema, 409: RespostaDeProblema, ...PROBLEMAS_DO_ACESSO };

export const rotasDosAgentes: FastifyPluginAsyncZod<{ banco: Banco; agora: () => Date }> = async (
  app,
  { banco, agora },
) => {
  await app.register(rotasDoCadastroDosAgentes, { banco, agora });
  app.get(
    '/agentes',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary: 'O endereço e os agentes do GLPI da organização',
        response: { 200: AgentesDoGlpi, ...PROBLEMAS },
      },
    },
    async (requisicao) => {
      const momento = agora();
      return naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [endereco] = await tx
          .select({ geradoEm: tokensDosAgentes.criadoEm, geradoPor: pessoas.nome })
          .from(tokensDosAgentes)
          .innerJoin(contas, eq(contas.id, tokensDosAgentes.criadoPor))
          .innerJoin(pessoas, eq(pessoas.id, contas.pessoaId))
          .where(isNull(tokensDosAgentes.revogadoEm));
        const linhas = await tx
          .select({
            agente: agentes,
            ativo: {
              id: ativos.id,
              rotulo: sql<string>`${rotuloNoBanco}`,
              patrimonio: ativos.patrimonio,
            },
          })
          .from(agentes)
          .leftJoin(ativos, and(eq(ativos.orgId, agentes.orgId), eq(ativos.id, agentes.ativoId)))
          .leftJoin(
            tiposDeAtivo,
            and(eq(tiposDeAtivo.orgId, ativos.orgId), eq(tiposDeAtivo.id, ativos.tipoId)),
          )
          .leftJoin(modelos, and(eq(modelos.orgId, ativos.orgId), eq(modelos.id, ativos.modeloId)))
          .orderBy(asc(agentes.nome));
        return {
          endereco: endereco
            ? { geradoEm: endereco.geradoEm.toISOString(), geradoPor: endereco.geradoPor }
            : null,
          agentes: linhas.map(({ agente, ativo }) => ({
            id: agente.id,
            deviceid: agente.deviceid,
            nome: agente.nome,
            versao: agente.versao,
            serie: agente.serie,
            sistema: agente.sistema,
            ip: agente.ip,
            ativo: ativo?.id ? ativo : null,
            ligadoAMao: agente.ligadoAMao,
            pendenciaCadastro: ativo?.id ? null : agente.pendenciaCadastro,
            ultimoContato: agente.ultimoContato.toISOString(),
            ultimoInventario: agente.ultimoInventario?.toISOString() ?? null,
            situacao: situacaoDoAgente({
              ultimoInventario: agente.ultimoInventario,
              agora: momento,
            }),
          })),
        };
      });
    },
  );

  // O endereço novo desliga o anterior; o token aparece só nesta resposta.
  app.post(
    '/agentes/endereco',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary: 'Gerar o endereço dos agentes do GLPI, que desliga o anterior',
        response: { 201: z.object({ endereco: z.string() }), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const momento = agora();
      const { token, hash } = gerarTokenDosAgentes();
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        await tx
          .update(tokensDosAgentes)
          .set({ revogadoEm: momento })
          .where(isNull(tokensDosAgentes.revogadoEm));
        const [criado] = await tx
          .insert(tokensDosAgentes)
          .values({
            orgId: requisicao.organizacao?.id ?? '',
            hashDoToken: hash,
            criadoPor: contaId,
            criadoEm: momento,
          })
          .returning({ id: tokensDosAgentes.id });
        await registrarNaAuditoria(tx, {
          acao: 'agentes.endereco-gerado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'endereco-dos-agentes', id: criado?.id ?? null },
          origem: origemDa(requisicao),
          momento,
        });
      });
      return resposta.code(201).send({
        endereco: `${requisicao.protocol}://${requisicao.host}/api/agentes/glpi/${token}`,
      });
    },
  );

  app.put(
    '/agentes/:id/ativo',
    {
      config: { permissao: 'coletores.administrar' },
      schema: {
        summary: 'Ligar o agente a um ativo, ou desligar',
        params: z.object({ id: z.uuid({ error: 'Agente não encontrado.' }) }),
        body: z.object({ ativoId: z.uuid({ error: 'Escolha o ativo.' }).nullable() }),
        response: { 204: z.null(), ...PROBLEMAS },
      },
    },
    async (requisicao, resposta) => {
      const { contaId } = sessaoDa(requisicao);
      const { ativoId } = requisicao.body;
      const momento = agora();
      await naOrganizacao(banco, requisicao.organizacao?.id ?? '', async (tx) => {
        const [agente] = await tx
          .select()
          .from(agentes)
          .where(eq(agentes.id, requisicao.params.id));
        if (!agente) throw naoEncontrado('Agente não encontrado.');
        if (ativoId) {
          const [ativo] = await tx
            .select({ id: ativos.id })
            .from(ativos)
            .where(and(eq(ativos.id, ativoId), eq(ativos.situacao, 'ativo')));
          if (!ativo) throw dadosInvalidos({ ativoId: 'Escolha um ativo ativo.' });
        }
        await tx
          .update(agentes)
          .set({ ativoId, ligadoAMao: ativoId !== null, pendenciaCadastro: null })
          .where(eq(agentes.id, agente.id));
        await registrarNaAuditoria(tx, {
          acao: ativoId ? 'agente.ligado' : 'agente.desligado',
          ator: { tipo: 'conta', contaId },
          alvo: { tipo: 'agente', id: agente.id },
          dados: { maquina: agente.nome, ativoId: ativoId ?? agente.ativoId },
          origem: origemDa(requisicao),
          momento,
        });
      });
      return resposta.code(204).send(null);
    },
  );
};
