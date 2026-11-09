// Os esquemas do catálogo de ativos no contrato da API (spec catalogo-de-ativos; design do P1a,
// decisão 10), comuns às rotas dos tipos, dos campos e dos modelos.
import {
  POLITICAS_DE_ESCRITA,
  SITUACOES_DA_OPCAO,
  SITUACOES_DO_CADASTRO,
  TIPOS_DE_CAMPO,
  VERSOES_DO_SNMP,
} from '@grafite/domain';
import { z } from 'zod';

export const SituacaoDoCadastro = z.enum(SITUACOES_DO_CADASTRO);

export const OpcaoDaLista = z
  .object({
    id: z.string(),
    rotulo: z.string(),
    situacao: z.enum(SITUACOES_DA_OPCAO),
  })
  .meta({ id: 'OpcaoDaLista' });

/** A configuração conferida de um campo, conforme o tipo dele. */
export const ConfiguracaoDoCampo = z
  .object({
    minimo: z.number().optional(),
    maximo: z.number().optional(),
    casas: z.number().int().optional(),
    opcoes: z.array(OpcaoDaLista).optional(),
    /** No campo de ativo, os tipos aceitos; sem eles, qualquer tipo. */
    tipos: z.array(z.uuid()).optional(),
    /** No campo de ativo, o nome do grupo no lado de lá, como "Monitores". */
    ladoDeLa: z.string().optional(),
  })
  .meta({ id: 'ConfiguracaoDoCampo' });

export const CampoDaCapacidade = z
  .object({
    chave: z.string(),
    rotulo: z.string(),
    tipo: z.enum(TIPOS_DE_CAMPO),
    grupo: z.string(),
    configuracao: ConfiguracaoDoCampo,
    escrita: z.enum(POLITICAS_DE_ESCRITA),
  })
  .meta({ id: 'CampoDaCapacidade' });

export const Capacidade = z
  .object({
    chave: z.string(),
    nome: z.string(),
    descricao: z.string(),
    campos: z.array(CampoDaCapacidade),
    /**
     * O que o tipo escolhe ao ligá-la: o campo de IP da disponibilidade na rede; o campo de IP, a
     * versão e a comunidade do SNMP; o campo de IP, a porta e o login do Control iD; ou o horário
     * do backup do Control iD.
     */
    configuracao: z
      .enum(['campo-de-ip', 'snmp', 'control-id', 'backup-do-control-id', 'acesso-remoto'])
      .nullable(),
  })
  .meta({ id: 'Capacidade' });

/**
 * A configuração que o tipo guarda das capacidades que pedem uma (design do P2a, decisão 10, do P2b,
 * decisão 3, e do P2c, decisão 2). Nos suprimentos, sem a versão vale a 2c, e sem o segredo, a
 * comunidade `public`; na saúde do Control iD, sem a porta vale a 80, e o login é obrigatório.
 */
export const ConfiguracaoDasCapacidades = z
  .object({
    'rede.disponibilidade': z
      .object({ campoDoIp: z.uuid({ error: 'Escolha o campo de IP que o ping usa.' }) })
      .optional(),
    'snmp.suprimentos': z
      .object({
        // Sem o campo, a recusa do domínio vem na configuração inteira, como a do ping sem ele.
        campoDoIp: z.uuid({ error: 'Escolha o campo de IP que o SNMP usa.' }).optional(),
        versao: z.enum(VERSOES_DO_SNMP, { error: 'Escolha a versão 1 ou 2c do SNMP.' }).optional(),
        segredoId: z
          .uuid({ error: 'Escolha uma comunidade SNMP ativa do cofre.' })
          .nullable()
          .optional(),
      })
      .optional(),
    'controlid.saude': z
      .object({
        // Sem o campo ou o login, a recusa do domínio vem na configuração inteira.
        campoDoIp: z.uuid({ error: 'Escolha o campo de IP que a sondagem usa.' }).optional(),
        porta: z.number({ error: 'Informe uma porta de 1 a 65535.' }).optional(),
        segredoId: z
          .uuid({
            error:
              'Escolha um login ativo do cofre, do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido.',
          })
          .nullable()
          .optional(),
      })
      .optional(),
    // O backup do Control iD (change p5a-backup-do-control-id): sem o horário, as 02:00.
    'controlid.backup': z
      .object({ horario: z.string({ error: 'Informe o horário como 02:00.' }).optional() })
      .optional(),
    // O acesso remoto (change acesso-remoto-vnc): sem a porta, a 5900.
    'acesso.vnc': z
      .object({ porta: z.number({ error: 'Informe a porta de 1 a 65535.' }).optional() })
      .optional(),
  })
  .meta({ id: 'ConfiguracaoDasCapacidades' });
