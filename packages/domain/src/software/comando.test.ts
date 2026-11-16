// O comando e o código de saída em português (spec distribuicao-de-software, "O que a instalação
// faz"; change software-por-pacote, design, decisões 5 e 6).
import { describe, expect, it } from 'vitest';
import {
  codigoDaMensagem,
  type ExplicacaoDoComando,
  explicarOCodigoDeSaida,
  explicarOComando,
} from './comando.ts';

/** A frase como texto corrido e os pedaços que vão em mono dentro dela. */
const frase = (explicacao: ExplicacaoDoComando) => ({
  texto: explicacao.frase?.map((parte) => parte.texto).join('') ?? null,
  mono: explicacao.frase?.filter((parte) => parte.mono).map((parte) => parte.texto) ?? [],
});

const destacados = (explicacao: ExplicacaoDoComando) =>
  explicacao.comando.filter((pedaco) => pedaco.destaque).map((pedaco) => pedaco.texto);

describe('explicarOComando', () => {
  it('Comando do MSI: instala sem abrir janela e sem reiniciar, e a pessoa nem percebe', () => {
    const explicacao = explicarOComando('msiexec /i chrome-131.msi /qn /norestart');
    expect(frase(explicacao)).toEqual({
      texto:
        'instala o arquivo sem abrir janela nem fazer pergunta (/qn) e não reinicia a máquina ' +
        'quando terminar (/norestart). A pessoa nem percebe.',
      mono: ['/qn', '/norestart'],
    });
    expect(explicacao.comando).toEqual([
      { texto: 'msiexec /i', destaque: true },
      { texto: ' chrome-131.msi ', destaque: false },
      { texto: '/qn', destaque: true },
      { texto: ' ', destaque: false },
      { texto: '/norestart', destaque: true },
    ]);
    expect(explicacao.resumo).toBe('sem perguntar e sem reiniciar');
  });

  it('junta os modos com vírgula e o que vem depois com "e", com o log e o arquivo dele', () => {
    const explicacao = explicarOComando(
      'msiexec /i "C:\\Pacotes\\leitor.msi" /passive ALLUSERS=1 REBOOT=ReallySuppress /l*v "C:\\Temp\\leitor.log"',
    );
    expect(frase(explicacao).texto).toBe(
      'instala o arquivo mostrando só o progresso (/passive), para todos os usuários (ALLUSERS=1), ' +
        'não reinicia a máquina quando terminar (REBOOT=ReallySuppress) e grava o log em ' +
        '"C:\\Temp\\leitor.log" (/l*v).',
    );
    // Com a barra do progresso, a pessoa vê a instalação.
    expect(explicacao.resumo).toBe('sem perguntar e sem reiniciar');
  });

  it('não diferencia a maiúscula no msiexec, desinstala com o /x e reinicia com o /forcerestart', () => {
    expect(destacados(explicarOComando('MSIEXEC.EXE /I "x.msi" /QN'))).toEqual([
      'MSIEXEC.EXE /I',
      '/QN',
    ]);
    const explicacao = explicarOComando(
      'msiexec /x {AC76BA86-7AD7-1046-7B44-AC0F074E4100} /qn /forcerestart',
    );
    expect(frase(explicacao).texto).toBe(
      'desinstala o programa sem abrir janela nem fazer pergunta (/qn) e reinicia a máquina ao ' +
        'terminar (/forcerestart).',
    );
    expect(explicacao.resumo).toBe('sem perguntar');
  });

  it('o pedaço repetido entra uma vez na frase', () => {
    expect(frase(explicarOComando('msiexec /i x.msi /qn /quiet')).texto).toBe(
      'instala o arquivo sem abrir janela nem fazer pergunta (/qn).',
    );
  });

  it('conhece os instaladores EXE mais comuns', () => {
    const nsis = explicarOComando('setup.exe /S /NORESTART');
    expect(frase(nsis).texto).toBe(
      'roda o instalador sem perguntar (/S) e não reinicia a máquina quando terminar (/NORESTART). ' +
        'A pessoa nem percebe.',
    );
    // O arquivo do instalador não se destaca, como o arquivo do MSI.
    expect(destacados(nsis)).toEqual(['/S', '/NORESTART']);
    const driver = explicarOComando('"HP Universal.exe" /s /SUPPRESSMSGBOXES');
    expect(frase(driver).texto).toBe(
      'roda o instalador sem perguntar (/s), sem caixas de mensagem (/SUPPRESSMSGBOXES).',
    );
    expect(driver.resumo).toBe('sem perguntar');
    expect(explicarOComando('instalador.exe --silent').resumo).toBe('sem perguntar');
    expect(explicarOComando('instalador.exe /VERYSILENT /norestart').resumo).toBe(
      'sem perguntar e sem reiniciar',
    );
    expect(frase(explicarOComando('instalador.exe /SILENT /NORESTART')).texto).not.toContain(
      'nem percebe',
    );
  });

  it('roda o roteiro do PowerShell', () => {
    const explicacao = explicarOComando('powershell -ExecutionPolicy Bypass -File instalar.ps1');
    expect(frase(explicacao).texto).toBe('roda o roteiro do PowerShell instalar.ps1.');
    expect(explicacao.resumo).toBeNull();
  });

  it('o comando sem nenhum pedaço reconhecido fica só em mono', () => {
    for (const comando of ['cmd /c instalar.bat', '"C:\\Pacotes\\setup.exe" /foo', 'instalar']) {
      const explicacao = explicarOComando(comando);
      expect(explicacao.frase).toBeNull();
      expect(explicacao.comando).toEqual([{ texto: comando, destaque: false }]);
      expect(explicacao.resumo).toBeNull();
    }
  });
});

describe('explicarOCodigoDeSaida', () => {
  it('explica o 1603 como o mockup', () => {
    expect(explicarOCodigoDeSaida(1603)).toBe(
      'Erro fatal: costuma ser outra instalação em andamento. Espere alguns minutos e tente de ' +
        'novo; se repetir, reinicie a máquina.',
    );
  });

  it('explica os códigos do Windows Installer, e o desconhecido fica só com o número', () => {
    const comecos: [number, string][] = [
      [1602, 'Cancelada na máquina'],
      [1618, 'Outra instalação em andamento'],
      [1619, 'O pacote não abriu'],
      [1633, 'Plataforma sem suporte'],
      [1638, 'Outra versão já instalada'],
      [1641, 'Pede reinício'],
      [3010, 'Pede reinício'],
    ];
    for (const [codigo, comeco] of comecos) {
      expect(explicarOCodigoDeSaida(codigo)?.startsWith(comeco)).toBe(true);
    }
    expect(explicarOCodigoDeSaida(1)).toBeNull();
    expect(explicarOCodigoDeSaida(0)).toBeNull();
  });
});

describe('codigoDaMensagem', () => {
  it('lê o código da mensagem "exit status" do agente', () => {
    expect(codigoDaMensagem("exit status: `1603'")).toBe(1603);
    expect(codigoDaMensagem("Executando o comando, exit status: `0'")).toBe(0);
    expect(codigoDaMensagem('exit status: 3010')).toBe(3010);
    expect(codigoDaMensagem("exit status: `-2147024891'")).toBe(-2147024891);
    expect(codigoDaMensagem('job successfully completed')).toBeNull();
    expect(codigoDaMensagem(null)).toBeNull();
  });
});
