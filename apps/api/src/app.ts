import type { IncomingMessage } from 'node:http';
import { relative, sep } from 'node:path';
import cookies from '@fastify/cookie';
import estaticos from '@fastify/static';
import swagger from '@fastify/swagger';
import websocket from '@fastify/websocket';
import { type Banco, naOrganizacao } from '@grafite/db';
import type { Ambiente } from '@grafite/domain';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type pg from 'pg';
import { z } from 'zod';
import { carregarAcesso } from './acesso/acesso.ts';
import { instalarAcesso } from './acesso/escopo.ts';
import { exigirModuloLigado } from './acesso/modulos.ts';
import {
  criarResolvedorDeOrganizacao,
  normalizarEndereco,
  organizacaoDoEndereco,
} from './acesso/organizacao.ts';
import { criarConferenciaDeEngano } from './acesso/senhas.ts';
import { CRON_DOS_ALERTAS, FUSO_DOS_ALERTAS } from './alertas/tarefas.ts';
import type { Armazenamento } from './arquivos/armazenamento.ts';
import { lerArvore } from './arvore.ts';
import { type CanaisDaApi, canaisQueEnviam } from './canais/canais.ts';
import type { ChavesDoCofre } from './cofre/cifra.ts';
import { exigirDoisPassosNoCofre } from './cofre/guarda.ts';
import { instalarColeta } from './coleta/escopo.ts';
import type { ConectarDiretorio } from './diretorio/cliente.ts';
import { conectarPeloLdap } from './diretorio/ldap.ts';
import { criarDistribuidor } from './eventos/distribuidor.ts';
import { criarOuvinte } from './eventos/ouvinte.ts';
import { criarFila, type FilaDeTarefas } from './fila/fila.ts';
import type { ContextoDasTarefas, DefinicaoDeTarefa } from './fila/tarefas.ts';
import { lerAgendaDaOperacao } from './operacao/agenda.ts';
import {
  agendarTarefasDoServidor,
  type ServidorDaOperacao,
  tarefasDoServidor,
} from './operacao/tarefas.ts';
import { criarPonteDosPaineis } from './paineis/ponte.ts';
import { gerarCodigoDeRastreio, registrarProblemas } from './problemas.ts';
import { registrarLimiteDeRequisicoes } from './protecao.ts';
import { rotasDoAcesso } from './rotas/acesso.ts';
import { rotasDoAcessoRemoto } from './rotas/acesso-remoto.ts';
import { rotasDosAgentes } from './rotas/agentes.ts';
import { instalarAgentesDoGlpi } from './rotas/agentes-glpi.ts';
import { rotasDosAlertas } from './rotas/alertas.ts';
import { rotasDosAparelhos } from './rotas/aparelhos.ts';
import { rotasDaImagemDoAtivo, rotasDosArquivosDosCampos, rotasDosAtivos } from './rotas/ativos.ts';
import { rotasDasAtribuicoes } from './rotas/atribuicoes.ts';
import { rotasDaAuditoria } from './rotas/auditoria.ts';
import { rotasDosCampos } from './rotas/campos.ts';
import { rotasDosCanais } from './rotas/canais.ts';
import { rotasDoCofre } from './rotas/cofre.ts';
import { rotasDoAcessoAoCofre } from './rotas/cofre-acesso.ts';
import { rotasDoLoginDoControle } from './rotas/cofre-login-do-controle.ts';
import { rotasDaRevelacaoDoCofre } from './rotas/cofre-revelacao.ts';
import { rotasDaColeta } from './rotas/coleta.ts';
import { rotasDosColetores } from './rotas/coletores.ts';
import { rotasDosConsumiveis } from './rotas/consumiveis.ts';
import { rotasDaConta } from './rotas/conta.ts';
import { rotasDasContas } from './rotas/contas.ts';
import { rotasDoControlId } from './rotas/controlid.ts';
import { rotasDoDiretorio } from './rotas/diretorio.ts';
import {
  type AcordarAgente,
  acordarPeloHttp,
  rotasDasDistribuicoes,
} from './rotas/distribuicoes.ts';
import { rotasDosDoisPassos } from './rotas/dois-passos.ts';
import { rotasDoEstoque } from './rotas/estoque.ts';
import { type IntervalosDosEventos, rotasDosEventos } from './rotas/eventos.ts';
import { rotasDosFornecedores } from './rotas/fornecedores.ts';
import { rotasDasFotos } from './rotas/fotos.ts';
import { rotasDosGrupos } from './rotas/grupos.ts';
import { rotasDasImportacoes, rotasDoEnvioDaPlanilha } from './rotas/importacoes.ts';
import { rotasDosIndicadores } from './rotas/indicadores.ts';
import { rotasDosIndicadoresCriados } from './rotas/indicadores-criados.ts';
import { rotasDosIndicadoresDaOperacao } from './rotas/indicadores-da-operacao.ts';
import { rotasDosLocais } from './rotas/locais.ts';
import { rotasDoMapa } from './rotas/mapa.ts';
import { rotasDaImagemDoModelo, rotasDosModelos } from './rotas/modelos.ts';
import { rotasDosModulos } from './rotas/modulos.ts';
import { rotasDosNomesDasPessoas } from './rotas/nomes-das-pessoas.ts';
import { rotasDasNotificacoes } from './rotas/notificacoes.ts';
import { rotasDaOperacao } from './rotas/operacao.ts';
import { rotasDasOrdens } from './rotas/ordens.ts';
import { rotasDosPaineis } from './rotas/paineis.ts';
import { rotasDosPerfis } from './rotas/perfis.ts';
import { rotasDasPessoas } from './rotas/pessoas.ts';
import { rotasDasPreferencias } from './rotas/preferencias.ts';
import { rotasDoRascunhoDoAtivo } from './rotas/rascunho-do-ativo.ts';
import { rotasDasRegrasDeAlerta } from './rotas/regras-de-alerta.ts';
import { rotasDasSalas } from './rotas/salas.ts';
import { rotasDeSaude } from './rotas/saude.ts';
import { rotasDoSegundoPasso } from './rotas/segundo-passo.ts';
import { rotasDeSessao } from './rotas/sessao.ts';
import { rotasDasSessoesDaConta } from './rotas/sessoes-da-conta.ts';
import { rotasDaBaseDeSoftware } from './rotas/software.ts';
import { rotasDosSoftwares } from './rotas/softwares.ts';
import { rotasDasSolicitacoes } from './rotas/solicitacoes.ts';
import { rotasDasTarefas } from './rotas/tarefas.ts';
import { rotasDosTiposDeAtivo } from './rotas/tipos-de-ativo.ts';
import { rotasDasVisoes } from './rotas/visoes.ts';

// As mensagens padrão do Zod em pt-BR, para o campo que não tiver uma mensagem própria.
z.config(z.locales.ptBR());

declare module 'fastify' {
  interface FastifyInstance {
    /** O ambiente da configuração (GRAFITE_AMBIENTE), que a saúde e o estado da sessão dizem. */
    ambiente: Ambiente;
    /** A fila de tarefas, ou `null` sem ela, para quem notifica fora das rotas, como os testes. */
    fila: FilaDeTarefas | null;
  }
}

export interface Dependencias {
  /** O ambiente em que a API roda (GRAFITE_AMBIENTE). */
  ambiente: Ambiente;
  /**
   * Os proxies cujo X-Forwarded-For vale (GRAFITE_PROXIES_CONFIAVEIS): o `request.ip` passa a ser o
   * do cliente no limite de requisições, nas sessões e na auditoria. Padrão: o próprio servidor.
   */
  proxiesConfiaveis?: string[];
  /** O endereço de acesso da organização que opera o servidor (GRAFITE_ORGANIZACAO_OPERADORA). */
  organizacaoOperadora?: string;
  versao: string;
  verificarBanco: () => Promise<void>;
  /** O banco da aplicação (papel grafite_app); toda consulta de negócio passa pela naOrganizacao. */
  banco: Banco;
  /** A chave que cifra as chaves dos apps autenticadores (GRAFITE_CHAVE_DOIS_PASSOS). */
  chaveDoisPassos: Buffer;
  /** As chaves mestras do cofre (GRAFITE_CHAVE_DO_COFRE e, na troca, a anterior). */
  chavesDoCofre: ChavesDoCofre;
  /** Onde ficam os arquivos, como as fotos (na pasta GRAFITE_ARQUIVOS_PASTA). */
  armazenamento: Armazenamento;
  /**
   * Os canais de fora (change p3c-email-e-push): o carteiro e o entregador, com o e-mail e o push
   * configurados, e a origem dos links. Sem eles, nenhum e-mail nem push sai.
   */
  canais?: CanaisDaApi;
  /**
   * Um cliente novo do banco, com o papel da aplicação, para ouvir os eventos (LISTEN). Sem ele,
   * como nos testes unitários, a API não ouve o banco, e as conexões de eventos não recebem nada.
   */
  conectarOuvinte?: () => pg.Client;
  /** Os intervalos da conexão de eventos, menores nos testes. */
  intervalosDosEventos?: Partial<IntervalosDosEventos>;
  /** O prazo da primeira resposta da máquina no acesso remoto, em ms (padrão: 10 s), menor nos testes. */
  prazoDoAcessoRemoto?: number;
  /** Quem conecta ao diretório da organização (padrão: o ldapts); os testes usam um AD em memória. */
  conectarDiretorio?: ConectarDiretorio;
  /** Quem acorda o agente do GLPI pelo IP (padrão: o /now na porta 62354); os testes trocam. */
  acordarAgente?: AcordarAgente;
  /**
   * A fila de tarefas: a ligação com o papel da aplicação e o catálogo, montado com o que as
   * tarefas usam. Sem ela, como nos testes que não tratam da fila, a API não roda tarefas.
   */
  fila?: {
    conexao: string;
    tarefas: (contexto: ContextoDasTarefas) => DefinicaoDeTarefa[];
    tempoDeEncerramento?: number;
    /** De quanto em quanto tempo cada fila procura tarefas, em segundos; menor nos testes. */
    intervaloDeConsulta?: number;
    /**
     * Agenda a avaliação dos alertas a cada minuto (design do P3a, decisão 5), como a partida do
     * servidor faz; os testes ligam a fila sem a agenda, para nenhuma avaliação rodar sozinha.
     */
    agendarAlertas?: boolean;
  };
  /**
   * O relógio das regras: expiração, bloqueio, pendência, passo do TOTP e momento da auditoria.
   * Nenhuma regra usa o now() do banco, e os testes adiantam este relógio sem esperar.
   */
  agora: () => Date;
  logger?: FastifyServerOptions['logger'];
  /** Pasta da web compilada. Sem ela (desenvolvimento), quem serve a web é o Vite. */
  pastaDaWeb?: string;
  /**
   * As tarefas do servidor (design do F2d, decisões 11 e 14): o backup, o teste de restauração e a
   * vigilância do certificado, na fila, agendadas só na produção e com a organização operadora.
   */
  operacao?: Omit<ServidorDaOperacao, 'ambiente' | 'versao'>;
}

/** Monta a API. Os mesmos schemas Zod validam as requisições e geram o OpenAPI. */
export async function criarApp({
  ambiente,
  proxiesConfiaveis = ['127.0.0.1', '::1'],
  organizacaoOperadora,
  versao,
  verificarBanco,
  banco,
  chaveDoisPassos,
  chavesDoCofre,
  armazenamento,
  canais = {},
  conectarOuvinte,
  intervalosDosEventos,
  prazoDoAcessoRemoto,
  conectarDiretorio = conectarPeloLdap,
  acordarAgente = acordarPeloHttp,
  fila: opcoesDaFila,
  agora,
  logger = false,
  pastaDaWeb,
  operacao,
}: Dependencias) {
  const app = Fastify({
    logger,
    // O código de rastreio é da API, e não o que o cliente manda (seção 10.1 da spec mestre).
    genReqId: gerarCodigoDeRastreio,
    requestIdHeader: false,
    // /api/... chega às mesmas rotas, como no proxy do desenvolvimento (a web chama /api). Com a
    // web compilada, o pedido de uma página fora do /api é dela, mesmo no endereço de uma rota da
    // API, como /ativos: recebe o index.html.
    rewriteUrl: (requisicao) =>
      pastaDaWeb && pedePagina(requisicao) ? '/index.html' : semPrefixoDaApi(requisicao.url ?? '/'),
    // Só o proxy na frente diz o endereço do cliente (design do F2d, decisão 10).
    trustProxy: proxiesConfiaveis,
  }).withTypeProvider<ZodTypeProvider>();
  app.decorate('ambiente', ambiente);
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook('onRequest', async (requisicao, resposta) => {
    resposta.header('x-codigo-de-rastreio', requisicao.id);
  });
  app.decorateRequest('organizacao', null);
  app.decorateRequest('sessao', null);
  registrarProblemas(app);

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'API do Grafite', version: versao },
    },
    transform: jsonSchemaTransform,
    // Inclui em components/schemas os schemas nomeados com .meta({ id }).
    transformObject: jsonSchemaTransformObject,
  });

  // Os eventos (design do F2c, decisão 10): o ouvinte do banco entrega ao distribuidor, que entrega
  // às conexões abertas.
  const distribuidor = criarDistribuidor({
    lerArvore: (orgId) => naOrganizacao(banco, orgId, lerArvore),
    lerAcesso: (orgId, contaId) => naOrganizacao(banco, orgId, (tx) => carregarAcesso(tx, contaId)),
    avisar: (erro) => app.log.warn({ err: erro }, 'falha na distribuição dos eventos'),
  });
  const ouvinte =
    conectarOuvinte &&
    criarOuvinte({
      conectar: conectarOuvinte,
      aoEvento: (evento) => void distribuidor.distribuir(evento),
      aoReligar: () => void distribuidor.reiniciar(),
      avisar: (erro) => app.log.warn({ err: erro }, 'ligação dos eventos com o banco'),
    });
  if (ouvinte) {
    app.addHook('onReady', () => ouvinte.iniciar());
    app.addHook('onClose', () => ouvinte.parar());
  }
  // A fila liga depois do LISTEN e antes de a API atender (design do F2c, decisão 17).
  const servidorDaOperacao = operacao && { ...operacao, ambiente, versao };
  const contextoDasTarefas = {
    banco,
    armazenamento,
    agora,
    log: app.log,
    enviar: (...argumentos: Parameters<FilaDeTarefas['enviar']>) => {
      if (!fila) throw new Error('A fila de tarefas não está ligada.');
      return fila.enviar(...argumentos);
    },
    canais: canaisQueEnviam(ambiente, canais),
  };
  const fila: FilaDeTarefas | undefined =
    opcoesDaFila &&
    criarFila({
      conexao: opcoesDaFila.conexao,
      tempoDeEncerramento: opcoesDaFila.tempoDeEncerramento,
      intervaloDeConsulta: opcoesDaFila.intervaloDeConsulta,
      tarefas: [
        ...opcoesDaFila.tarefas(contextoDasTarefas),
        ...(servidorDaOperacao ? tarefasDoServidor(contextoDasTarefas, servidorDaOperacao) : []),
      ],
      avisar: (erro) => app.log.warn({ err: erro }, 'falha na fila de tarefas'),
    });
  app.decorate('fila', fila ?? null);
  if (fila) {
    app.addHook('onReady', () => fila.iniciar());
    app.addHook('onClose', () => fila.parar());
  }
  if (fila && opcoesDaFila?.agendarAlertas) {
    app.addHook('onReady', () =>
      fila.agendar('alertas-a-cada-minuto', CRON_DOS_ALERTAS, null, FUSO_DOS_ALERTAS),
    );
  }
  // Com a fila no ar, as tarefas do servidor ganham o horário da agenda (ou o perdem, fora da
  // produção ou sem a organização operadora).
  if (fila && servidorDaOperacao) {
    app.addHook('onReady', async () => {
      const orgOperadoraId = organizacaoOperadora
        ? await organizacaoDoEndereco(banco, normalizarEndereco(organizacaoOperadora))
        : null;
      if (organizacaoOperadora && !orgOperadoraId) {
        app.log.warn(
          { endereco: organizacaoOperadora },
          'a organização que opera o servidor não foi encontrada; as tarefas do servidor ficam sem horário',
        );
      }
      await agendarTarefasDoServidor(fila, await lerAgendaDaOperacao(banco), {
        ...servidorDaOperacao,
        orgOperadoraId,
      });
    });
  }

  await app.register(cookies);
  // As conexões WebSocket, como a do acesso remoto, passam pelas mesmas guardas antes da troca.
  await app.register(websocket);
  await registrarLimiteDeRequisicoes(app);
  await app.register(rotasDeSaude, {
    ambiente,
    versao,
    verificarBanco,
    filaRodando: () => fila?.rodando() ?? false,
    eventosLigados: () => ouvinte?.ligado() ?? false,
  });
  // As rotas de acesso: na organização do endereço, com a sessão do cookie conferida.
  const resolver = criarResolvedorDeOrganizacao({ banco, agora });
  const ponteDosPaineis = criarPonteDosPaineis({ banco, agora });
  const conferirDeEngano = await criarConferenciaDeEngano();
  await app.register(async (escopo) => {
    instalarAcesso(escopo, { banco, agora, resolver, organizacaoOperadora });
    await escopo.register(rotasDeSessao, {
      banco,
      agora,
      conferirDeEngano,
      diretorio: { chavesDoCofre, conectar: conectarDiretorio },
    });
    await escopo.register(rotasDoSegundoPasso, { banco, agora, chaveDoisPassos, fila });
    await escopo.register(rotasDasSessoesDaConta, { banco, agora });
    await escopo.register(rotasDosAparelhos, { banco, agora });
    await escopo.register(rotasDaConta, { banco, agora });
    await escopo.register(rotasDosDoisPassos, { banco, agora, chaveDoisPassos });
    await escopo.register(rotasDasPreferencias, { banco, agora });
    await escopo.register(rotasDasNotificacoes, { banco, agora });
    await escopo.register(rotasDosCanais, { banco, agora, ambiente, canais });
    await escopo.register(rotasDosEventos, {
      banco,
      agora,
      distribuidor,
      intervalos: intervalosDosEventos,
    });
    await escopo.register(rotasDoAcesso, { banco });
    await escopo.register(rotasDosLocais, { banco, agora });
    await escopo.register(rotasDasPessoas, { banco, agora });
    await escopo.register(rotasDosNomesDasPessoas, { banco });
    await escopo.register(rotasDasFotos, { banco, agora, armazenamento });
    await escopo.register(rotasDasContas, { banco, agora });
    await escopo.register(rotasDosPerfis, { banco, agora });
    await escopo.register(rotasDosGrupos, { banco, agora });
    await escopo.register(rotasDasAtribuicoes, { banco, agora });
    await escopo.register(rotasDaAuditoria, { banco });
    await escopo.register(rotasDosModulos, { banco, agora });
    // As visões seguem o módulo da tabela pedida, conferido pela rota, e não pelo escopo.
    await escopo.register(rotasDasVisoes, { banco, agora });
    // O módulo Ativos, opcional: o catálogo e os ativos são recusados com ele desligado.
    await escopo.register(async (doAtivos) => {
      exigirModuloLigado(doAtivos, { banco, modulo: 'ativos' });
      await doAtivos.register(rotasDosTiposDeAtivo, { banco, agora });
      await doAtivos.register(rotasDosCampos, { banco, agora });
      await doAtivos.register(rotasDosModelos, { banco, agora });
      await doAtivos.register(rotasDaImagemDoModelo, { banco, agora, armazenamento });
      await doAtivos.register(rotasDosAtivos, { banco, agora });
      await doAtivos.register(rotasDoRascunhoDoAtivo, { banco, agora });
      await doAtivos.register(rotasDaImagemDoAtivo, { banco, agora, armazenamento });
      await doAtivos.register(rotasDosArquivosDosCampos, { banco, agora, armazenamento });
      await doAtivos.register(rotasDasImportacoes, { banco, agora, fila });
      await doAtivos.register(rotasDoEnvioDaPlanilha, { banco, agora });
      await doAtivos.register(rotasDoControlId, {
        banco,
        agora,
        armazenamento,
        chaveDoisPassos,
      });
      await doAtivos.register(rotasDoAcessoRemoto, { banco, agora, prazo: prazoDoAcessoRemoto });
      await doAtivos.register(rotasDosSoftwares, { banco });
      await doAtivos.register(rotasDaBaseDeSoftware, { banco, agora, armazenamento });
      await doAtivos.register(rotasDasDistribuicoes, { banco, agora, acordar: acordarAgente });
    });
    // O módulo Cofre, opcional, só para a conta com os dois passos ativos (design do P6, decisão 7).
    await escopo.register(async (doCofre) => {
      exigirModuloLigado(doCofre, { banco, modulo: 'cofre' });
      exigirDoisPassosNoCofre(doCofre);
      await doCofre.register(rotasDoCofre, { banco, agora, chavesDoCofre });
      await doCofre.register(rotasDoAcessoAoCofre, { banco, agora });
      await doCofre.register(rotasDoLoginDoControle, { banco, agora });
      await doCofre.register(rotasDaRevelacaoDoCofre, {
        banco,
        agora,
        chavesDoCofre,
        chaveDoisPassos,
      });
    });
    // O módulo Alertas, opcional: as regras, os alertas e o silêncio dos ativos (design do P3a).
    await escopo.register(async (doAlertas) => {
      exigirModuloLigado(doAlertas, { banco, modulo: 'alertas' });
      await doAlertas.register(rotasDasRegrasDeAlerta, { banco, agora, fila });
      await doAlertas.register(rotasDosAlertas, { banco, agora });
      await doAlertas.register(rotasDosIndicadores, { banco, agora });
      await doAlertas.register(rotasDosIndicadoresCriados, { banco, agora });
    });
    // O módulo Operação, opcional: os consumíveis, e depois o estoque, as solicitações, as OS e os
    // indicadores da operação.
    await escopo.register(async (daOperacao) => {
      exigirModuloLigado(daOperacao, { banco, modulo: 'operacao' });
      await daOperacao.register(rotasDosConsumiveis, { banco, agora });
      await daOperacao.register(rotasDoEstoque, { banco, agora });
      await daOperacao.register(rotasDasSolicitacoes, { banco, agora });
      await daOperacao.register(rotasDasOrdens, { banco, agora });
      await daOperacao.register(rotasDosIndicadoresDaOperacao, { banco, agora });
    });
    // O módulo Salas, opcional: as salas de reunião e as reservas (change salas-de-reuniao).
    await escopo.register(async (dasSalas) => {
      exigirModuloLigado(dasSalas, { banco, modulo: 'salas' });
      await dasSalas.register(rotasDasSalas, { banco, agora, fila });
    });
    // O módulo Painéis, opcional: os painéis das VMs e a verificação (change painel-de-dashboards).
    await escopo.register(async (dosPaineis) => {
      exigirModuloLigado(dosPaineis, { banco, modulo: 'paineis' });
      await dosPaineis.register(rotasDosPaineis, { banco, agora, ponte: ponteDosPaineis });
    });
    // O mapa da planta (change p7-mapa-da-planta).
    await escopo.register(rotasDoMapa, { banco, agora, armazenamento });
    // O diretório da organização (change integracao-ad-ldap).
    await escopo.register(rotasDoDiretorio, {
      banco,
      agora,
      chavesDoCofre,
      conectar: conectarDiretorio,
    });
    await escopo.register(rotasDasTarefas, { banco, agora, fila });
    await escopo.register(rotasDosColetores, { banco, agora });
    await escopo.register(rotasDosAgentes, { banco, agora });
    await escopo.register(rotasDosFornecedores, { banco, agora });
    await escopo.register(rotasDaOperacao, {
      banco,
      agora,
      fila,
      servidor: servidorDaOperacao,
    });
  });
  // As rotas do coletor (design do P2a, decisões 1 e 2): a organização pelo endereço e o coletor pelo
  // token, fora da sessão e da proteção contra outros sites, que são das telas.
  await app.register(async (escopo) => {
    instalarColeta(escopo, { banco, agora, resolver, organizacaoOperadora });
    await escopo.register(rotasDaColeta, { banco, agora, chavesDoCofre, armazenamento });
  });
  // O agente do GLPI (change inventario-pelo-agente-glpi): o protocolo dele, pelo token do caminho.
  await instalarAgentesDoGlpi(app, { banco, agora, resolver, armazenamento, organizacaoOperadora });
  await ponteDosPaineis.instalar(app, resolver);
  if (pastaDaWeb) await servirWeb(app, pastaDaWeb);
  return app;
}

/** Tira o /api do começo do caminho: /api/health → /health; /api → /. */
export function semPrefixoDaApi(url: string): string {
  if (url !== '/api' && !url.startsWith('/api/') && !url.startsWith('/api?')) return url;
  const resto = url.slice('/api'.length);
  return resto.startsWith('/') ? resto : `/${resto}`;
}

/** Arquivo com extensão (script, estilo, imagem): se não existe, é 404, nunca o index.html. */
const EXTENSAO = /\.[a-z0-9]+$/i;

/** Onde o Vite põe os arquivos com a versão no nome: o único lugar com cache longo. */
const PASTA_COM_VERSAO = 'assets';

/** Os endereços fora do /api que são da API mesmo pedidos como página: a saúde, do contêiner. */
const DA_API_SEM_PREFIXO = new Set(['/health']);

/**
 * O pedido de uma página (GET, sem extensão, aceitando HTML) fora do /api é de uma rota da web,
 * mesmo no endereço de uma rota da API, como /ativos, e recebe o index.html. A saúde fica na API.
 */
export function pedePagina({
  method,
  url = '/',
  headers,
}: Pick<IncomingMessage, 'method' | 'url' | 'headers'>): boolean {
  const caminho = url.split('?')[0] ?? '';
  return (
    method === 'GET' &&
    semPrefixoDaApi(caminho) === caminho &&
    !DA_API_SEM_PREFIXO.has(caminho) &&
    !EXTENSAO.test(caminho) &&
    (headers.accept ?? '').includes('text/html')
  );
}

/**
 * Serve a web compilada. Só os arquivos de /assets/, com a versão no nome, têm cache longo e
 * imutável. O resto (o index.html, o service worker, o manifesto e os ícones) vai sem cache longo,
 * para o navegador achar a versão nova (spec pwa).
 */
async function servirWeb(app: FastifyInstance, pasta: string) {
  await app.register(estaticos, {
    root: pasta,
    schemaHide: true,
    setHeaders: (resposta, caminho) => {
      const comVersao = relative(pasta, caminho).startsWith(`${PASTA_COM_VERSAO}${sep}`);
      resposta.header(
        'cache-control',
        comVersao ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
}
