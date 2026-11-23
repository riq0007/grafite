-- A mensagem só com os anexos (change chat-com-chamados, tarefa 4.18): o texto nulo na mensagem do
-- chat e na mensagem, na nota e na origem dos chamados. O banco não confere o "texto ou anexo",
-- porque os anexos estão em outra tabela: a guarda é do domínio. A pergunta com as opções segue com
-- o texto, que é a pergunta. Os CHECKs só se alargam para o que a versão anterior grava: ela sempre
-- grava o texto, também na pergunta.
ALTER TABLE "mensagens_do_chat" DROP CONSTRAINT "mensagens_do_chat_conteudo_valido";--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" DROP CONSTRAINT "mensagens_dos_chamados_conteudo_valido";--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" DROP CONSTRAINT "mensagens_dos_chamados_opcoes_validas";--> statement-breakpoint
ALTER TABLE "mensagens_do_chat" ADD CONSTRAINT "mensagens_do_chat_conteudo_valido" CHECK (("mensagens_do_chat"."especie" <> 'mensagem' or ("mensagens_do_chat"."evento" is null and "mensagens_do_chat"."dados" is null
          and ("mensagens_do_chat"."texto" is null or length(trim("mensagens_do_chat"."texto")) between 1 and 4000)))
        and ("mensagens_do_chat"."especie" <> 'evento' or ("mensagens_do_chat"."evento" is not null and "mensagens_do_chat"."texto" is null
          and "mensagens_do_chat"."responde_a" is null)));--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_conteudo_valido" CHECK (("mensagens_dos_chamados"."especie" not in ('mensagem', 'nota', 'origem') or ("mensagens_dos_chamados"."evento" is null
          and ("mensagens_dos_chamados"."texto" is null or length(trim("mensagens_dos_chamados"."texto")) between 1 and 4000)))
        and ("mensagens_dos_chamados"."especie" not in ('mensagem', 'nota') or "mensagens_dos_chamados"."dados" is null)
        and ("mensagens_dos_chamados"."especie" <> 'origem' or "mensagens_dos_chamados"."dados" is not null)
        and ("mensagens_dos_chamados"."especie" <> 'evento' or ("mensagens_dos_chamados"."evento" is not null and "mensagens_dos_chamados"."texto" is null)));--> statement-breakpoint
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_opcoes_validas" CHECK ("mensagens_dos_chamados"."opcoes" is null or ("mensagens_dos_chamados"."especie" = 'mensagem' and "mensagens_dos_chamados"."autor_conta" is not null
        and "mensagens_dos_chamados"."texto" is not null and array_ndims("mensagens_dos_chamados"."opcoes") = 1 and array_lower("mensagens_dos_chamados"."opcoes", 1) = 1
    and cardinality("mensagens_dos_chamados"."opcoes") between 2 and 3 and array_position("mensagens_dos_chamados"."opcoes", null) is null
    and length(trim("mensagens_dos_chamados"."opcoes"[1])) between 1 and 40 and length(trim("mensagens_dos_chamados"."opcoes"[2])) between 1 and 40
    and (cardinality("mensagens_dos_chamados"."opcoes") = 2 or length(trim("mensagens_dos_chamados"."opcoes"[3])) between 1 and 40)));