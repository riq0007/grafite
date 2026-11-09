import { describe, expect, it } from 'vitest';
import {
  ATRIBUTO_DO_USUARIO_PADRAO,
  blocosDoCertificado,
  comSituacaoNoAd,
  conferirConfiguracaoDoDiretorio,
  contaAtivaNoAd,
  escaparFiltro,
  FILTRO_DAS_PESSOAS_PADRAO,
  filtroDaBuscaDeGrupos,
  filtroDaBuscaDeUsuarios,
  filtroDoUsuario,
  gruposDoGrafite,
  LIMITE_DA_AC_DO_SERVIDOR,
  MENSAGENS_DO_DIRETORIO,
  nomeDoDn,
  normalizarDn,
  sincronizacaoDosGrupos,
  textoDaContagem,
} from './diretorio.ts';

const SEGREDO = '0199d3a0-0000-7000-8000-00000000d001';

describe('a configuração do diretório', () => {
  it('aceita o ldaps com a porta e põe os padrões do atributo e do filtro', () => {
    expect(
      conferirConfiguracaoDoDiretorio({
        servidor: ' ldaps://dc01.empresa.local:636 ',
        baseDn: ' DC=empresa,DC=local ',
        segredoId: SEGREDO,
      }),
    ).toEqual({
      ok: true,
      configuracao: {
        servidor: 'ldaps://dc01.empresa.local:636',
        baseDn: 'DC=empresa,DC=local',
        segredoId: SEGREDO,
        atributoDoUsuario: ATRIBUTO_DO_USUARIO_PADRAO,
        filtroDasPessoas: FILTRO_DAS_PESSOAS_PADRAO,
        conferirCertificado: true,
        acDoServidor: null,
        ligado: false,
      },
    });
  });

  // O certificado da AC da empresa (change guia-do-diretorio, design, decisão 2): os blocos em PEM,
  // com as quebras do Windows trocadas; o vazio é sem a AC.
  it('aceita o certificado da AC em PEM, com o CRLF do Windows, e o vazio fica sem a AC', () => {
    const cadeia = [
      '-----BEGIN CERTIFICATE-----',
      'MIIBmTCCAT+gAwIBAgIU',
      'B4+d5rzgatevItzG==',
      '-----END CERTIFICATE-----',
      '',
      '-----BEGIN CERTIFICATE-----',
      'MIIBkTCCATegAwIBAgIU',
      '-----END CERTIFICATE-----',
    ].join('\n');
    const conferida = conferirConfiguracaoDoDiretorio({
      servidor: 'ldaps://dc01.empresa.local',
      baseDn: 'DC=empresa,DC=local',
      segredoId: SEGREDO,
      acDoServidor: `  ${cadeia.replaceAll('\n', '\r\n')}\r\n`,
    });
    expect(conferida).toMatchObject({ ok: true, configuracao: { acDoServidor: cadeia } });
    expect(blocosDoCertificado(cadeia)).toHaveLength(2);
    for (const vazio of ['', '   ', null, undefined]) {
      expect(
        conferirConfiguracaoDoDiretorio({
          servidor: 'ldaps://dc01.empresa.local',
          baseDn: 'DC=empresa,DC=local',
          segredoId: SEGREDO,
          acDoServidor: vazio,
        }),
      ).toMatchObject({ ok: true, configuracao: { acDoServidor: null } });
    }
  });

  it('Certificado que não é da AC: recusa o texto fora do PEM, a chave e o que passa do limite', () => {
    const pedido = (acDoServidor: string) =>
      conferirConfiguracaoDoDiretorio({
        servidor: 'ldaps://dc01.empresa.local',
        baseDn: 'DC=empresa,DC=local',
        segredoId: SEGREDO,
        acDoServidor,
      });
    const bloco = '-----BEGIN CERTIFICATE-----\nMIIBmTCCAT+gAwIBAgIU\n-----END CERTIFICATE-----';
    for (const recusado of [
      'a raiz da AC da empresa',
      '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49\n-----END PRIVATE KEY-----',
      `subject=CN=AC da empresa\n${bloco}`,
      '-----BEGIN CERTIFICATE-----\nMIIBmTCCAT+gAwIBAgIU',
    ]) {
      expect(pedido(recusado)).toEqual({
        ok: false,
        campos: { acDoServidor: MENSAGENS_DO_DIRETORIO.acDoServidor },
      });
    }
    expect(MENSAGENS_DO_DIRETORIO.acDoServidor).toBe(
      'Cole o certificado da AC em PEM, que começa com -----BEGIN CERTIFICATE-----.',
    );
    const longa = Array(Math.ceil(LIMITE_DA_AC_DO_SERVIDOR / bloco.length) + 1)
      .fill(bloco)
      .join('\n');
    expect(pedido(longa)).toEqual({
      ok: false,
      campos: { acDoServidor: 'Use até 20.000 caracteres no certificado da AC.' },
    });
  });

  it('recusa o servidor fora do formato, a base vazia, a conta sem o cofre, o atributo e o filtro', () => {
    expect(
      conferirConfiguracaoDoDiretorio({
        servidor: 'http://dc01',
        baseDn: ' ',
        segredoId: null,
        atributoDoUsuario: 'sam account',
        filtroDasPessoas: 'objectClass=user',
      }),
    ).toEqual({
      ok: false,
      campos: {
        servidor: MENSAGENS_DO_DIRETORIO.servidor,
        baseDn: MENSAGENS_DO_DIRETORIO.baseDn,
        segredoId: MENSAGENS_DO_DIRETORIO.contaDeServico,
        atributoDoUsuario: MENSAGENS_DO_DIRETORIO.atributo,
        filtroDasPessoas: MENSAGENS_DO_DIRETORIO.filtro,
      },
    });
    expect(
      conferirConfiguracaoDoDiretorio({
        servidor: 'ldap://dc01:70000',
        baseDn: 'empresa',
        segredoId: SEGREDO,
        filtroDasPessoas: '(&(objectClass=user)',
      }),
    ).toMatchObject({
      ok: false,
      campos: {
        servidor: MENSAGENS_DO_DIRETORIO.servidor,
        baseDn: MENSAGENS_DO_DIRETORIO.baseDn,
        filtroDasPessoas: MENSAGENS_DO_DIRETORIO.filtro,
      },
    });
  });
});

describe('os filtros', () => {
  it('escapa os caracteres especiais do LDAP no valor', () => {
    expect(escaparFiltro('a*b(c)d\\e\u0000')).toBe('a\\2ab\\28c\\29d\\5ce\\00');
  });

  it('busca a pessoa pelo atributo do usuário, dentro do filtro das pessoas', () => {
    expect(
      filtroDoUsuario(
        { atributoDoUsuario: 'sAMAccountName', filtroDasPessoas: FILTRO_DAS_PESSOAS_PADRAO },
        'mariana*',
      ),
    ).toBe('(&(&(objectCategory=person)(objectClass=user))(sAMAccountName=mariana\\2a))');
  });

  it('a busca de usuários procura no usuário, no nome e no e-mail; sem termo, todos', () => {
    const configuracao = {
      atributoDoUsuario: 'sAMAccountName',
      filtroDasPessoas: '(objectClass=user)',
    };
    expect(filtroDaBuscaDeUsuarios(configuracao, ' ana ')).toBe(
      '(&(objectClass=user)(|(sAMAccountName=*ana*)(displayName=*ana*)(mail=*ana*)))',
    );
    expect(filtroDaBuscaDeUsuarios(configuracao, '')).toBe('(objectClass=user)');
    expect(filtroDaBuscaDeGrupos('TI(')).toBe('(&(objectClass=group)(cn=*TI\\28*))');
    expect(filtroDaBuscaDeGrupos('  ')).toBe('(objectClass=group)');
  });
});

describe('os DNs', () => {
  it('normaliza o DN para comparar: minúsculo e sem espaços entre as partes', () => {
    expect(normalizarDn(' CN=TI-Suporte, OU=Grupos ,DC = Empresa,DC=local')).toBe(
      'cn=ti-suporte,ou=grupos,dc=empresa,dc=local',
    );
    expect(normalizarDn('CN=Silva\\, Ana,OU=TI')).toBe('cn=silva\\, ana,ou=ti');
  });

  it('o nome do DN é o valor da primeira parte', () => {
    expect(nomeDoDn('CN=TI-Suporte,OU=Grupos,DC=empresa')).toBe('TI-Suporte');
    expect(nomeDoDn('CN=Silva\\, Ana,OU=TI')).toBe('Silva, Ana');
    expect(nomeDoDn('sem-igual')).toBe('sem-igual');
  });
});

describe('a situação no AD', () => {
  it('o bit 2 do userAccountControl desativa a conta', () => {
    expect(contaAtivaNoAd(512)).toBe(true);
    expect(contaAtivaNoAd(514)).toBe(false);
    expect(contaAtivaNoAd(null)).toBe(true);
    expect(comSituacaoNoAd(512, false)).toBe(514);
    expect(comSituacaoNoAd(514, true)).toBe(512);
    expect(comSituacaoNoAd(66050, true)).toBe(66048);
  });
});

describe('os grupos do Grafite', () => {
  const MAPEAMENTOS = [
    { grupoDn: 'CN=TI-Suporte,OU=Grupos,DC=empresa', grupoId: 'tecnicos' },
    { grupoDn: 'CN=TI-Gestao,OU=Grupos,DC=empresa', grupoId: 'gestores' },
    { grupoDn: 'CN=TI-Plantao,OU=Grupos,DC=empresa', grupoId: 'tecnicos' },
  ];

  it('os grupos mapeados da pessoa, sem repetir, com o DN em outra caixa', () => {
    expect(
      gruposDoGrafite(
        ['cn=ti-suporte,ou=grupos,dc=empresa', 'CN=TI-Plantao, OU=Grupos,DC=empresa', 'CN=Outro'],
        MAPEAMENTOS,
      ),
    ).toEqual(['tecnicos']);
    expect(gruposDoGrafite(['CN=Outro'], MAPEAMENTOS)).toEqual([]);
  });

  it('a sincronização inclui nos devidos e tira só dos grupos que são alvo de mapeamento', () => {
    expect(
      sincronizacaoDosGrupos({
        alvos: ['tecnicos', 'gestores'],
        devidos: ['tecnicos'],
        atuais: ['gestores', 'manual'],
      }),
    ).toEqual({ incluir: ['tecnicos'], encerrar: ['gestores'] });
  });
});

describe('o texto do teste da conexão', () => {
  it('diz quantos usuários a base tem, até 1.000', () => {
    expect(textoDaContagem(1)).toBe('Conectado: 1 usuário na base.');
    expect(textoDaContagem(238)).toBe('Conectado: 238 usuários na base.');
    expect(textoDaContagem(1000)).toBe('Conectado: 1.000 usuários na base.');
    expect(textoDaContagem(1001)).toBe('Conectado: mais de 1.000 usuários na base.');
  });
});
