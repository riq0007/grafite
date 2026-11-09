// O cadastro e a edição de um pacote de software (spec distribuicao-de-software, "Base de
// software"; change distribuicao-de-software, design, decisões 6 e 7), numa gaveta: o nome, a
// versão, a descrição, o comando, os códigos de sucesso e o arquivo. O arquivo vai depois do
// pacote gravado, com o progresso do envio.
import { LIMITE_DO_ARQUIVO_DO_PACOTE } from '@grafite/domain';
import {
  AreaDeTexto,
  avisar,
  Botao,
  CampoDeTexto,
  EscolhaDeArquivo,
  Gaveta,
  MensagemDoPasso,
} from '@grafite/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { pedir } from '../../../api/pedir.ts';
import { useApi } from '../../../api/useApi.tsx';
import { recusaDe } from '../../administracao/recusa.ts';
import { CHAVE_DO_SOFTWARE, type PacoteDeSoftware } from './consultas.ts';
import estilos from './Software.module.css';

type Campo = 'nome' | 'versao' | 'descricao' | 'comando' | 'codigosDeSucesso' | 'arquivo';

/** Os instaladores e os scripts mais comuns; o agente roda o que o comando mandar. */
const FORMATOS_DO_PACOTE = [
  '.msi',
  '.exe',
  '.msix',
  '.msp',
  '.zip',
  '.7z',
  '.ps1',
  '.bat',
  '.cmd',
  '.reg',
];

/** O endereço que baixa o arquivo guardado, montado das partes. */
export const enderecoDoArquivoDoPacote = (id: string) => `/api/software/pacotes/${id}/arquivo`;

export function Pacote({
  pacote,
  aoFechar,
}: {
  pacote: PacoteDeSoftware | null;
  aoFechar: () => void;
}) {
  const api = useApi();
  const consultas = useQueryClient();
  const [nome, definirNome] = useState(pacote?.nome ?? '');
  const [versao, definirVersao] = useState(pacote?.versao ?? '');
  const [descricao, definirDescricao] = useState(pacote?.descricao ?? '');
  const [comando, definirComando] = useState(pacote?.comando ?? '');
  const [codigos, definirCodigos] = useState((pacote?.codigosDeSucesso ?? [0, 3010]).join(', '));
  const [arquivo, definirArquivo] = useState<File | null>(null);
  const [progresso, definirProgresso] = useState<number | null | undefined>(undefined);
  const [erros, definirErros] = useState<Partial<Record<Campo, string>>>({});
  const [falha, definirFalha] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  // O pacote novo já gravado, quando o arquivo falha: o próximo "Salvar" o edita.
  const [criado, definirCriado] = useState<PacoteDeSoftware | null>(null);
  const existente = pacote ?? criado;

  // O arquivo escolhido e ainda não enviado baixa do próprio navegador.
  const enderecoLocal = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo]);
  useEffect(
    () => () => {
      if (enderecoLocal) URL.revokeObjectURL(enderecoLocal);
    },
    [enderecoLocal],
  );
  const atual =
    arquivo && enderecoLocal
      ? { nome: arquivo.name, bytes: arquivo.size, endereco: enderecoLocal }
      : existente?.arquivo
        ? {
            nome: existente.arquivo.nome,
            bytes: existente.arquivo.tamanho,
            endereco: enderecoDoArquivoDoPacote(existente.id),
          }
        : null;

  async function salvar() {
    definirErros({});
    definirFalha(null);
    definirEnviando(true);
    const corpo = {
      nome,
      versao: versao.trim() || null,
      descricao: descricao.trim() || null,
      comando,
      codigosDeSucesso: codigos,
    };
    const gravado = await pedir(
      () =>
        existente
          ? api.PATCH('/software/pacotes/{id}', {
              params: { path: { id: existente.id } },
              body: corpo,
            })
          : api.POST('/software/pacotes', { body: corpo }),
      'salvar o pacote',
    );
    if ('erro' in gravado) {
      definirEnviando(false);
      const { campos } = recusaDe<Campo>(gravado);
      if (campos && Object.keys(campos).length > 0) definirErros(campos);
      else definirFalha(gravado.erro);
      return;
    }
    if (arquivo) {
      definirProgresso(0);
      const enviado = await pedir(
        () =>
          api.enviarArquivo<PacoteDeSoftware>(
            `/software/pacotes/${gravado.dados.id}/arquivo?nome=${encodeURIComponent(arquivo.name)}`,
            arquivo,
            definirProgresso,
          ),
        'enviar o arquivo do pacote',
      );
      definirProgresso(undefined);
      if ('erro' in enviado) {
        definirEnviando(false);
        await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
        definirErros({ arquivo: enviado.erro });
        if (!existente) {
          definirCriado(gravado.dados);
          definirFalha('O pacote foi cadastrado, mas o arquivo não. Salve de novo para enviar.');
        }
        return;
      }
    }
    definirEnviando(false);
    avisar({ situacao: 'sucesso', titulo: pacote ? 'Pacote salvo.' : 'Pacote cadastrado.' });
    await consultas.invalidateQueries({ queryKey: CHAVE_DO_SOFTWARE });
    aoFechar();
  }

  return (
    <Gaveta
      aberta
      aoMudarAberta={(aberta) => {
        if (!aberta && !enviando) aoFechar();
      }}
      titulo={pacote ? 'Editar pacote' : 'Novo pacote'}
    >
      <form
        className={estilos.formulario}
        onSubmit={(evento) => {
          evento.preventDefault();
          void salvar();
        }}
      >
        <CampoDeTexto
          rotulo="Nome"
          obrigatorio
          value={nome}
          onChange={definirNome}
          erro={erros.nome}
          descricao="Como a equipe procura o pacote, como 7-Zip 23.01."
        />
        <CampoDeTexto rotulo="Versão" value={versao} onChange={definirVersao} erro={erros.versao} />
        <AreaDeTexto
          rotulo="Descrição"
          value={descricao}
          onChange={definirDescricao}
          erro={erros.descricao}
        />
        <EscolhaDeArquivo
          rotulo="Arquivo"
          rotuloAVista
          arquivo={atual}
          aoEscolher={definirArquivo}
          progresso={progresso}
          erro={erros.arquivo}
          formatos={FORMATOS_DO_PACOTE}
          limite={LIMITE_DO_ARQUIVO_DO_PACOTE}
          regras="Instalador ou script, até 512 MB. Vai com o pacote, ao salvar."
          rotuloDoEnvio="Escolher arquivo"
        />
        <AreaDeTexto
          rotulo="Comando"
          obrigatorio
          value={comando}
          onChange={definirComando}
          erro={erros.comando}
          descricao='Roda como o sistema, na pasta do arquivo. Use o modo silencioso, como msiexec /i "7z2301-x64.msi" /qn /norestart.'
        />
        <CampoDeTexto
          rotulo="Códigos de sucesso"
          value={codigos}
          onChange={definirCodigos}
          erro={erros.codigosDeSucesso}
          descricao="Separados por vírgula. O 3010 é o sucesso que pede reiniciar."
        />
        <MensagemDoPasso texto={falha} chave={0} />
        <div className={estilos.rodape}>
          <Botao onPress={aoFechar} isDisabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" nivel="primario" carregando={enviando} rotuloCarregando="Salvando">
            {pacote ? 'Salvar' : 'Cadastrar pacote'}
          </Botao>
        </div>
      </form>
    </Gaveta>
  );
}
