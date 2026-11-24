-- O chamado aberto por várias mensagens do chat (change andamento-e-varias-mensagens, decisão 5):
-- uma linha `origem` por mensagem citada, no lugar de uma por chamado, e cada mensagem num chamado
-- só, pelo índice da mensagem. Os dados de antes já cumprem o índice novo, porque a
-- `origem_mensagem_id` do chamado é única. A versão anterior, na volta, grava uma linha `origem` por
-- chamado, e o índice novo a aceita (Migration Plan).
DROP INDEX "mensagens_dos_chamados_origem_unica";--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_dos_chamados_origem_da_mensagem" ON "mensagens_dos_chamados" USING btree ("org_id",("dados" ->> 'mensagem')) WHERE "mensagens_dos_chamados"."especie" = 'origem';