// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ARQUIVOS_ESPERADOS,
  achados,
  arquivosForaDoEsperado,
  lerDotenv,
  procurados,
  propriedadesDeFabrica,
} from './conferir-msi.ts';

const CHAVE = 'chave-de-teste-da-organizacao';

describe('procurados', () => {
  it('pega os valores secretos do ambiente e do .env pelo nome, sem os curtos e os outros', () => {
    const lista = procurados(
      { GRAFITE_CHAVE: CHAVE, GRAFITE_AMBIENTE: 'desenvolvimento', PATH: 'C:\\Windows' },
      { GRAFITE_ORIGEM_DOS_LINKS: 'https://grafite.empresa.local', GRAFITE_COLETOR_TOKEN: 'curto' },
    );
    expect(lista.map(({ nome }) => nome)).toEqual([
      'um endereço local com porta',
      'o GRAFITE_CHAVE do ambiente',
      'o GRAFITE_ORIGEM_DOS_LINKS do .env',
    ]);
  });

  it('não repete o valor que está nos dois', () => {
    const lista = procurados(
      { GRAFITE_CHAVE: CHAVE },
      { GRAFITE_ABA_CHAVE_DE_DESENVOLVIMENTO: CHAVE },
    );
    expect(lista).toHaveLength(2);
  });

  it('acha o valor como texto, mesmo com os caracteres de expressão regular', () => {
    const lista = procurados({ GRAFITE_SERVIDOR: 'https://grafite.empresa.local:8443/a?b=(c)' });
    const conteudo = Buffer.from('x https://grafite.empresa.local:8443/a?b=(c) y');
    expect(achados(conteudo, lista)).toEqual(['o GRAFITE_SERVIDOR do ambiente']);
  });
});

describe('lerDotenv', () => {
  it('lê os valores, sem os comentários e sem as aspas', () => {
    const texto =
      '# comentário\nGRAFITE_CHAVE="com aspas"\r\nGRAFITE_SERVIDOR = http://x:1\n\nVAZIO=';
    expect(lerDotenv(texto)).toEqual({
      GRAFITE_CHAVE: 'com aspas',
      GRAFITE_SERVIDOR: 'http://x:1',
      VAZIO: '',
    });
  });
});

describe('achados', () => {
  const lista = procurados({ GRAFITE_CHAVE: CHAVE });

  it('acha o endereço local com porta, e não o do IPC do Tauri nem o de exemplo sem esquema', () => {
    expect(achados(Buffer.from('devUrl http://localhost:5176/'), lista)).toEqual([
      'um endereço local com porta',
    ]);
    expect(achados(Buffer.from('http://127.0.0.1:5173'), lista)).toHaveLength(1);
    expect(achados(Buffer.from('http://ipc.localhost/ e 127.0.0.1:34254'), lista)).toEqual([]);
  });

  it('acha o valor em UTF-16, nos dois alinhamentos', () => {
    const emUtf16 = Buffer.from(CHAVE, 'utf16le');
    expect(achados(emUtf16, lista)).toEqual(['o GRAFITE_CHAVE do ambiente']);
    expect(achados(Buffer.concat([Buffer.from([0]), emUtf16]), lista)).toEqual([
      'o GRAFITE_CHAVE do ambiente',
    ]);
  });
});

describe('arquivosForaDoEsperado', () => {
  it('aceita só o programa da aba e o serviço', () => {
    expect(arquivosForaDoEsperado([...ARQUIVOS_ESPERADOS])).toEqual([]);
    expect(
      arquivosForaDoEsperado([...ARQUIVOS_ESPERADOS, 'CommonAppData/Grafite/Aba/aparelho']),
    ).toEqual(['o arquivo CommonAppData/Grafite/Aba/aparelho, que o MSI não instala']);
    expect(arquivosForaDoEsperado(['PFiles/Grafite Aba/grafite-aba.exe'])).toEqual([
      'a falta do arquivo PFiles/Grafite Aba/grafite-aba-servico.exe',
    ]);
  });
});

describe('propriedadesDeFabrica', () => {
  it('recusa o servidor, a chave e a entrada com valor no MSI', () => {
    expect(propriedadesDeFabrica(['ProductName', 'ARPNOREPAIR'])).toEqual([]);
    expect(propriedadesDeFabrica(['GRAFITE_SERVIDOR', 'GRAFITE_CHAVE'])).toEqual([
      'a propriedade GRAFITE_SERVIDOR com valor de fábrica',
      'a propriedade GRAFITE_CHAVE com valor de fábrica',
    ]);
  });
});
