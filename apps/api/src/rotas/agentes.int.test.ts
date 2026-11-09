// Os agentes do GLPI pela tela (spec inventario-pelo-agente; change inventario-pelo-agente-glpi): o
// endereço gerado uma vez só, que o agente usa, e o outro que desliga o anterior; a lista com a
// situação; a ligação à mão, que o inventário segue; os softwares na ficha; e as permissões.
import { ativos, auditoria, naOrganizacao, tiposDeAtivo } from '@grafite/db';
import { normalizarTexto } from '@grafite/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const host = 'grafite.tela-agentes.local';
let api: ApiDeTeste;
let org = '';
let cliente: ReturnType<typeof clienteDaApi>;
const entradas: Record<string, Entrada> = {};
let computador = '';

const como = (usuario: string) => entradas[usuario] ?? SEM_ENTRADA;
const caminhoDo = (endereco: string) => new URL(endereco).pathname.replace(/^\/api/, '');
const doAgente = (caminho: string, corpo: object) =>
  api.app.inject({
    method: 'POST',
    url: caminho,
    headers: { host, 'content-type': 'application/json' },
    payload: corpo,
  });

beforeAll(async () => {
  api = await abrirApi();
  org = await criarOrganizacao(api, { nome: 'Empresa', enderecos: [host] });
  cliente = clienteDaApi(api, host);
  const coleta = await criarPerfil(api, org, {
    nome: 'Coleta',
    permissoes: ['coletores.administrar'],
  });
  const ve = await criarPerfil(api, org, { nome: 'Vê ativos', permissoes: ['ativos.ver'] });
  const ana = await criarConta(api, org, { usuario: 'ana', nome: 'Ana Souza' });
  await atribuir(api, org, { perfilId: coleta, contaId: ana.id });
  const carla = await criarConta(api, org, { usuario: 'carla', nome: 'Carla Dias' });
  await atribuir(api, org, { perfilId: ve, contaId: carla.id });
  for (const usuario of ['ana', 'carla']) entradas[usuario] = await cliente.entrar(usuario);
  await naOrganizacao(api.banco, org, async (tx) => {
    const [tipo] = await tx
      .insert(tiposDeAtivo)
      .values({
        orgId: org,
        nome: 'Computador',
        nomeNormalizado: normalizarTexto('Computador'),
        icone: 'computador',
        capacidades: ['hardware.inventario'],
      })
      .returning({ id: tiposDeAtivo.id });
    const [linha] = await tx
      .insert(ativos)
      .values({
        orgId: org,
        tipoId: tipo?.id ?? '',
        busca: '',
        nome: 'Estação do almoxarifado',
      } as typeof ativos.$inferInsert)
      .returning({ id: ativos.id });
    computador = linha?.id ?? '';
  });
});

afterAll(async () => {
  await api?.fechar();
});

let caminho = '';

describe('o endereço dos agentes', () => {
  it('Endereço gerado: aparece uma vez só, o agente o usa, e a lista mostra o agente', async () => {
    const antes = await cliente.consultar('/agentes', como('ana'));
    expect(antes.json()).toEqual({ endereco: null, agentes: [] });
    const r = await cliente.enviar('POST', '/agentes/endereco', como('ana'));
    expect(r.statusCode, r.body).toBe(201);
    expect(r.json().endereco).toMatch(
      new RegExp(`^http://${host.replaceAll('.', '\\.')}/api/agentes/glpi/[\\w-]{40,}$`),
    );
    caminho = caminhoDo(r.json().endereco);
    const contato = await doAgente(caminho, {
      action: 'contact',
      deviceid: 'ALMOX-07-2024-01-01-00-00-00',
      version: '1.7.3',
    });
    expect(contato.statusCode).toBe(200);
    const depois = await cliente.consultar('/agentes', como('ana'));
    expect(depois.json().endereco).toMatchObject({ geradoPor: 'Ana Souza' });
    expect(depois.json().agentes).toEqual([
      expect.objectContaining({
        nome: 'ALMOX-07',
        versao: '1.7.3',
        ativo: null,
        situacao: { tipo: 'neutra', texto: 'Sem inventário' },
      }),
    ]);
    const registros = await naOrganizacao(api.banco, org, (tx) =>
      tx.select().from(auditoria).where(eq(auditoria.acao, 'agentes.endereco-gerado')),
    );
    expect(registros).toHaveLength(1);
    expect(JSON.stringify(registros)).not.toContain(caminho.split('/').at(-1));
  });

  it('gerar outro desliga o anterior', async () => {
    const r = await cliente.enviar('POST', '/agentes/endereco', como('ana'));
    const novo = caminhoDo(r.json().endereco);
    const corpo = { action: 'contact', deviceid: 'ALMOX-07-2024-01-01-00-00-00' };
    expect((await doAgente(caminho, corpo)).statusCode).toBe(403);
    expect((await doAgente(novo, corpo)).statusCode).toBe(200);
    caminho = novo;
  });
});

describe('a ligação e os softwares', () => {
  it('a ligação à mão leva o inventário ao ativo, e os softwares aparecem na ficha', async () => {
    const [agente] = (await cliente.consultar('/agentes', como('ana'))).json().agentes;
    const ligado = await cliente.enviar('PUT', `/agentes/${agente.id}/ativo`, como('ana'), {
      ativoId: computador,
    });
    expect(ligado.statusCode, ligado.body).toBe(204);
    const inventario = await doAgente(caminho, {
      action: 'inventory',
      deviceid: 'ALMOX-07-2024-01-01-00-00-00',
      content: {
        hardware: { name: 'ALMOX-07', memory: 8192 },
        softwares: [
          { name: 'Zoom', version: '5.17', publisher: 'Zoom Video' },
          {
            name: 'Adobe Acrobat Reader',
            version: '24.1',
            publisher: 'Adobe',
            install_date: '2024-05-10',
          },
        ],
      },
    });
    expect(inventario.statusCode).toBe(200);
    const lista = await cliente.consultar('/agentes', como('ana'));
    expect(lista.json().agentes[0]).toMatchObject({
      ativo: { id: computador, rotulo: 'Estação do almoxarifado' },
      ligadoAMao: true,
      situacao: { tipo: 'sucesso', texto: 'Em dia' },
    });
    const softwares = await cliente.consultar(`/ativos/${computador}/softwares`, como('carla'));
    expect(softwares.statusCode, softwares.body).toBe(200);
    expect(softwares.json()).toEqual({
      softwares: [
        {
          nome: 'Adobe Acrobat Reader',
          versao: '24.1',
          editor: 'Adobe',
          instaladoEm: '2024-05-10',
        },
        { nome: 'Zoom', versao: '5.17', editor: 'Zoom Video', instaladoEm: null },
      ],
      inventariadoEm: expect.any(String),
    });
    const [ativo] = await naOrganizacao(api.banco, org, (tx) =>
      tx.select({ valores: ativos.valores }).from(ativos).where(eq(ativos.id, computador)),
    );
    expect(ativo?.valores).toMatchObject({ 'hardware.memoria': 8 });

    const desligado = await cliente.enviar('PUT', `/agentes/${agente.id}/ativo`, como('ana'), {
      ativoId: null,
    });
    expect(desligado.statusCode).toBe(204);
    expect((await cliente.consultar('/agentes', como('ana'))).json().agentes[0]).toMatchObject({
      ativo: null,
      ligadoAMao: false,
    });
  });

  it('sem coletores.administrar, a lista é recusada', async () => {
    expect((await cliente.consultar('/agentes', como('carla'))).statusCode).toBe(403);
  });
});
