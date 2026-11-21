// "Nova conversa" (spec modulo-chat, "Lista do Chat"; spec chat, "Conversa direta"): a escolha da
// pessoa entre as que usam o chat, pelas palavras do nome. A pessoa com quem a conta já fala abre a
// mesma conversa; a outra abre a direta que ainda não nasceu, que nasce com a primeira mensagem.
import { nomeNoChat } from '@grafite/domain';
import { Botao, BotaoDeIcone, BuscaComSugestoes, Dialogo } from '@grafite/ui';
import { SquarePen } from 'lucide-react';
import { useState } from 'react';
import { useIrNoChat } from './base.tsx';
import { type PessoaDoChat, usePessoasDoChat } from './consultas.ts';

/** O endereço da conversa com a pessoa: a que já existe, ou a direta por nascer. */
const enderecoDaPessoa = (pessoa: Pick<PessoaDoChat, 'conta' | 'conversa'>) =>
  pessoa.conversa ? `/chat/c/${pessoa.conversa}` : `/chat/direta/${pessoa.conta}`;

export function NovaConversa({ className }: { className?: string | undefined }) {
  const irNoChat = useIrNoChat();
  const [aberta, definirAberta] = useState(false);
  return (
    <>
      <BotaoDeIcone
        icone={SquarePen}
        rotulo="Nova conversa"
        className={className}
        onPress={() => definirAberta(true)}
      />
      <Dialogo
        titulo="Nova conversa"
        aberto={aberta}
        aoMudarAberto={definirAberta}
        acoes={(fechar) => <Botao onPress={fechar}>Cancelar</Botao>}
      >
        {(fechar) => (
          <EscolhaDaPessoa
            aoEscolher={(pessoa) => {
              fechar();
              // A direta por nascer mostra a pessoa, que vem no estado da navegação.
              const { conta, nome, daTi, foto } = pessoa;
              irNoChat(enderecoDaPessoa(pessoa), {
                comOEstado: { pessoa: { conta, nome, daTi, foto } },
              });
            }}
          />
        )}
      </Dialogo>
    </>
  );
}

/** A busca da pessoa, na API, enquanto se digita; sem o texto, as primeiras pela ordem do nome. */
function EscolhaDaPessoa({ aoEscolher }: { aoEscolher: (pessoa: PessoaDoChat) => void }) {
  const [texto, definirTexto] = useState('');
  const busca = texto.trim();
  const pessoas = usePessoasDoChat(busca, true);
  const achadas = pessoas.data?.pessoas ?? [];
  const ninguem =
    busca !== '' && pessoas.isSuccess && !pessoas.isPlaceholderData && achadas.length === 0;
  return (
    <BuscaComSugestoes
      rotulo="Pessoa"
      placeholder="Digite o nome"
      autoFocus
      sugestoes={achadas.map((pessoa) => ({
        id: pessoa.conta,
        rotulo: nomeNoChat(pessoa.nome, pessoa.daTi),
      }))}
      sugestoesDeFora
      aceitaTextoLivre={false}
      inputValue={texto}
      onInputChange={definirTexto}
      onSelectionChange={(chave) => {
        const pessoa = achadas.find(({ conta }) => conta === chave);
        if (pessoa) aoEscolher(pessoa);
      }}
      descricao={ninguem ? 'Ninguém com esse nome usa o chat.' : undefined}
      erro={pessoas.isError ? pessoas.error.message : undefined}
    />
  );
}
