import { describe, expect, it } from 'vitest';
import {
  ABA_DA_TELA,
  abrirCadastro,
  concluirAba,
  estadoInicialDasAbas,
  fecharAba,
  irParaATela,
  trazerParaFrente,
} from './abasDaJanela.ts';

const pedidoDoLocal = {
  alvo: 'local',
  titulo: 'Novo local',
  origem: ABA_DA_TELA,
  chave: 'ativo-novo:local',
};

describe('as abas da janela', () => {
  it('começam só com a tela, na frente', () => {
    const estado = estadoInicialDasAbas();
    expect(estado.abas).toEqual([{ id: ABA_DA_TELA, tipo: 'tela' }]);
    expect(estado.frente).toBe(ABA_DA_TELA);
  });

  it('o pedido de um campo abre uma aba de cadastro no fim, na frente, com a origem e a chave', () => {
    const { estado, id, nova } = abrirCadastro(estadoInicialDasAbas(), {
      ...pedidoDoLocal,
      inicial: { paiId: 'jundiai' },
    });
    expect(nova).toBe(true);
    expect(estado.frente).toBe(id);
    expect(estado.abas.at(-1)).toEqual({
      id,
      tipo: 'cadastro',
      alvo: 'local',
      titulo: 'Novo local',
      origem: ABA_DA_TELA,
      chave: 'ativo-novo:local',
      inicial: { paiId: 'jundiai' },
    });
  });

  it('o mesmo campo não abre duas abas: o segundo pedido traz a aba aberta para a frente', () => {
    const primeiro = abrirCadastro(estadoInicialDasAbas(), pedidoDoLocal);
    const naTela = trazerParaFrente(primeiro.estado, ABA_DA_TELA);
    const segundo = abrirCadastro(naTela, pedidoDoLocal);
    expect(segundo.nova).toBe(false);
    expect(segundo.id).toBe(primeiro.id);
    expect(segundo.estado.abas).toHaveLength(2);
    expect(segundo.estado.frente).toBe(primeiro.id);
  });

  it('campos diferentes abrem abas diferentes', () => {
    const local = abrirCadastro(estadoInicialDasAbas(), pedidoDoLocal);
    const pessoa = abrirCadastro(local.estado, {
      alvo: 'pessoa',
      titulo: 'Nova pessoa',
      origem: ABA_DA_TELA,
      chave: 'ativo-novo:responsavel',
    });
    expect(pessoa.nova).toBe(true);
    expect(pessoa.id).not.toBe(local.id);
    expect(pessoa.estado.abas.map((aba) => aba.id)).toEqual([ABA_DA_TELA, local.id, pessoa.id]);
  });

  it('fechar uma aba de cadastro volta à aba de onde ela foi pedida', () => {
    const { estado, id } = abrirCadastro(estadoInicialDasAbas(), pedidoDoLocal);
    const fechado = fecharAba(estado, id);
    expect(fechado.abas).toEqual([{ id: ABA_DA_TELA, tipo: 'tela' }]);
    expect(fechado.frente).toBe(ABA_DA_TELA);
  });

  it('a tela não fecha', () => {
    const { estado } = abrirCadastro(estadoInicialDasAbas(), pedidoDoLocal);
    expect(fecharAba(estado, ABA_DA_TELA)).toBe(estado);
  });

  it('fechar uma aba que não está na frente não muda a da frente', () => {
    const local = abrirCadastro(estadoInicialDasAbas(), pedidoDoLocal);
    const pessoa = abrirCadastro(local.estado, {
      alvo: 'pessoa',
      titulo: 'Nova pessoa',
      origem: ABA_DA_TELA,
      chave: 'ativo-novo:responsavel',
    });
    const fechado = fecharAba(pessoa.estado, local.id);
    expect(fechado.frente).toBe(pessoa.id);
    expect(fechado.abas.map((aba) => aba.id)).toEqual([ABA_DA_TELA, pessoa.id]);
  });

  it('concluir fecha a aba, volta à origem e devolve a origem e a chave do campo', () => {
    const { estado, id } = abrirCadastro(estadoInicialDasAbas(), pedidoDoLocal);
    const concluido = concluirAba(estado, id);
    expect(concluido.origem).toBe(ABA_DA_TELA);
    expect(concluido.chave).toBe('ativo-novo:local');
    expect(concluido.estado.abas).toHaveLength(1);
    expect(concluido.estado.frente).toBe(ABA_DA_TELA);
  });

  it('um cadastro pode abrir outro, e cada um volta à aba que o pediu', () => {
    const modelo = abrirCadastro(estadoInicialDasAbas(), {
      alvo: 'modelo',
      titulo: 'Novo modelo',
      origem: ABA_DA_TELA,
      chave: 'ativo-novo:modelo',
    });
    const tipo = abrirCadastro(modelo.estado, {
      alvo: 'tipo',
      titulo: 'Novo tipo',
      origem: modelo.id,
      chave: 'modelo-novo:tipo',
    });
    const tipoConcluido = concluirAba(tipo.estado, tipo.id);
    expect(tipoConcluido.origem).toBe(modelo.id);
    expect(tipoConcluido.estado.frente).toBe(modelo.id);
    const modeloConcluido = concluirAba(tipoConcluido.estado, modelo.id);
    expect(modeloConcluido.origem).toBe(ABA_DA_TELA);
    expect(modeloConcluido.estado.frente).toBe(ABA_DA_TELA);
  });

  it('a aba cuja origem já fechou volta à tela, sem origem para preencher', () => {
    const modelo = abrirCadastro(estadoInicialDasAbas(), {
      alvo: 'modelo',
      titulo: 'Novo modelo',
      origem: ABA_DA_TELA,
      chave: 'ativo-novo:modelo',
    });
    const tipo = abrirCadastro(modelo.estado, {
      alvo: 'tipo',
      titulo: 'Novo tipo',
      origem: modelo.id,
      chave: 'modelo-novo:tipo',
    });
    const semOModelo = fecharAba(tipo.estado, modelo.id);
    expect(semOModelo.abas.map((aba) => aba.id)).toEqual([ABA_DA_TELA, tipo.id]);
    const concluido = concluirAba(semOModelo, tipo.id);
    expect(concluido.origem).toBeUndefined();
    expect(concluido.estado.frente).toBe(ABA_DA_TELA);
  });

  it('ir para a tela traz a primeira aba para a frente e mantém as de cadastro abertas', () => {
    const { estado, id } = abrirCadastro(estadoInicialDasAbas(), pedidoDoLocal);
    const naTela = irParaATela(estado);
    expect(naTela.frente).toBe(ABA_DA_TELA);
    expect(naTela.abas.map((aba) => aba.id)).toEqual([ABA_DA_TELA, id]);
  });

  it('trazer para a frente uma aba que não existe não muda nada', () => {
    const estado = estadoInicialDasAbas();
    expect(trazerParaFrente(estado, 'nenhuma')).toBe(estado);
    expect(concluirAba(estado, 'nenhuma')).toEqual({ estado });
  });
});
