export { Marca, type PropsDaMarca } from './brand/Marca.tsx';
export { NOME_DO_PRODUTO } from './brand/simbolo.ts';
export {
  type AbaNaJanela,
  AbasDaJanela,
  type PropsDasAbasDaJanela,
} from './casca/AbasDaJanela.tsx';
export {
  BarraDeAbas,
  ordenarParaOCelular,
  type PropsDaBarraDeAbas,
} from './casca/BarraDeAbas.tsx';
export {
  BarraSuperior,
  type PropsDaBarraSuperior,
  type UsuarioDaBarra,
} from './casca/BarraSuperior.tsx';
export { BoasVindas, type PropsDasBoasVindas } from './casca/BoasVindas.tsx';
export {
  ATALHO_DA_BUSCA,
  BuscaGlobal,
  type GrupoDaBusca,
  type PropsDaBuscaGlobal,
  type ResultadoDaBusca,
} from './casca/BuscaGlobal.tsx';
export {
  acompanharRolagem,
  aplicarBarraDoSistema,
  barraDoSistemaSobreposta,
  ligarBarraDeRolagem,
  TEMPO_DA_MARCA_DE_ROLAGEM,
  valeABarraDoSistema,
} from './casca/barraDeRolagem.ts';
export { Casca, JanelaDeConteudo, type PropsDaCasca, TituloDaJanela } from './casca/Casca.tsx';
export {
  CentralDeNotificacoes,
  type FiltroDeSeveridade,
  type FiltrosDaCentral,
  type NotificacaoDaCentral,
  type PropsDaCentralDeNotificacoes,
} from './casca/CentralDeNotificacoes.tsx';
export { CursorSuavizado, type PropsDoCursorSuavizado } from './casca/CursorSuavizado.tsx';
export { Dock, type PropsDoDock } from './casca/Dock.tsx';
export {
  AvisoDoAmbienteDeTeste,
  BotaoDeBusca,
  type PropsDoBotaoDeBusca,
  type PropsDoSinoDeNotificacoes,
  SinoDeNotificacoes,
} from './casca/ItensDaBarra.tsx';
export {
  JanelaComSecoes,
  type PropsDaJanelaComSecoes,
  type PropsDoLinkDaJanela,
  type SecaoDaJanela,
} from './casca/JanelaComSecoes.tsx';
export { esperarMontagem } from './casca/montagem.ts';
export { PainelDeBaixo, type PropsDoPainelDeBaixo } from './casca/PainelDeBaixo.tsx';
export { escolherPostura, type Postura, usePostura } from './casca/postura.ts';
export type {
  ItemDoMenuDaCasca,
  MenuDaBarra,
  ModuloDaCasca,
  PosicaoDoDock,
} from './casca/tipos.ts';
export {
  atualizarCarregamento,
  ID_DO_CARREGAMENTO,
  MOSTRAR_CARREGAMENTO_DEPOIS_DE,
  marcacaoDoCarregamento,
  type SituacaoDoCarregamento,
} from './chegada/carregamento.ts';
export { type AbaDaLista, Abas, type PropsDasAbas } from './componentes/abas/Abas.tsx';
export {
  type ArquivoDaEscolha,
  EscolhaDeArquivo,
  FORMATOS_DE_ARQUIVO,
  LIMITE_DOS_ARQUIVOS,
  type PropsDaEscolhaDeArquivo,
} from './componentes/arquivo/EscolhaDeArquivo.tsx';
export { formatarTamanho } from './componentes/arquivo/tamanho.ts';
export {
  Arvore,
  type ItemDaArvore,
  type PropsDaArvore,
} from './componentes/arvore/Arvore.tsx';
export {
  EscolhaEmArvore,
  type PropsDaEscolhaEmArvore,
} from './componentes/arvore/EscolhaEmArvore.tsx';
export { formatarAtalho, type Plataforma, type Tecla } from './componentes/atalho/atalho.ts';
export {
  type PropsDaTeclaDeAtalho,
  TeclaDeAtalho,
} from './componentes/atalho/TeclaDeAtalho.tsx';
export {
  Avatar,
  type ImagensDoAvatar,
  type PropsDoAvatar,
  type TamanhoDoAvatar,
} from './componentes/avatar/Avatar.tsx';
export { iniciais } from './componentes/avatar/iniciais.ts';
export {
  type Aviso,
  type AvisoNaRegiao,
  avisar,
  criarFilaDeAvisos,
  type FilaDeAvisos,
  filaDeAvisos,
  type SituacaoDoAviso,
} from './componentes/aviso/avisos.ts';
export {
  type PropsDaRegiaoDeAvisos,
  RegiaoDeAvisos,
} from './componentes/aviso/RegiaoDeAvisos.tsx';
export { Botao, type NivelDoBotao, type PropsDoBotao } from './componentes/botao/Botao.tsx';
export {
  BuscaComSugestoes,
  type PropsDaBusca,
  type SugeridasDaBusca,
} from './componentes/busca/BuscaComSugestoes.tsx';
export {
  CabecalhoDaPagina,
  type PropsDoCabecalhoDaPagina,
} from './componentes/cabecalho/CabecalhoDaPagina.tsx';
export { AreaDeTexto } from './componentes/campo/AreaDeTexto.tsx';
export { CampoDeData, type PropsDoCampoDeData } from './componentes/campo/CampoDeData.tsx';
export { CampoDeSenha, type PropsDoCampoDeSenha } from './componentes/campo/CampoDeSenha.tsx';
export { CampoDeTexto, type PropsDoCampoDeTexto } from './componentes/campo/CampoDeTexto.tsx';
export { Formulario, type PropsDoFormulario } from './componentes/campo/Formulario.tsx';
export { LinhaDeCampos, type PropsDaLinhaDeCampos } from './componentes/campo/LinhaDeCampos.tsx';
export {
  LinkDeCadastro,
  type PropsDoLinkDeCadastro,
} from './componentes/campo/LinkDeCadastro.tsx';
export { Carimbo, type PropsDoCarimbo } from './componentes/carimbo/Carimbo.tsx';
export { CodigoQR, type PropsDoCodigoQR } from './componentes/codigoQR/CodigoQR.tsx';
export { copiarParaAreaDeTransferencia } from './componentes/copiar/copiar.ts';
export {
  type PropsDoTextoParaCopiar,
  TextoParaCopiar,
} from './componentes/copiar/TextoParaCopiar.tsx';
export {
  Cartucho,
  type NivelDoCartucho,
  type PropsDoCartucho,
} from './componentes/dados/Cartucho.tsx';
export { Contagem, type PropsDaContagem } from './componentes/dados/Contagem.tsx';
export {
  type DiaDaFaixa,
  formatarNumero,
  type PontoDaTendencia,
  resumoDosDias,
} from './componentes/dados/calculos.ts';
export { FaixaDeDias, type PropsDaFaixaDeDias } from './componentes/dados/FaixaDeDias.tsx';
export { Medidor, type PropsDoMedidor, type Tinta } from './componentes/dados/Medidor.tsx';
export { type PropsDaTendencia, Tendencia } from './componentes/dados/Tendencia.tsx';
export {
  type DadoDaFicha,
  ListaDeDados,
  type PropsDaListaDeDados,
} from './componentes/dados-da-ficha/ListaDeDados.tsx';
export {
  ControleDeslizante,
  type PropsDoControleDeslizante,
  type UnidadeDoControle,
} from './componentes/deslizante/ControleDeslizante.tsx';
export {
  Checkbox,
  GrupoDeCheckboxes,
  type PropsDoCheckbox,
  type PropsDoGrupoDeCheckboxes,
} from './componentes/escolhas/Checkbox.tsx';
export {
  ControleSegmentado,
  type PropsDoControleSegmentado,
  type PropsDoSegmento,
  Segmento,
} from './componentes/escolhas/ControleSegmentado.tsx';
export {
  EscolhaDeIcone,
  type OpcaoDeIcone,
  type PropsDaEscolhaDeIcone,
} from './componentes/escolhas/EscolhaDeIcone.tsx';
export { Interruptor, type PropsDoInterruptor } from './componentes/escolhas/Interruptor.tsx';
export {
  GrupoDeRadios,
  type PropsDoGrupoDeRadios,
  type PropsDoRadio,
  Radio,
} from './componentes/escolhas/Radio.tsx';
export { EstadoDoCampo, type PropsDoEstadoDoCampo } from './componentes/estado/EstadoDoCampo.tsx';
export {
  type EtapaDoFormulario,
  EtapasDoFormulario,
  type PropsDasEtapasDoFormulario,
} from './componentes/etapas/EtapasDoFormulario.tsx';
export {
  type DefinicaoDoFormato,
  EtiquetaDoAtivo,
  FORMATOS_DE_ETIQUETA,
  type FormatoDeEtiqueta,
  type PropsDaEtiquetaDoAtivo,
} from './componentes/etiqueta/EtiquetaDoAtivo.tsx';
export {
  BarraDeProgresso,
  type PropsDaBarraDeProgresso,
} from './componentes/exibicao/BarraDeProgresso.tsx';
export { Esqueleto, type PropsDoEsqueleto } from './componentes/exibicao/Esqueleto.tsx';
export { EstadoVazio, type PropsDoEstadoVazio } from './componentes/exibicao/EstadoVazio.tsx';
export {
  type FiltroAtivo,
  FiltrosAtivos,
  type PropsDosFiltrosAtivos,
} from './componentes/filtros/FiltrosAtivos.tsx';
export { Dica, type PropsDaDica } from './componentes/flutuante/Dica.tsx';
export { Popover, type PropsDoPopover } from './componentes/flutuante/Popover.tsx';
export {
  type ItemDaListaDoHistorico,
  ListaDoHistorico,
  type MudancaNoHistorico,
  type PropsDaListaDoHistorico,
} from './componentes/historico/ListaDoHistorico.tsx';
export {
  EscolhaDeImagem,
  FORMATO_NAO_ACEITO,
  FORMATOS_DE_IMAGEM,
  type PropsDaEscolhaDeImagem,
  type ResultadoDaRemocao,
} from './componentes/imagem/EscolhaDeImagem.tsx';
export {
  type LinhaDaPrevia,
  PreviaDaImportacao,
  type PropsDaPreviaDaImportacao,
} from './componentes/importacao/PreviaDaImportacao.tsx';
export {
  Indicador,
  type PropsDoIndicador,
  type SituacaoDoIndicador,
} from './componentes/indicador/Indicador.tsx';
export {
  ItemDeMenu,
  Menu,
  type PropsDaSecaoDeMenu,
  type PropsDoItemDeMenu,
  type PropsDoMenu,
  type PropsDoSubmenu,
  SecaoDeMenu,
  Separador,
  Submenu,
} from './componentes/menu/Menu.tsx';
export {
  type ItemDoMenuDeContexto,
  MenuDeContexto,
  type PropsDoMenuDeContexto,
} from './componentes/menu/MenuDeContexto.tsx';
export {
  MiniaturaDeAtivo,
  type PropsDaMiniatura,
} from './componentes/miniatura/MiniaturaDeAtivo.tsx';
export { Dialogo, type PropsDoDialogo } from './componentes/modal/Dialogo.tsx';
export { Gaveta, type PropsDaGaveta } from './componentes/modal/Gaveta.tsx';
export {
  EditorDeOpcoes,
  type OpcaoEditavel,
  type PropsDoEditorDeOpcoes,
} from './componentes/opcoes/EditorDeOpcoes.tsx';
export {
  type AcaoDaPrevia,
  type CampoDaPrevia,
  type PropsDoQuickLook,
  QuickLook,
  type VisualDoRegistro,
} from './componentes/previa/QuickLook.tsx';
export {
  type ControleDaPrevia,
  type OpcoesDaPrevia,
  usePrevia,
} from './componentes/previa/usePrevia.ts';
export {
  CartaoDoRegistro,
  type EstadoDoCartao,
  type PropsDoCartaoDoRegistro,
} from './componentes/referencia/CartaoDoRegistro.tsx';
export {
  type PropsDaReferenciaComCartao,
  ReferenciaComCartao,
} from './componentes/referencia/ReferenciaComCartao.tsx';
export {
  type OpcaoDeSelecao,
  type PropsDaSelecao,
  Selecao,
} from './componentes/selecao/Selecao.tsx';
export {
  type PropsDoRotuloDeSituacao,
  RotuloDeSituacao,
  type Situacao,
} from './componentes/situacao/RotuloDeSituacao.tsx';
export {
  type AcaoEmLote,
  BarraDaTabela,
  type PropsDaBarraDaTabela,
  type SelecaoDaBarra,
} from './componentes/tabela/BarraDaTabela.tsx';
export {
  ContagemDaLista,
  type PropsDaContagemDaLista,
} from './componentes/tabela/ContagemDaLista.tsx';
export {
  EditorDeFiltro,
  OPCOES_A_VISTA,
  type OpcaoDoFiltro,
  type PropsDoEditorDeFiltro,
} from './componentes/tabela/EditorDeFiltro.tsx';
export {
  EscolhaDaVisao,
  type EstadoDaEscolhaDaVisao,
  type PropsDaEscolhaDaVisao,
  ROTULOS_DO_ESTADO_DA_VISAO,
  type VisaoDaEscolha,
} from './componentes/tabela/EscolhaDaVisao.tsx';
export { FaixaDaOrigem, type PropsDaFaixaDaOrigem } from './componentes/tabela/FaixaDaOrigem.tsx';
export type {
  FiltroDoEditor,
  OperadorDoEditor,
  TipoDoFiltro,
} from './componentes/tabela/filtro.ts';
export {
  LinhaDaVisao,
  type ParteMudadaDaVisao,
  type PropsDaLinhaDaVisao,
} from './componentes/tabela/LinhaDaVisao.tsx';
export {
  type ColunaDoPainel,
  PainelDeColunas,
  type PropsDoPainelDeColunas,
} from './componentes/tabela/PainelDeColunas.tsx';
export {
  type ColunaDoPainelDeFiltros,
  PainelDeFiltros,
  type PropsDoPainelDeFiltros,
} from './componentes/tabela/PainelDeFiltros.tsx';
export {
  type ItemDoResumo,
  type PosicaoDoResumo,
  type PropsDoResumoDaLinha,
  ResumoDaLinha,
} from './componentes/tabela/ResumoDaLinha.tsx';
export {
  type AlinhamentoDaColuna,
  CabecalhoDaTabela,
  Celula,
  CelulaDaMiniatura,
  Coluna,
  ColunaDaMiniatura,
  ColunaDeAcoes,
  ContagemDaSelecao,
  CorpoDaTabela,
  type DirecaoDaOrdenacao,
  type EspecieDaColuna,
  LIMITES_DA_LARGURA,
  Linha,
  type MenuDaColuna,
  type Ordenacao,
  type PreferenciasDaTabela,
  type PropsDaCelula,
  type PropsDaColuna,
  type PropsDaContagemDaSelecao,
  type PropsDaTabela,
  type PropsDoCorpoDaTabela,
  ProvedorDaTabela,
  Tabela,
} from './componentes/tabela/Tabela.tsx';
export { type PropsDoValorComposto, ValorComposto } from './componentes/tabela/ValorComposto.tsx';
export { CadastroDosDoisPassos, type PropsDoCadastro } from './entrada/CadastroDosDoisPassos.tsx';
export { CodigosDeRecuperacao, type PropsDosCodigos } from './entrada/CodigosDeRecuperacao.tsx';
export { EnderecoDesconhecido } from './entrada/EnderecoDesconhecido.tsx';
export { MensagemDoPasso } from './entrada/MensagemDoPasso.tsx';
export {
  PassoDaSenhaNova,
  type PropsDoPassoDaSenhaNova,
  REGRA_DA_SENHA,
} from './entrada/PassoDaSenhaNova.tsx';
export {
  PassoDasCredenciais,
  type PropsDoPasso,
  type ResultadoDoPasso,
} from './entrada/PassoDasCredenciais.tsx';
export { PassoDoCodigo, type PropsDoPassoDoCodigo } from './entrada/PassoDoCodigo.tsx';
export { type PropsDaTelaDeEntrada, TelaDeEntrada } from './entrada/TelaDeEntrada.tsx';
export { iconeDoTipo, iconesDeAtivo, type TipoComIconeProprio } from './icones/ativos.ts';
export {
  BotaoDeIcone,
  Icone,
  type PropsDoBotaoDeIcone,
  type PropsDoIcone,
  TRACO_DOS_ICONES,
} from './icones/Icone.tsx';
export {
  OpcoesDoBloco,
  type PropsDasOpcoesDoBloco,
} from './inicio/OpcoesDoBloco.tsx';
export {
  OQueResolverAgora,
  type PropsDoOQueResolverAgora,
} from './inicio/OQueResolverAgora.tsx';
export {
  type AtivoDaOcorrencia,
  COLUNAS_DAS_OCORRENCIAS,
  type ColunaDasOcorrencias,
  type EstadoDaFonteDeOcorrencias,
  type FonteDeOcorrenciasNaTela,
  haQuantoTempo,
  idadeRelativa,
  type OcorrenciaAberta,
  type OrdenacaoDasOcorrencias,
  ordenarOcorrencias,
  type SeveridadeDaOcorrencia,
} from './inicio/ocorrencias.ts';
export type {
  OpcaoDoBloco,
  ValorDaOpcaoDoBloco,
  ValoresDasOpcoesDoBloco,
} from './inicio/opcaoDoBloco.ts';
export { criarDataHora, type DataHora } from './regiao/dataHora.ts';
export {
  descreverFuso,
  type FusoDescrito,
  fusoDoSistema,
  fusoReconhecido,
  listaDeFusos,
} from './regiao/fusos.ts';
export {
  type PropsDoProvedorDaRegiao,
  ProvedorDaRegiao,
  useDataHora,
} from './regiao/ProvedorDaRegiao.tsx';
export { contraste as razaoDeContraste } from './tokens/contraste.ts';
export {
  type CoresDoDestaque,
  destaqueDoTema,
  destaques,
  type IdDoDestaque,
} from './tokens/destaques.ts';
export {
  ampliacaoDoDock,
  casca,
  type Densidade,
  densidades,
  escalaDeRaio,
  LIMITES_DE_POSTURA,
  RAIO_BASE_MAXIMO,
  RAIO_BASE_PADRAO,
} from './tokens/escalas.ts';
export type { Variavel } from './tokens/gerado/variaveis.ts';
export { type DestaqueGerado, type IdDaTinta, NOMES_DAS_TINTAS } from './tokens/gerador.ts';
export {
  destaqueDeFabrica,
  destaquePersonalizado,
  type EntradaDoDestaquePersonalizado,
  type EntradaDoTemaPersonalizado,
  lapisDoContraste,
  temaPersonalizado,
  trilhaDasMatizes,
  variaveisDeCor,
  variaveisDoDestaque,
} from './tokens/personalizado.ts';
export { type IdDoTema, type Tema, temas } from './tokens/temas.ts';
export { tempos } from './tokens/tempos.ts';
