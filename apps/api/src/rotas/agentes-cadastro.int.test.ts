import {
  agentes,
  ativos,
  auditoria,
  cadastroDosAgentes,
  campos,
  camposDoTipo,
  locais,
  modelos,
  naOrganizacao,
  softwaresDosAtivos,
  tiposDeAtivo,
} from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  type ApiDeTeste,
  abrirApi,
  atribuir,
  clienteDaApi,
  criarConta,
  criarOrganizacao,
  criarPerfil,
  type Entrada,
  SEM_ENTRADA,
} from '../../test/integracao.ts';

const host = 'grafite.cadastro-agentes.local';
let api: ApiDeTeste;
let org = '';
let outraOrg = '';
let cliente: ReturnType<typeof clienteDaApi>;
let entrada: Entrada = SEM_ENTRADA;
let leitor: Entrada = SEM_ENTRADA;
let tipo = '';
let semInventario = '';
let inativo = '';
let deFora = '';
let local = '';
let localDeFora = '';

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  outraOrg = await criarOrganizacao(api, { nome: 'Outra', enderecos: ['outra.cadastro.local'] });
  cliente = clienteDaApi(api, host);
  const perfil = await criarPerfil(api, org, {
    nome: 'Coleta',
    permissoes: ['coletores.administrar'],
  });
  const perfilLeitor = await criarPerfil(api, org, { nome: 'Leitura', permissoes: ['ativos.ver'] });
  for (const [usuario, perfilId] of [
    ['ana', perfil],
    ['bia', perfilLeitor],
  ]) {
    const conta = await criarConta(api, org, { usuario: usuario ?? '', nome: usuario ?? '' });
    await atribuir(api, org, { perfilId: perfilId ?? '', contaId: conta.id });
  }
  entrada = await cliente.entrar('ana');
  leitor = await cliente.entrar('bia');
  const novoTipo = (orgId: string, nome: string, capacidades: string[], situacao = 'ativo') =>
    naOrganizacao(api.banco, orgId, async (tx) => {
      const [linha] = await tx
        .insert(tiposDeAtivo)
        .values({
          orgId,
          nome,
          nomeNormalizado: normalizarTexto(nome),
          icone: 'computador',
          capacidades,
          situacao: situacao as 'ativo' | 'inativo',
        })
        .returning();
      return linha?.id ?? '';
    });
  tipo = await novoTipo(org, 'Computador', ['hardware.inventario']);
  semInventario = await novoTipo(org, 'Mesa', []);
  inativo = await novoTipo(org, 'Antigo', ['hardware.inventario'], 'inativo');
  deFora = await novoTipo(outraOrg, 'Computador', ['hardware.inventario']);
  for (const orgId of [org, outraOrg]) {
    const id = await naOrganizacao(api.banco, orgId, async (tx) => {
      const [linha] = await tx
        .insert(locais)
        .values({ orgId, nome: 'Entrada', nomeNormalizado: 'entrada', tipo: 'setor' })
        .returning();
      return linha?.id ?? '';
    });
    if (orgId === org) local = id;
    else localDeFora = id;
  }
});

afterAll(async () => {
  await api?.fechar();
});
const configurar = (tipoId: string | null, localId: string | null = null) =>
  cliente.enviar('PUT', '/agentes/cadastro', entrada, { tipoId, localId });

describe('a configuração do cadastro pelo agente', () => {
  it('começa desligada e oferece só tipos ativos com inventário e locais da organização', async () => {
    const r = await cliente.consultar('/agentes/cadastro', entrada);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({
      tipoId: null,
      localId: null,
      tipos: [{ id: tipo, nome: 'Computador' }],
      locais: [{ id: local, nome: 'Entrada' }],
    });
  });

  it('exige a permissão de administração dos coletores', async () => {
    expect((await cliente.consultar('/agentes/cadastro', leitor)).statusCode).toBe(403);
    expect(
      (await cliente.enviar('PUT', '/agentes/cadastro', leitor, { tipoId: tipo, localId: null }))
        .statusCode,
    ).toBe(403);
  });

  it('grava tipo/local com auditoria, sem cadastrar um ativo por configurar', async () => {
    const r = await configurar(tipo, local);
    expect(r.statusCode, r.body).toBe(204);
    expect((await cliente.consultar('/agentes/cadastro', entrada)).json()).toMatchObject({
      tipoId: tipo,
      localId: local,
    });
    const linhas = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'agentes.cadastro-configurado')),
    );
    expect(linhas).toHaveLength(1);
    expect(await naOrganizacao(api.banco, org, (tx) => tx.select().from(ativos))).toHaveLength(0);
  });

  it('recusa tipo sem capacidade, inativo e referências de outra organização', async () => {
    for (const recusado of [semInventario, inativo, deFora])
      expect((await configurar(recusado, local)).statusCode).toBe(400);
    expect((await configurar(tipo, localDeFora)).statusCode).toBe(400);
    expect((await cliente.consultar('/agentes/cadastro', entrada)).json()).toMatchObject({
      tipoId: tipo,
      localId: local,
    });
  });

  it('desliga o cadastro e remove o local quando não há tipo', async () => {
    expect((await configurar(null, local)).statusCode).toBe(204);
    expect((await cliente.consultar('/agentes/cadastro', entrada)).json()).toMatchObject({
      tipoId: null,
      localId: null,
    });
  });
});

const naOrg = <T>(fazer: Parameters<typeof naOrganizacao<T>>[2]) =>
  naOrganizacao(api.banco, org, fazer);
const deviceidDo = (nome: string) => `${nome}-2026-11-03-00-00-00`;
const inventario = (nome: string) => ({
  hardware: {
    name: nome,
    memory: 8192,
    ipaddr: '10.0.8.43',
    uuid: '3F2504E0-4F89-11D3-9A0C-0305E82C3301',
    lastloggeduser: 'ana',
  },
  bios: { ssn: `SERIE-${nome}`, smanufacturer: 'LENOVO', smodel: 'ThinkPad E14' },
  cpus: [{ name: 'Intel Core i5' }],
  operatingsystem: { full_name: 'Windows 11 Pro', boot_time: '2026-11-03 08:00:00' },
  networks: [{ ipaddress: '10.0.8.43', macaddr: '00:11:22:33:44:55' }],
  softwares: [{ name: '7-Zip', version: '24.09' }],
});
let caminho = '';
function enviarInventario(
  nome: string,
  opcoes: { deviceid?: string; conteudo?: unknown; parcial?: boolean; itemtype?: string } = {},
) {
  return api.app.inject({
    method: 'POST',
    url: caminho,
    headers: { host, 'content-type': 'application/json' },
    payload: {
      action: 'inventory',
      deviceid: opcoes.deviceid ?? deviceidDo(nome),
      content: opcoes.conteudo ?? inventario(nome),
      partial: opcoes.parcial ?? false,
      itemtype: opcoes.itemtype,
    },
  });
}
async function computadorDo(nome: string) {
  return naOrg(async (tx) => {
    const [agente] = await tx
      .select()
      .from(agentes)
      .where(eq(agentes.deviceid, deviceidDo(nome)));
    if (!agente?.ativoId) throw new Error(`O agente ${nome} não foi ligado a um computador.`);
    const [ativo] = await tx.select().from(ativos).where(eq(ativos.id, agente.ativoId));
    if (!ativo) throw new Error('Computador não encontrado.');
    return { agente, ativo };
  });
}

describe('o cadastro automático no inventário', () => {
  beforeAll(async () => {
    const r = await cliente.enviar('POST', '/agentes/endereco', entrada);
    expect(r.statusCode, r.body).toBe(201);
    caminho = new URL(r.json().endereco).pathname;
  });
  beforeEach(async () => {
    expect((await configurar(tipo, local)).statusCode).toBe(204);
  });

  it('cadastra, liga e audita o computador com modelo, rede e softwares recebidos', async () => {
    const r = await enviarInventario('ESTACAO-01');
    expect(r.statusCode, r.body).toBe(200);
    const { agente, ativo } = await computadorDo('ESTACAO-01');
    expect(ativo).toMatchObject({
      nome: 'ESTACAO-01',
      hostname: 'ESTACAO-01',
      serie: 'SERIE-ESTACAO-01',
      tipoId: tipo,
      localId: local,
      patrimonio: null,
      responsavelId: null,
    });
    expect(ativo.valores).toMatchObject({
      'hardware.ip': '10.0.8.43',
      'hardware.mac': '00:11:22:33:44:55',
      'hardware.memoria': 8,
      'software.usuario': 'ana',
    });
    expect(ativo.estado['hardware.ip']).toMatchObject({ origem: 'agente', autorId: null });
    expect(agente).toMatchObject({ ligadoAMao: false, ip: '10.0.8.43' });
    const [modelo] = await naOrg((tx) =>
      tx
        .select()
        .from(modelos)
        .where(eq(modelos.id, ativo.modeloId ?? '')),
    );
    expect(modelo).toMatchObject({ tipoId: tipo, fabricante: 'LENOVO', nome: 'ThinkPad E14' });
    const programas = await naOrg((tx) =>
      tx.select().from(softwaresDosAtivos).where(eq(softwaresDosAtivos.ativoId, ativo.id)),
    );
    expect(programas).toHaveLength(1);
    const registros = await naOrg((tx) =>
      tx
        .select()
        .from(auditoria)
        .where(and(eq(auditoria.acao, 'ativo.criado'), eq(auditoria.alvoId, ativo.id))),
    );
    expect(registros).toEqual([
      expect.objectContaining({ atorTipo: 'sistema', atorDescricao: 'Agente do GLPI' }),
    ]);
  });

  it('reutiliza o cadastro em reenvio e reinstalação, inclusive em requisições simultâneas', async () => {
    const respostas = await Promise.all([
      enviarInventario('CONCORRENTE', { deviceid: deviceidDo('AGENTE-A') }),
      enviarInventario('CONCORRENTE', { deviceid: deviceidDo('AGENTE-B') }),
    ]);
    for (const resposta of respostas) expect(resposta.statusCode, resposta.body).toBe(200);
    const linhas = await naOrg((tx) =>
      tx.select().from(ativos).where(eq(ativos.hostname, 'CONCORRENTE')),
    );
    expect(linhas).toHaveLength(1);
    const vinculados = await naOrg((tx) =>
      tx
        .select()
        .from(agentes)
        .where(eq(agentes.ativoId, linhas[0]?.id ?? '')),
    );
    expect(vinculados).toHaveLength(2);
    expect((await enviarInventario('CONCORRENTE')).statusCode).toBe(200);
    expect(
      await naOrg((tx) => tx.select().from(ativos).where(eq(ativos.hostname, 'CONCORRENTE'))),
    ).toHaveLength(1);
    expect(
      await naOrg((tx) => tx.select().from(modelos).where(eq(modelos.nome, 'ThinkPad E14'))),
    ).toHaveLength(1);
  });

  it('CONTACT, inventário parcial, sem hostname e cadastro desligado não criam ativo', async () => {
    const antes = (await naOrg((tx) => tx.select().from(ativos))).length;
    expect(
      (
        await api.app.inject({
          method: 'POST',
          url: caminho,
          headers: { host },
          payload: { action: 'contact', deviceid: deviceidDo('CONTATO') },
        })
      ).statusCode,
    ).toBe(200);
    expect((await enviarInventario('PARCIAL', { parcial: true })).statusCode).toBe(200);
    expect(
      (await enviarInventario('SEM-NOME', { conteudo: { bios: { ssn: 'SO-SERIE' } } })).statusCode,
    ).toBe(200);
    await configurar(null);
    expect((await enviarInventario('DESLIGADO')).statusCode).toBe(200);
    expect(await naOrg((tx) => tx.select().from(ativos))).toHaveLength(antes);
  });

  it('cadastra uma máquina que já enviava inventário após habilitar o tipo', async () => {
    const nome = 'JA-INVENTARIADO';
    expect((await configurar(null)).statusCode).toBe(204);
    expect((await enviarInventario(nome)).statusCode).toBe(200);
    const lerAgente = async () => {
      const [agente] = await naOrg((tx) =>
        tx
          .select()
          .from(agentes)
          .where(eq(agentes.deviceid, deviceidDo(nome))),
      );
      return agente;
    };
    const antes = await lerAgente();
    expect(antes).toMatchObject({ ativoId: null });
    expect((await configurar(tipo, local)).statusCode).toBe(204);
    expect((await enviarInventario(nome, { parcial: true })).statusCode).toBe(200);
    expect(await lerAgente()).toMatchObject({
      ativoId: null,
      pendenciaCadastro: { motivo: 'parcial', campos: [] },
    });
    expect((await enviarInventario(nome)).statusCode).toBe(200);
    const { agente, ativo } = await computadorDo(nome);
    expect(agente.id).toBe(antes?.id);
    expect(agente).toMatchObject({ pendenciaCadastro: null });
    expect(ativo).toMatchObject({ hostname: nome, tipoId: tipo, localId: local });
  });

  it('cadastra no inventário parcial que identifica explicitamente um computador', async () => {
    const nome = 'PARCIAL-COMPUTADOR';
    const { hardware, bios } = inventario(nome);
    const resultado = await enviarInventario(nome, {
      parcial: true,
      itemtype: 'Computer',
      conteudo: { hardware, bios },
    });
    expect(resultado.statusCode, resultado.body).toBe(200);
    const { ativo } = await computadorDo(nome);
    expect(ativo).toMatchObject({ hostname: nome, tipoId: tipo, localId: local });
    expect((await enviarInventario(nome)).statusCode).toBe(200);
    expect((await computadorDo(nome)).ativo.id).toBe(ativo.id);
    expect(
      await naOrg((tx) =>
        tx.select().from(softwaresDosAtivos).where(eq(softwaresDosAtivos.ativoId, ativo.id)),
      ),
    ).toHaveLength(1);
  });

  it('não duplica série ambígua nem cadastro inativo', async () => {
    await naOrg((tx) =>
      tx.insert(ativos).values([
        { orgId: org, tipoId: tipo, nome: 'Duplicado A', serie: 'DUP-01', busca: '' },
        { orgId: org, tipoId: tipo, nome: 'Duplicado B', serie: 'DUP-01', busca: '' },
        {
          orgId: org,
          tipoId: tipo,
          nome: 'Baixado',
          serie: 'BAIXADO-01',
          hostname: 'BAIXADO',
          situacao: 'inativo',
          busca: '',
        },
      ]),
    );
    const antes = (await naOrg((tx) => tx.select().from(ativos))).length;
    for (const [nome, serie] of [
      ['AMBIGUO', 'DUP-01'],
      ['BAIXADO', 'BAIXADO-01'],
    ]) {
      const corpo = inventario(nome ?? '');
      corpo.bios.ssn = serie ?? '';
      expect((await enviarInventario(nome ?? '', { conteudo: corpo })).statusCode).toBe(200);
    }
    expect(await naOrg((tx) => tx.select().from(ativos))).toHaveLength(antes);
  });

  it('mantém ligação manual, local e modelo existentes, e respeita a trava do IP', async () => {
    expect((await enviarInventario('PRESERVADO')).statusCode).toBe(200);
    const { ativo, agente } = await computadorDo('PRESERVADO');
    await naOrg((tx) =>
      tx
        .update(ativos)
        .set({
          estado: {
            ...ativo.estado,
            'hardware.ip': { origem: 'manual', momento: null, autorId: null, trava: true },
          },
        })
        .where(eq(ativos.id, ativo.id)),
    );
    expect(
      (await cliente.enviar('PUT', `/agentes/${agente.id}/ativo`, entrada, { ativoId: ativo.id }))
        .statusCode,
    ).toBe(204);
    await configurar(tipo, null);
    const corpo = inventario('PRESERVADO');
    corpo.hardware.ipaddr = '10.0.8.44';
    corpo.networks[0] = { ipaddress: '10.0.8.44', macaddr: 'AA:BB:CC:DD:EE:FF' };
    corpo.bios.smodel = 'OUTRO';
    expect((await enviarInventario('PRESERVADO', { conteudo: corpo })).statusCode).toBe(200);
    expect((await computadorDo('PRESERVADO')).ativo).toMatchObject({
      modeloId: ativo.modeloId,
      localId: local,
      valores: { 'hardware.ip': '10.0.8.43' },
    });
    await api.app.inject({
      method: 'POST',
      url: caminho,
      headers: { host },
      payload: { action: 'contact', deviceid: deviceidDo('PRESERVADO') },
    });
    expect(
      (
        await enviarInventario('PRESERVADO', {
          parcial: true,
          conteudo: { hardware: { memory: 16384 } },
        })
      ).statusCode,
    ).toBe(200);
    expect((await computadorDo('PRESERVADO')).agente).toMatchObject({
      ip: '10.0.8.44',
      ligadoAMao: true,
    });
  });

  it('não cria se o local foi inativado depois de configurar', async () => {
    await naOrg((tx) => tx.update(locais).set({ situacao: 'inativo' }).where(eq(locais.id, local)));
    try {
      const antes = (await naOrg((tx) => tx.select().from(ativos))).length;
      expect((await enviarInventario('LOCAL-INATIVO')).statusCode).toBe(200);
      expect(await naOrg((tx) => tx.select().from(ativos))).toHaveLength(antes);
    } finally {
      await naOrg((tx) => tx.update(locais).set({ situacao: 'ativo' }).where(eq(locais.id, local)));
    }
  });

  it('preserva o recebimento quando falta campo obrigatório, sem deixar modelo órfão', async () => {
    const tipoObrigatorio = await naOrg(async (tx) => {
      const [campo] = await tx
        .insert(campos)
        .values({
          orgId: org,
          rotulo: 'Código interno',
          rotuloNormalizado: 'codigo interno',
          tipo: 'texto',
        })
        .returning();
      const [novoTipo] = await tx
        .insert(tiposDeAtivo)
        .values({
          orgId: org,
          nome: 'Exige código',
          nomeNormalizado: 'exige codigo',
          icone: 'computador',
          capacidades: ['hardware.inventario'],
        })
        .returning();
      await tx.insert(camposDoTipo).values({
        orgId: org,
        tipoId: novoTipo?.id ?? '',
        campoId: campo?.id ?? '',
        ordem: 0,
        obrigatorio: true,
      });
      return novoTipo?.id ?? '';
    });
    expect((await configurar(tipoObrigatorio, local)).statusCode).toBe(204);
    const corpo = inventario('OBRIGATORIO');
    corpo.bios.smodel = 'SEM-CODIGO';
    const r = await enviarInventario('OBRIGATORIO', { conteudo: corpo });
    expect(r.statusCode, r.body).toBe(200);
    const [agente] = await naOrg((tx) =>
      tx
        .select()
        .from(agentes)
        .where(eq(agentes.deviceid, deviceidDo('OBRIGATORIO'))),
    );
    expect(agente).toMatchObject({ ativoId: null, ultimoInventario: expect.any(Date) });
    const lista = await cliente.consultar('/agentes', entrada);
    expect(lista.statusCode, lista.body).toBe(200);
    expect(lista.json().agentes).toContainEqual(
      expect.objectContaining({
        nome: 'OBRIGATORIO',
        pendenciaCadastro: { motivo: 'campos', campos: ['Código interno'] },
      }),
    );
    expect(
      await naOrg((tx) => tx.select().from(modelos).where(eq(modelos.nome, 'SEM-CODIGO'))),
    ).toHaveLength(0);
  });

  it('a configuração tem RLS forçado e não é visível para outra organização', async () => {
    const r = await api.dono.query(
      "select relrowsecurity, relforcerowsecurity from pg_class where oid = 'cadastro_dos_agentes'::regclass",
    );
    expect(r.rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
    expect(
      await naOrganizacao(api.banco, outraOrg, (tx) => tx.select().from(cadastroDosAgentes)),
    ).toHaveLength(0);
  });

  it('a série genérica da BIOS não une computadores diferentes', async () => {
    for (const nome of ['GENERICO-A', 'GENERICO-B']) {
      const corpo = inventario(nome);
      corpo.bios.ssn = 'To be filled by O.E.M.';
      expect((await enviarInventario(nome, { conteudo: corpo })).statusCode).toBe(200);
    }
    expect((await computadorDo('GENERICO-A')).ativo.id).not.toBe(
      (await computadorDo('GENERICO-B')).ativo.id,
    );
  });

  it('não reativa modelo inativo nem cadastra em tipo que foi inativado', async () => {
    const [modelo] = await naOrg((tx) =>
      tx
        .insert(modelos)
        .values({
          orgId: org,
          tipoId: tipo,
          fabricante: 'LENOVO',
          fabricanteNormalizado: 'lenovo',
          nome: 'ANTIGO',
          nomeNormalizado: 'antigo',
          situacao: 'inativo',
          busca: 'lenovo antigo',
        })
        .returning(),
    );
    const corpo = inventario('MODELO-INATIVO');
    corpo.bios.smodel = 'ANTIGO';
    expect((await enviarInventario('MODELO-INATIVO', { conteudo: corpo })).statusCode).toBe(200);
    expect((await computadorDo('MODELO-INATIVO')).ativo.modeloId).toBeNull();
    expect(
      (
        await naOrg((tx) =>
          tx
            .select()
            .from(modelos)
            .where(eq(modelos.id, modelo?.id ?? '')),
        )
      )[0]?.situacao,
    ).toBe('inativo');
    await naOrg((tx) =>
      tx.update(tiposDeAtivo).set({ situacao: 'inativo' }).where(eq(tiposDeAtivo.id, tipo)),
    );
    try {
      expect((await enviarInventario('TIPO-INATIVO')).statusCode).toBe(200);
      const [agente] = await naOrg((tx) =>
        tx
          .select()
          .from(agentes)
          .where(eq(agentes.deviceid, deviceidDo('TIPO-INATIVO'))),
      );
      expect(agente?.ativoId).toBeNull();
    } finally {
      await naOrg((tx) =>
        tx.update(tiposDeAtivo).set({ situacao: 'ativo' }).where(eq(tiposDeAtivo.id, tipo)),
      );
    }
  });
});
