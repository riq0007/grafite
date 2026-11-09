import {
  avisar,
  Botao,
  CabecalhoDaPagina,
  EscolhaDeImagem,
  EstadoVazio,
  MiniaturaDeAtivo,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import type { PropsDoCadastroNaAba } from '../../../casca/abasDoApp.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import estilos from '../Ativos.module.css';
import { CHAVE_DOS_MODELOS, chaveDoModelo, type Modelo, useTipos } from '../consultas.ts';
import { FormularioDoModelo, MODELO_VAZIO } from './FormularioDoModelo.tsx';

/**
 * O cadastro de um modelo de equipamento (spec catalogo-de-ativos), o mesmo no catálogo e na aba
 * que um campo abre (change cadastro-em-abas, design, decisão 5): o tipo entre os ativos, ou o
 * que veio do campo, o fabricante, o nome e a imagem, que vai logo depois do cadastro. Se a imagem
 * é recusada, o modelo fica cadastrado, e o aviso diz o motivo. O modelo vai a quem pediu, que
 * navega para a ficha ou o põe no campo.
 */
export function NovoModelo({
  inicial,
  aoConcluir,
  aoCancelar,
  aoMudarPreenchido,
}: PropsDoCadastroNaAba) {
  const api = useApi();
  const consultas = useQueryClient();
  const tipos = useTipos();
  const [arquivo, definirArquivo] = useState<File | null>(null);
  const [previa, definirPrevia] = useState<string | null>(null);
  const [progresso, definirProgresso] = useState<number | undefined>(undefined);

  // A prévia do arquivo escolhido, por um endereço local que sai junto com a escolha.
  useEffect(() => {
    if (!arquivo) {
      definirPrevia(null);
      return;
    }
    const endereco = URL.createObjectURL(arquivo);
    definirPrevia(endereco);
    return () => URL.revokeObjectURL(endereco);
  }, [arquivo]);

  // A escolha do tipo precisa dos tipos: o formulário espera por eles.
  if (!tipos.data) {
    return (
      <>
        <CabecalhoDaPagina titulo="Novo modelo" />
        {tipos.isError ? (
          <EstadoVazio
            titulo={tipos.error.message}
            acao={<Botao onPress={() => void tipos.refetch()}>Tentar de novo</Botao>}
          />
        ) : (
          <p role="status" className={estilos.contagem}>
            Carregando os tipos…
          </p>
        )}
      </>
    );
  }
  const ativos = tipos.data.tipos.filter((tipo) => tipo.situacao === 'ativo');
  // Pedido pelo campo Modelo de um ativo, o modelo é do tipo dele, que não muda aqui.
  const tipoDoAtivo = inicial?.tipoId
    ? tipos.data.tipos.find((tipo) => tipo.id === inicial.tipoId)
    : undefined;

  /** Envia a imagem escolhida ao modelo recém-cadastrado; devolve o modelo e a recusa, se houver. */
  async function enviarImagem(modelo: Modelo): Promise<{ modelo: Modelo; recusa?: string }> {
    if (!arquivo) return { modelo };
    definirProgresso(0);
    const envio = await pedir(
      () => api.enviarArquivo<Modelo>(`/modelos/${modelo.id}/imagem`, arquivo, definirProgresso),
      'enviar a imagem do modelo',
    );
    definirProgresso(undefined);
    return 'erro' in envio ? { modelo, recusa: envio.erro } : { modelo: envio.dados };
  }

  return (
    <div className={estilos.tela}>
      <CabecalhoDaPagina titulo="Novo modelo" />
      <FormularioDoModelo
        inicial={{ ...MODELO_VAZIO, tipoId: inicial?.tipoId ?? null }}
        tipos={ativos}
        {...(tipoDoAtivo ? { tipoFixo: tipoDoAtivo.nome } : {})}
        rotuloDoEnvio="Cadastrar"
        aoCancelar={aoCancelar}
        aoMudarPreenchido={aoMudarPreenchido}
        enviar={async (pedido) => {
          const resultado = await pedir(
            () => api.POST('/modelos', { body: pedido }),
            'cadastrar o modelo',
          );
          if ('erro' in resultado) return recusaDe(resultado);
          const { modelo, recusa } = await enviarImagem(resultado.dados);
          consultas.setQueryData(chaveDoModelo(modelo.id), modelo);
          void consultas.invalidateQueries({ queryKey: CHAVE_DOS_MODELOS });
          avisar({ situacao: 'sucesso', titulo: 'Modelo cadastrado.' });
          if (recusa) {
            avisar({
              situacao: 'atencao',
              titulo: 'A imagem do modelo não foi enviada.',
              descricao: recusa,
            });
          }
          aoConcluir({ id: modelo.id, nome: modelo.nome });
          return { ok: true };
        }}
      >
        <EscolhaDeImagem
          rotulo="Imagem do modelo"
          imagem={
            previa ? (
              <MiniaturaDeAtivo
                tipo="generico"
                imagemDoModelo={previa}
                className={estilos.imagemDaFicha}
              />
            ) : undefined
          }
          progresso={progresso}
          aoEscolher={definirArquivo}
          aoRemover={async () => {
            definirArquivo(null);
            return { ok: true };
          }}
          explicacaoDaRemocao="A imagem escolhida sai do cadastro, e o modelo fica com o ícone do tipo."
        />
      </FormularioDoModelo>
    </div>
  );
}
