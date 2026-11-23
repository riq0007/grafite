-- A chave dos índices da escolha e da avaliação (change chat-com-chamados, design, decisão 2; pontos
-- da revisão da tarefa 1.2): o `escolheu` sem a mensagem nos dados e o `avaliou` sem a resolução
-- dariam a chave nula, que o índice único não compara, e a segunda escolha ou a segunda avaliação
-- entraria sem recusa. A versão anterior não grava esses eventos.
ALTER TABLE "mensagens_dos_chamados" ADD CONSTRAINT "mensagens_dos_chamados_chaves_dos_eventos" CHECK ("mensagens_dos_chamados"."evento" is null
        or (("mensagens_dos_chamados"."evento" <> 'escolheu' or ("mensagens_dos_chamados"."dados" ->> 'mensagem') is not null)
          and ("mensagens_dos_chamados"."evento" <> 'avaliou' or ("mensagens_dos_chamados"."dados" ->> 'resolucao') is not null)));
