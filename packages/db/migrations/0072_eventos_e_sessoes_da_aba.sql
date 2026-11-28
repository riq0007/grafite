-- Change aba-dos-colaboradores (pontos da revisão da tarefa 1.1): o público da aba nos eventos,
-- a sessão do chat na aba presa à mesma conta da sessão da aba, e o último registro do aparelho.
ALTER TABLE "eventos" DROP CONSTRAINT "eventos_publico_valido";--> statement-breakpoint
ALTER TABLE "eventos" DROP CONSTRAINT "eventos_publico_curto";--> statement-breakpoint
ALTER TABLE "sessoes" DROP CONSTRAINT "sessoes_sessao_da_aba_fk";
--> statement-breakpoint
ALTER TABLE "aparelhos_da_aba" ADD COLUMN "token_trocado_em" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "sessoes_da_aba" uuid[];--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "aparelhos_da_aba" uuid[];--> statement-breakpoint
ALTER TABLE "eventos" ADD COLUMN "abas" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessoes_da_aba" ADD CONSTRAINT "sessoes_da_aba_org_id_id_conta_unico" UNIQUE("org_id","id","conta_id");--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_sessao_da_aba_fk" FOREIGN KEY ("org_id","sessao_da_aba_id","conta_id") REFERENCES "public"."sessoes_da_aba"("org_id","id","conta_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_publico_valido" CHECK (("eventos"."todas" or "eventos"."permissao" is not null or "eventos"."permissoes" is not null
          or "eventos"."contas" is not null or "eventos"."sessoes" is not null
          or "eventos"."sessoes_da_aba" is not null or "eventos"."aparelhos_da_aba" is not null or "eventos"."abas")
        and ("eventos"."locais" is null or "eventos"."permissao" is not null)
        and ("eventos"."grupos" is null or "eventos"."permissao" is not null));--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_publico_curto" CHECK (coalesce(cardinality("eventos"."locais"), 0) <= 8
        and coalesce(cardinality("eventos"."grupos"), 0) <= 8
        and coalesce(cardinality("eventos"."permissoes"), 0) <= 8
        and coalesce(cardinality("eventos"."contas"), 0) <= 20
        and coalesce(cardinality("eventos"."sessoes"), 0) <= 20
        and coalesce(cardinality("eventos"."sessoes_da_aba"), 0) <= 20
        and coalesce(cardinality("eventos"."aparelhos_da_aba"), 0) <= 20);