// O diretório de desenvolvimento (change aba-dos-colaboradores, design, decisão 13): o AD simulado
// com o usuário do Windows de quem desenvolve, que só atende a organização só com endereços locais
// e só no servidor marcado; os outros servidores seguem para o cliente de verdade.
import { describe, expect, it, vi } from 'vitest';
import { type AcessoAoDiretorio, type ClienteDoDiretorio, FalhaDoDiretorio } from './cliente.ts';
import {
  CONTA_DE_SERVICO_DE_DESENVOLVIMENTO,
  conectarDiretorioDeDesenvolvimento,
  GRUPO_DO_AD_DE_DESENVOLVIMENTO,
  lerUsuarioDoWindows,
  SENHA_DA_ABA_DE_DESENVOLVIMENTO,
  SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO,
} from './desenvolvimento.ts';

const SID = 'S-1-5-21-1004336348-1177238915-682003330-1001';
const quem = { usuario: 'fernanda.lima', sid: SID };

const acesso = (orgId: string, servidor = SERVIDOR_DO_DIRETORIO_DE_DESENVOLVIMENTO) =>
  ({
    orgId,
    servidor,
    baseDn: 'DC=empresa,DC=local',
    atributoDoUsuario: 'sAMAccountName',
    filtroDasPessoas: '(&(objectCategory=person)(objectClass=user))',
    conferirCertificado: false,
    acDoServidor: null,
    conta: CONTA_DE_SERVICO_DE_DESENVOLVIMENTO,
  }) satisfies AcessoAoDiretorio;

function montar(enderecos: Record<string, string[]>) {
  const outro = vi.fn((_: AcessoAoDiretorio) => ({}) as ClienteDoDiretorio);
  const avisar = vi.fn();
  const conectar = conectarDiretorioDeDesenvolvimento({
    quem,
    enderecosDa: async (orgId) => enderecos[orgId] ?? [],
    outro,
    avisar,
  });
  return { conectar, outro, avisar };
}

describe('o usuário do Windows', () => {
  it('lê o usuário, sem o domínio e em minúsculas, e o SID do whoami', () => {
    expect(lerUsuarioDoWindows(`"EMPRESA\\Fernanda.Lima","${SID}"\r\n`)).toEqual(quem);
  });

  it('sem o SID na saída, não há usuário', () => {
    expect(lerUsuarioDoWindows('')).toBeNull();
    expect(lerUsuarioDoWindows('"EMPRESA\\fernanda.lima","sem-sid"')).toBeNull();
  });
});

describe('a recusa', () => {
  it('a organização com um endereço que não é local não é atendida', async () => {
    const { conectar, avisar } = montar({ org: ['localhost', 'grafite.empresa.com.br'] });
    const cliente = conectar(acesso('org'));
    await expect(
      cliente.autenticar('fernanda.lima', SENHA_DA_ABA_DE_DESENVOLVIMENTO),
    ).rejects.toEqual(new FalhaDoDiretorio('nao-respondeu'));
    await expect(cliente.contarUsuarios(10)).rejects.toBeInstanceOf(FalhaDoDiretorio);
    expect(avisar).toHaveBeenCalledWith(
      { orgId: 'org', enderecos: ['grafite.empresa.com.br'] },
      'o diretório de desenvolvimento só atende a organização só com endereços locais',
    );
  });

  it('a organização sem endereço nenhum também não é atendida', async () => {
    const { conectar } = montar({});
    await expect(
      conectar(acesso('sem-endereco')).autenticar('fernanda.lima', SENHA_DA_ABA_DE_DESENVOLVIMENTO),
    ).rejects.toBeInstanceOf(FalhaDoDiretorio);
  });

  it('outro servidor segue para o cliente de verdade, sem o diretório simulado', () => {
    const { conectar, outro } = montar({ org: ['localhost'] });
    const deVerdade = acesso('org', 'ldaps://dc01.empresa.local');
    conectar(deVerdade);
    expect(outro).toHaveBeenCalledWith(deVerdade);
  });
});

describe('na organização de desenvolvimento', () => {
  it('quem desenvolve entra com a senha da aba, no grupo mapeado, e a outra senha é recusada', async () => {
    const { conectar, outro } = montar({ org: ['localhost', '127.0.0.1'] });
    const cliente = conectar(acesso('org'));
    const achado = await cliente.autenticar('Fernanda.Lima', SENHA_DA_ABA_DE_DESENVOLVIMENTO);
    expect(achado).toMatchObject({ usuario: 'fernanda.lima', ativa: true });
    expect(achado?.grupos).toEqual([GRUPO_DO_AD_DE_DESENVOLVIMENTO]);
    expect(await cliente.autenticar('fernanda.lima', 'admin123')).toBeNull();
    expect(outro).not.toHaveBeenCalled();
  });

  it('a conta de serviço errada é recusada, como no AD', async () => {
    const { conectar } = montar({ org: ['localhost'] });
    const cliente = conectar({ ...acesso('org'), conta: { usuario: 'outra', senha: 'x' } });
    await expect(cliente.contarUsuarios(10)).rejects.toEqual(
      new FalhaDoDiretorio('conta-recusada'),
    );
  });
});
