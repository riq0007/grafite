import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { carregarConfiguracao, ErroDeConfiguracao } from './config.ts';

const urlBanco = 'postgres://grafite_app:x@localhost:5433/grafite';
/** 32 bytes de valor 7, em base64: uma chave válida e conhecida. */
const chave = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
/** 32 bytes de valor 9 e de valor 11, em base64: a chave do cofre e a que entra na troca. */
const chaveDoCofre = 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=';
const chaveNovaDoCofre = 'CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCws=';
const pasta = '/srv/grafite/arquivos';
const minima = {
  GRAFITE_AMBIENTE: 'producao',
  GRAFITE_DATABASE_URL: urlBanco,
  GRAFITE_CHAVE_DOIS_PASSOS: chave,
  GRAFITE_CHAVE_DO_COFRE: chaveDoCofre,
  GRAFITE_ARQUIVOS_PASTA: pasta,
};

/** O erro de configuração de um ambiente, ou `undefined` quando ele é aceito. */
function erroDe(env: Record<string, string | undefined>): ErroDeConfiguracao | undefined {
  try {
    carregarConfiguracao(env);
    return undefined;
  } catch (erro) {
    if (erro instanceof ErroDeConfiguracao) return erro;
    throw erro;
  }
}

describe('carregarConfiguracao', () => {
  it('aceita a configuração mínima e aplica os padrões não sensíveis', () => {
    expect(carregarConfiguracao(minima)).toEqual({
      ambiente: 'producao',
      urlBanco,
      porta: 3000,
      host: '127.0.0.1',
      // A pasta absoluta, como o sistema a escreve: no Windows, com a letra do disco.
      pastaDosArquivos: resolve(pasta),
      chaveDoisPassos: Buffer.alloc(32, 7),
      chavesDoCofre: { atual: Buffer.alloc(32, 9) },
      proxiesConfiaveis: ['127.0.0.1', '::1'],
    });
  });

  it('a pasta dos arquivos é obrigatória, e a relativa vale a partir da pasta atual', () => {
    const { GRAFITE_ARQUIVOS_PASTA: _, ...semPasta } = minima;
    expect(() => carregarConfiguracao(semPasta)).toThrow(/GRAFITE_ARQUIVOS_PASTA: obrigatória/);
    expect(
      carregarConfiguracao({ ...minima, GRAFITE_ARQUIVOS_PASTA: '.grafite/arquivos' })
        .pastaDosArquivos,
    ).toBe(resolve('.grafite/arquivos'));
  });

  it('a pasta da web compilada é opcional (só em produção)', () => {
    expect(carregarConfiguracao(minima).pastaDaWeb).toBeUndefined();
    expect(carregarConfiguracao({ ...minima, GRAFITE_WEB_PASTA: '/app/web' }).pastaDaWeb).toBe(
      '/app/web',
    );
  });

  it('recusa a ausência da URL do banco nomeando a variável', () => {
    expect(() =>
      carregarConfiguracao({
        GRAFITE_AMBIENTE: 'producao',
        GRAFITE_CHAVE_DOIS_PASSOS: chave,
        GRAFITE_CHAVE_DO_COFRE: chaveDoCofre,
        GRAFITE_ARQUIVOS_PASTA: pasta,
      }),
    ).toThrow(/GRAFITE_DATABASE_URL/);
  });

  it('recusa a ausência da chave dos dois passos nomeando a variável', () => {
    expect(() =>
      carregarConfiguracao({
        GRAFITE_AMBIENTE: 'producao',
        GRAFITE_DATABASE_URL: urlBanco,
        GRAFITE_CHAVE_DO_COFRE: chaveDoCofre,
        GRAFITE_ARQUIVOS_PASTA: pasta,
      }),
    ).toThrow(/GRAFITE_CHAVE_DOIS_PASSOS: obrigatória/);
  });

  it.each([
    ['16 bytes', 'BwcHBwcHBwcHBwcHBwcHBw=='],
    ['33 bytes', 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH'],
    ['texto que não é base64', 'isto não é uma chave em base64, mas tem 44 c'],
  ])('recusa a chave dos dois passos com %s, sem mostrar o valor', (_caso, errada) => {
    let erro: unknown;
    try {
      carregarConfiguracao({ ...minima, GRAFITE_CHAVE_DOIS_PASSOS: errada });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroDeConfiguracao);
    expect((erro as Error).message).toMatch(
      /GRAFITE_CHAVE_DOIS_PASSOS: deve ter 32 bytes em base64/,
    );
    expect((erro as Error).message).not.toContain(errada);
  });

  it('lista todas as variáveis inválidas de uma vez', () => {
    let erro: unknown;
    try {
      carregarConfiguracao({ GRAFITE_DATABASE_URL: 'mysql://x', GRAFITE_API_PORTA: '70000' });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroDeConfiguracao);
    expect((erro as ErroDeConfiguracao).variaveis).toEqual([
      'GRAFITE_AMBIENTE',
      'GRAFITE_DATABASE_URL',
      'GRAFITE_API_PORTA',
      'GRAFITE_ARQUIVOS_PASTA',
      'GRAFITE_CHAVE_DOIS_PASSOS',
      'GRAFITE_CHAVE_DO_COFRE',
    ]);
  });
});

describe('chave do cofre', () => {
  it('é obrigatória, sem mostrar nenhuma chave', () => {
    const { GRAFITE_CHAVE_DO_COFRE: _, ...semChave } = minima;
    const erro = erroDe(semChave);
    expect(erro?.variaveis).toEqual(['GRAFITE_CHAVE_DO_COFRE']);
    expect(erro?.message).toMatch(/GRAFITE_CHAVE_DO_COFRE: obrigatória/);
    expect(erro?.message).not.toContain(chave);
  });

  it.each([
    ['16 bytes', 'CQkJCQkJCQkJCQkJCQkJCQ=='],
    ['33 bytes', 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJ'],
    ['texto que não é base64', 'isto não é a chave do cofre, mas tem 44 cara'],
  ])('recusa a chave com %s, sem mostrar o valor', (_caso, errada) => {
    const erro = erroDe({ ...minima, GRAFITE_CHAVE_DO_COFRE: errada });
    expect(erro?.message).toMatch(/GRAFITE_CHAVE_DO_COFRE: deve ter 32 bytes em base64/);
    expect(erro?.message).not.toContain(errada);
  });

  it('aceita a anterior durante a troca', () => {
    expect(
      carregarConfiguracao({
        ...minima,
        GRAFITE_CHAVE_DO_COFRE: chaveNovaDoCofre,
        GRAFITE_CHAVE_DO_COFRE_ANTERIOR: chaveDoCofre,
      }).chavesDoCofre,
    ).toEqual({ atual: Buffer.alloc(32, 11), anterior: Buffer.alloc(32, 9) });
  });

  it('recusa a anterior fora do formato, sem mostrar o valor', () => {
    const erro = erroDe({ ...minima, GRAFITE_CHAVE_DO_COFRE_ANTERIOR: 'CQkJCQkJCQkJCQkJCQkJCQ==' });
    expect(erro?.variaveis).toEqual(['GRAFITE_CHAVE_DO_COFRE_ANTERIOR']);
    expect(erro?.message).toMatch(/GRAFITE_CHAVE_DO_COFRE_ANTERIOR: deve ter 32 bytes em base64/);
    expect(erro?.message).not.toContain('CQkJCQkJCQkJCQkJCQkJCQ==');
  });

  it('recusa a anterior igual à atual, sem mostrar a chave', () => {
    const erro = erroDe({ ...minima, GRAFITE_CHAVE_DO_COFRE_ANTERIOR: chaveDoCofre });
    expect(erro?.variaveis).toEqual(['GRAFITE_CHAVE_DO_COFRE_ANTERIOR']);
    expect(erro?.message).toMatch(
      /GRAFITE_CHAVE_DO_COFRE_ANTERIOR: deve ser diferente de GRAFITE_CHAVE_DO_COFRE/,
    );
    expect(erro?.message).not.toContain(chaveDoCofre);
  });
});

describe('ambiente', () => {
  it('é obrigatório, sem padrão', () => {
    const { GRAFITE_AMBIENTE: _, ...semAmbiente } = minima;
    expect(erroDe(semAmbiente)?.message).toMatch(
      /GRAFITE_AMBIENTE: obrigatório \(desenvolvimento, teste ou producao\)/,
    );
  });

  it.each(['desenvolvimento', 'teste', 'producao'])('aceita %s', (ambiente) => {
    expect(carregarConfiguracao({ ...minima, GRAFITE_AMBIENTE: ambiente }).ambiente).toBe(ambiente);
  });

  it.each(['homologacao', 'produção', 'Producao'])('recusa %j', (ambiente) => {
    expect(erroDe({ ...minima, GRAFITE_AMBIENTE: ambiente })?.message).toMatch(
      /GRAFITE_AMBIENTE: deve ser desenvolvimento, teste ou producao/,
    );
  });
});

describe('proxies confiáveis', () => {
  it('são só o próprio servidor por padrão', () => {
    expect(carregarConfiguracao(minima).proxiesConfiaveis).toEqual(['127.0.0.1', '::1']);
  });

  it('aceitam endereços e faixas, separados por vírgula', () => {
    expect(
      carregarConfiguracao({
        ...minima,
        GRAFITE_PROXIES_CONFIAVEIS: '10.0.0.5, 172.16.0.0/12, fd00::/8',
      }).proxiesConfiaveis,
    ).toEqual(['10.0.0.5', '172.16.0.0/12', 'fd00::/8']);
  });

  it.each(['proxy.local', '10.0.0.5/40', '', '10.0.0.5,,10.0.0.6'])('recusam %j', (lista) => {
    expect(erroDe({ ...minima, GRAFITE_PROXIES_CONFIAVEIS: lista })?.message).toMatch(
      /GRAFITE_PROXIES_CONFIAVEIS: deve ser uma lista de endereços IP ou faixas CIDR, separados por vírgula/,
    );
  });
});

describe('organização que opera o servidor', () => {
  it('é opcional', () => {
    expect(carregarConfiguracao(minima).organizacaoOperadora).toBeUndefined();
  });

  it('fica como o endereço é registrado', () => {
    expect(
      carregarConfiguracao({ ...minima, GRAFITE_ORGANIZACAO_OPERADORA: 'Grafite.Empresa.Local.' })
        .organizacaoOperadora,
    ).toBe('grafite.empresa.local');
  });

  it('recusa o que não é um endereço', () => {
    expect(
      erroDe({ ...minima, GRAFITE_ORGANIZACAO_OPERADORA: 'grafite empresa' })?.message,
    ).toMatch(
      /GRAFITE_ORGANIZACAO_OPERADORA: deve ser um endereço de acesso, como grafite\.empresa\.local/,
    );
  });
});

describe('backup', () => {
  const destinoUm = resolve('/srv/Backups Grafite/Produção');
  const destinoDois = resolve('/mnt/nas/grafite');
  const urlBackup = 'postgres://grafite_backup:x@127.0.0.1:5432/grafite';
  const urlRestauracao = 'postgres://postgres:y@127.0.0.1:5433/postgres';
  const pgBin = resolve('/opt/postgresql/18/bin');
  const completo = {
    ...minima,
    GRAFITE_BACKUP_DESTINOS: `${destinoUm};${destinoDois}`,
    GRAFITE_BACKUP_URL: urlBackup,
    GRAFITE_RESTAURACAO_URL: urlRestauracao,
    GRAFITE_PG_BIN: pgBin,
  };

  it('sem nenhuma variável, fica sem backup', () => {
    expect(carregarConfiguracao(minima).backup).toBeUndefined();
  });

  it('completo, com os padrões da retenção, da janela e do teste', () => {
    expect(carregarConfiguracao(completo).backup).toEqual({
      destinos: [destinoUm, destinoDois],
      retencao: { diarios: 7, semanais: 4, mensais: 12 },
      janela: { inicio: '00:00', fim: '06:00' },
      teste: 'semanal',
      urlBackup,
      urlRestauracao,
      pastaPgBin: pgBin,
      exigirMarca: false,
    });
  });

  it('no Linux, a marca exigida em cada destino (change servidor-linux-com-docker)', () => {
    expect(
      carregarConfiguracao({ ...completo, GRAFITE_BACKUP_EXIGIR_MARCA: 'sim' }).backup,
    ).toMatchObject({ exigirMarca: true });
    expect(
      carregarConfiguracao({ ...completo, GRAFITE_BACKUP_EXIGIR_MARCA: 'nao' }).backup,
    ).toMatchObject({ exigirMarca: false });
    expect(erroDe({ ...completo, GRAFITE_BACKUP_EXIGIR_MARCA: 'talvez' })?.message).toMatch(
      /GRAFITE_BACKUP_EXIGIR_MARCA: deve ser sim ou nao/,
    );
  });

  it('no Linux, a pasta do banco do teste, para o espaço livre do teste de restauração', () => {
    const pasta = resolve('/opt/grafite/teste/banco');
    expect(
      carregarConfiguracao({ ...completo, GRAFITE_RESTAURACAO_PASTA: pasta }).backup,
    ).toMatchObject({ pastaDaRestauracao: pasta });
    expect(carregarConfiguracao(completo).backup).not.toHaveProperty('pastaDaRestauracao');
    expect(erroDe({ ...completo, GRAFITE_RESTAURACAO_PASTA: 'teste/banco' })?.message).toMatch(
      /GRAFITE_RESTAURACAO_PASTA: deve ser uma pasta absoluta/,
    );
  });

  it('com a retenção, a janela e o teste dados', () => {
    expect(
      carregarConfiguracao({
        ...completo,
        GRAFITE_BACKUP_RETENCAO: '14,8,24',
        GRAFITE_BACKUP_JANELA: '22:00-23:30',
        GRAFITE_BACKUP_TESTE: 'diario',
      }).backup,
    ).toMatchObject({
      retencao: { diarios: 14, semanais: 8, mensais: 24 },
      janela: { inicio: '22:00', fim: '23:30' },
      teste: 'diario',
    });
  });

  it('parcial é recusado, nomeando o que falta', () => {
    const erro = erroDe({ ...minima, GRAFITE_BACKUP_URL: urlBackup });
    expect(erro?.variaveis).toEqual([
      'GRAFITE_BACKUP_DESTINOS',
      'GRAFITE_RESTAURACAO_URL',
      'GRAFITE_PG_BIN',
    ]);
    expect(erro?.message).toMatch(
      /GRAFITE_BACKUP_DESTINOS: obrigatória com o resto do backup \(o backup é configurado inteiro ou nada\)/,
    );
  });

  it('a janela invertida é recusada', () => {
    expect(erroDe({ ...completo, GRAFITE_BACKUP_JANELA: '06:00-02:00' })?.message).toMatch(
      /GRAFITE_BACKUP_JANELA: o início deve vir antes do fim/,
    );
  });

  it.each(['00:00', '24:00-25:00', '0:00-6:00'])(
    'a janela %j fora do formato é recusada',
    (janela) => {
      expect(erroDe({ ...completo, GRAFITE_BACKUP_JANELA: janela })?.message).toMatch(
        /GRAFITE_BACKUP_JANELA: deve ser HH:MM-HH:MM, como 00:00-06:00/,
      );
    },
  );

  it.each(['7,-1,12', '7,4', '7,4,12,1', 'sete,4,12', '7.5,4,12'])(
    'a retenção %j é recusada',
    (retencao) => {
      expect(erroDe({ ...completo, GRAFITE_BACKUP_RETENCAO: retencao })?.message).toMatch(
        /GRAFITE_BACKUP_RETENCAO: deve ter três inteiros não negativos: diários, semanais e mensais, como 7,4,12/,
      );
    },
  );

  it('o teste só é diário ou semanal', () => {
    expect(erroDe({ ...completo, GRAFITE_BACKUP_TESTE: 'mensal' })?.message).toMatch(
      /GRAFITE_BACKUP_TESTE: deve ser semanal ou diario/,
    );
  });

  it('os destinos são pastas absolutas, sem repetir', () => {
    expect(erroDe({ ...completo, GRAFITE_BACKUP_DESTINOS: 'backups' })?.message).toMatch(
      /GRAFITE_BACKUP_DESTINOS: deve ter pastas absolutas, separadas por ponto e vírgula/,
    );
    expect(
      erroDe({ ...completo, GRAFITE_BACKUP_DESTINOS: `${destinoUm};${destinoUm}` })?.message,
    ).toMatch(/GRAFITE_BACKUP_DESTINOS: o mesmo destino aparece duas vezes/);
  });

  it('as conexões são do PostgreSQL, sem mostrar a senha', () => {
    const outroBanco = new URL('mysql://grafite@db/grafite');
    outroBanco.password = 'segredo';
    const erro = erroDe({ ...completo, GRAFITE_BACKUP_URL: outroBanco.toString() });
    expect(erro?.message).toMatch(/GRAFITE_BACKUP_URL: deve começar com postgres:\/\//);
    expect(erro?.message).not.toContain('segredo');
  });
});

describe('vigilância do certificado', () => {
  it('é opcional e guarda o endereço vigiado', () => {
    expect(carregarConfiguracao(minima).certificadoVigiar).toBeUndefined();
    expect(
      carregarConfiguracao({ ...minima, GRAFITE_CERTIFICADO_VIGIAR: 'grafite.empresa.local:443' })
        .certificadoVigiar,
    ).toBe('grafite.empresa.local:443');
  });

  it('recusa o que não é um endereço', () => {
    expect(erroDe({ ...minima, GRAFITE_CERTIFICADO_VIGIAR: 'https://grafite' })?.message).toMatch(
      /GRAFITE_CERTIFICADO_VIGIAR: deve ser o endereço vigiado, como grafite\.empresa\.local ou grafite\.empresa\.local:443/,
    );
  });
});

/** Um par novo da curva P-256, nas chaves do push: a pública não comprimida e a privada. */
function parDoPush() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const { d = '', x = '', y = '' } = privateKey.export({ format: 'jwk' });
  const publica = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(x, 'base64url'),
    Buffer.from(y, 'base64url'),
  ]).toString('base64url');
  return { publica, privada: d };
}

/** O endereço com o usuário e a senha, montado aqui para não ficar escrito no código. */
function comSenha(endereco: string, senha: string): string {
  const url = new URL(endereco);
  url.username = 'grafite';
  url.password = senha;
  return url.href;
}

describe('e-mail', () => {
  const smtp = comSenha('smtp://smtp.empresa.com.br:587', 'S3nh4-do-smtp');
  const comEmail = {
    ...minima,
    GRAFITE_SMTP_URL: smtp,
    GRAFITE_EMAIL_REMETENTE: 'Grafite <grafite@empresa.com.br>',
  };

  it('sem nenhuma variável, fica sem e-mail', () => {
    expect(carregarConfiguracao(minima).email).toBeUndefined();
  });

  it('completo, com o SMTP e o remetente', () => {
    expect(carregarConfiguracao(comEmail).email).toEqual({
      urlSmtp: smtp,
      remetente: 'Grafite <grafite@empresa.com.br>',
    });
  });

  it('o SMTP sem o remetente é recusado, nomeando o que falta e sem mostrar a senha', () => {
    const erro = erroDe({ ...minima, GRAFITE_SMTP_URL: smtp });
    expect(erro?.variaveis).toEqual(['GRAFITE_EMAIL_REMETENTE']);
    expect(erro?.message).toMatch(
      /GRAFITE_EMAIL_REMETENTE: obrigatório com o resto do e-mail \(o e-mail é configurado inteiro ou nada\)/,
    );
    expect(erro?.message).not.toContain('S3nh4');
  });

  it('o SMTP fora do formato é recusado, sem mostrar a senha', () => {
    const erro = erroDe({
      ...comEmail,
      GRAFITE_SMTP_URL: comSenha('http://smtp.empresa.com.br', 'S3nh4'),
    });
    expect(erro?.message).toMatch(/GRAFITE_SMTP_URL: deve começar com smtp:\/\/ ou smtps:\/\//);
    expect(erro?.message).not.toContain('S3nh4');
  });

  it('o remetente sem o e-mail é recusado', () => {
    expect(erroDe({ ...comEmail, GRAFITE_EMAIL_REMETENTE: 'Grafite' })?.message).toMatch(
      /GRAFITE_EMAIL_REMETENTE: deve ter o nome e o e-mail, como Grafite <grafite@empresa\.com\.br>/,
    );
  });
});

describe('push', () => {
  const par = parDoPush();
  const comPush = {
    ...minima,
    GRAFITE_PUSH_CHAVE_PUBLICA: par.publica,
    GRAFITE_PUSH_CHAVE_PRIVADA: par.privada,
    GRAFITE_PUSH_CONTATO: 'mailto:ti@empresa.com.br',
  };

  it('sem nenhuma variável, fica sem push', () => {
    expect(carregarConfiguracao(minima).push).toBeUndefined();
  });

  it('completo, com as chaves e o contato', () => {
    expect(carregarConfiguracao(comPush).push).toEqual({
      chavePublica: par.publica,
      chavePrivada: par.privada,
      contato: 'mailto:ti@empresa.com.br',
    });
  });

  it('a chave pública de outro par é recusada, sem mostrar a privada', () => {
    const erro = erroDe({ ...comPush, GRAFITE_PUSH_CHAVE_PUBLICA: parDoPush().publica });
    expect(erro?.variaveis).toEqual(['GRAFITE_PUSH_CHAVE_PUBLICA']);
    expect(erro?.message).toMatch(
      /GRAFITE_PUSH_CHAVE_PUBLICA: não forma par com GRAFITE_PUSH_CHAVE_PRIVADA/,
    );
    expect(erro?.message).not.toContain(par.privada);
  });

  it('parcial é recusado, nomeando o que falta', () => {
    const erro = erroDe({ ...minima, GRAFITE_PUSH_CHAVE_PUBLICA: par.publica });
    expect(erro?.variaveis).toEqual(['GRAFITE_PUSH_CHAVE_PRIVADA', 'GRAFITE_PUSH_CONTATO']);
    expect(erro?.message).toMatch(
      /GRAFITE_PUSH_CONTATO: obrigatório com o resto do push \(o push é configurado inteiro ou nada\)/,
    );
  });

  it('as chaves e o contato fora do formato são recusados, sem mostrar a privada', () => {
    const erro = erroDe({
      ...comPush,
      GRAFITE_PUSH_CHAVE_PRIVADA: `${par.privada.slice(0, 40)}+++`,
      GRAFITE_PUSH_CONTATO: 'ti@empresa.com.br',
    });
    expect(erro?.variaveis).toEqual(['GRAFITE_PUSH_CHAVE_PRIVADA', 'GRAFITE_PUSH_CONTATO']);
    expect(erro?.message).toMatch(/GRAFITE_PUSH_CHAVE_PRIVADA: deve ter 32 bytes em base64url/);
    expect(erro?.message).not.toContain(par.privada.slice(0, 40));
  });
});

describe('canais no ambiente de teste', () => {
  const par = parDoPush();
  const comCanais = {
    ...minima,
    GRAFITE_AMBIENTE: 'teste',
    GRAFITE_SMTP_URL: 'smtp://smtp.empresa.com.br:587',
    GRAFITE_EMAIL_REMETENTE: 'Grafite <grafite@empresa.com.br>',
    GRAFITE_PUSH_CHAVE_PUBLICA: par.publica,
    GRAFITE_PUSH_CHAVE_PRIVADA: par.privada,
    GRAFITE_PUSH_CONTATO: 'mailto:ti@empresa.com.br',
  };

  it('ficam desligados mesmo configurados, e a configuração diz que foram ignorados', () => {
    const configuracao = carregarConfiguracao(comCanais);
    expect(configuracao.email).toBeUndefined();
    expect(configuracao.push).toBeUndefined();
    expect(configuracao.canaisIgnoradosNoTeste).toBe(true);
  });

  it('sem a configuração deles, não há o que ignorar', () => {
    expect(
      carregarConfiguracao({ ...minima, GRAFITE_AMBIENTE: 'teste' }).canaisIgnoradosNoTeste,
    ).toBeUndefined();
  });
});

describe('origem dos links e serviços de push extras', () => {
  it('são opcionais', () => {
    expect(carregarConfiguracao(minima).origemDosLinks).toBeUndefined();
    expect(carregarConfiguracao(minima).servicosDePushExtras).toBeUndefined();
  });

  it('a origem dos links é http ou https, sem caminho, e fica sem a barra do fim', () => {
    expect(
      carregarConfiguracao({ ...minima, GRAFITE_ORIGEM_DOS_LINKS: 'http://localhost:5173/' })
        .origemDosLinks,
    ).toBe('http://localhost:5173');
    expect(
      erroDe({ ...minima, GRAFITE_ORIGEM_DOS_LINKS: 'http://localhost:5173/web' })?.message,
    ).toMatch(/GRAFITE_ORIGEM_DOS_LINKS: deve ser uma origem http:\/\/ ou https:\/\/, sem caminho/);
  });

  it('os serviços de push extras são origens separadas por vírgula', () => {
    expect(
      carregarConfiguracao({
        ...minima,
        GRAFITE_PUSH_SERVICOS_EXTRAS: 'http://127.0.0.1:4380, https://push.exemplo.test',
      }).servicosDePushExtras,
    ).toEqual(['http://127.0.0.1:4380', 'https://push.exemplo.test']);
    expect(
      erroDe({ ...minima, GRAFITE_PUSH_SERVICOS_EXTRAS: 'push.exemplo.test' })?.message,
    ).toMatch(
      /GRAFITE_PUSH_SERVICOS_EXTRAS: deve ser uma lista de origens http:\/\/ ou https:\/\//,
    );
  });
});
