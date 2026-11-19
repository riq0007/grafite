-- O local de trabalho da pessoa na abertura (change chamados-da-ti, design, decisão 5 e "O local da
-- pessoa na abertura", tarefa 4.15): a troca do ativo refaz os locais do chamado com ele, e não com o
-- local de agora da pessoa. Os chamados que já existiam ficam com o local de agora, o único que se
-- conhece; o dono das tabelas lê e grava sem o RLS forçado só durante o preenchimento.
ALTER TABLE "chamados" ADD COLUMN "local_da_pessoa" uuid;--> statement-breakpoint
ALTER TABLE "chamados" ADD CONSTRAINT "chamados_local_da_pessoa_fk" FOREIGN KEY ("org_id","local_da_pessoa") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chamados" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pessoas" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "chamados" SET "local_da_pessoa" = "pessoas"."local_id"
  FROM "pessoas"
  WHERE "pessoas"."org_id" = "chamados"."org_id" AND "pessoas"."id" = "chamados"."pessoa_id";--> statement-breakpoint
ALTER TABLE "pessoas" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chamados" FORCE ROW LEVEL SECURITY;
