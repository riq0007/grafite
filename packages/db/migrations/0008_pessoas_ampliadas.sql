ALTER TABLE "contas" DROP CONSTRAINT "contas_situacao_valida";--> statement-breakpoint
ALTER TABLE "pessoas" DROP CONSTRAINT "pessoas_situacao_valida";--> statement-breakpoint
ALTER TABLE "sessoes" DROP CONSTRAINT "sessoes_fim_com_motivo";--> statement-breakpoint
ALTER TABLE "contas" ALTER COLUMN "usuario" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contas" ALTER COLUMN "hash_senha" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pessoas" ADD COLUMN "matricula" text;--> statement-breakpoint
ALTER TABLE "pessoas" ADD COLUMN "local_id" uuid;--> statement-breakpoint
ALTER TABLE "pessoas" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "pessoas" ADD COLUMN "busca" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "pessoas" ADD COLUMN "anonimizada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_local_fk" FOREIGN KEY ("org_id","local_id") REFERENCES "public"."locais"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pessoas_nome_idx" ON "pessoas" USING btree ("org_id","nome","id");--> statement-breakpoint
CREATE INDEX "pessoas_local_idx" ON "pessoas" USING btree ("org_id","local_id");--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_matricula_unica" UNIQUE("org_id","matricula");--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_anonimizada_sem_credenciais" CHECK (("contas"."situacao" = 'anonimizada') = ("contas"."usuario" is null)
        and ("contas"."situacao" = 'anonimizada') = ("contas"."hash_senha" is null));--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_situacao_valida" CHECK ("contas"."situacao" in ('ativa', 'inativa', 'anonimizada'));--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_matricula_curta" CHECK (length("pessoas"."matricula") <= 32);--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_telefone_curto" CHECK (length("pessoas"."telefone") <= 32);--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_anonimizada_sem_dados" CHECK (("pessoas"."situacao" = 'anonimizada') = ("pessoas"."anonimizada_em" is not null)
        and ("pessoas"."situacao" <> 'anonimizada' or ("pessoas"."email" is null and "pessoas"."matricula" is null
          and "pessoas"."local_id" is null and "pessoas"."telefone" is null)));--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_situacao_valida" CHECK ("pessoas"."situacao" in ('ativa', 'inativa', 'anonimizada'));--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_fim_com_motivo" CHECK (("sessoes"."encerrada_em" is null) = ("sessoes"."motivo_do_fim" is null) and ("sessoes"."motivo_do_fim" is null or "sessoes"."motivo_do_fim" in ('saida', 'encerrada-pelo-usuario', 'outras-encerradas', 'senha-trocada', 'dois-passos-ativados', 'redefinicao', 'tentativas-esgotadas', 'conta-inativada', 'encerrada-pela-administracao', 'dois-passos-removidos')));
--> statement-breakpoint
-- A busca das pessoas que já existem (design do F2b, decisão 9), sem acento e em minúsculas, como o
-- textoDeBusca do domínio. Como dona da tabela, a migration desliga o RLS forçado só durante a
-- regravação e o religa em seguida; o teste-guarda confere o estado final.
ALTER TABLE "pessoas" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
UPDATE "pessoas" SET "busca" = btrim(regexp_replace(translate(lower("nome" || ' ' || coalesce("email", '')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\s+', ' ', 'g'));
--> statement-breakpoint
ALTER TABLE "pessoas" FORCE ROW LEVEL SECURITY;
