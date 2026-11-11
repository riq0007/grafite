ALTER TABLE "paineis" ADD COLUMN "exibicao" text;--> statement-breakpoint
ALTER TABLE "paineis" ADD COLUMN "motivo_da_exibicao" text;--> statement-breakpoint
ALTER TABLE "paineis" ADD CONSTRAINT "paineis_exibicao_valida" CHECK ("paineis"."exibicao" is null or "paineis"."exibicao" in ('aparece', 'recusa', 'pede-entrada'));--> statement-breakpoint
ALTER TABLE "paineis" ADD CONSTRAINT "paineis_motivo_da_exibicao_valido" CHECK (("paineis"."motivo_da_exibicao" is null or length(trim("paineis"."motivo_da_exibicao")) between 1 and 200));