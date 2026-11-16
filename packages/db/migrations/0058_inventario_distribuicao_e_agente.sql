ALTER TABLE "maquinas_das_distribuicoes" DROP CONSTRAINT "maquinas_das_distribuicoes_situacao_valida";--> statement-breakpoint
ALTER TABLE "agentes" ADD COLUMN "volta_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cadastro_dos_agentes" ADD COLUMN "dias_sem_contato" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD COLUMN "quando" text DEFAULT 'agora' NOT NULL;--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD COLUMN "a_partir_de" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD COLUMN "fuso" text;--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD COLUMN "para_quem" text;--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD COLUMN "codigo_de_saida" bigint;--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD COLUMN "chamada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD COLUMN "chamada_respondeu" boolean;--> statement-breakpoint
ALTER TABLE "softwares_dos_ativos" ADD COLUMN "nome_normalizado" text;--> statement-breakpoint
ALTER TABLE "softwares_dos_ativos" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "softwares_dos_ativos" SET "nome_normalizado" = btrim(regexp_replace(
  translate(
    lower("nome"),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaaeeeeiiiiooooouuuucnyyaaaaaaeeeeiiiiooooouuuucny'
  ),
  '\s+', ' ', 'g'
));--> statement-breakpoint
ALTER TABLE "softwares_dos_ativos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "softwares_dos_ativos" ALTER COLUMN "nome_normalizado" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "softwares_dos_ativos" ADD COLUMN "do_sistema" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cadastro_dos_agentes" ADD CONSTRAINT "cadastro_dos_agentes_dias_sem_contato_valido" CHECK ("cadastro_dos_agentes"."dias_sem_contato" between 1 and 30);--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD CONSTRAINT "distribuicoes_quando_valido" CHECK ("distribuicoes"."quando" in ('agora', 'noite', 'dia'));--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD CONSTRAINT "distribuicoes_a_partir_de_valido" CHECK (("distribuicoes"."quando" = 'dia') = ("distribuicoes"."a_partir_de" is not null));--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD CONSTRAINT "distribuicoes_fuso_valido" CHECK (("distribuicoes"."quando" = 'agora' or "distribuicoes"."fuso" is not null) and ("distribuicoes"."fuso" is null or length(trim("distribuicoes"."fuso")) between 1 and 64));--> statement-breakpoint
ALTER TABLE "distribuicoes" ADD CONSTRAINT "distribuicoes_para_quem_valido" CHECK (("distribuicoes"."para_quem" is null or length(trim("distribuicoes"."para_quem")) between 1 and 200));--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD CONSTRAINT "maquinas_das_distribuicoes_chamada_valida" CHECK (("maquinas_das_distribuicoes"."chamada_em" is null) = ("maquinas_das_distribuicoes"."chamada_respondeu" is null));--> statement-breakpoint
ALTER TABLE "maquinas_das_distribuicoes" ADD CONSTRAINT "maquinas_das_distribuicoes_situacao_valida" CHECK ("maquinas_das_distribuicoes"."situacao" in ('aguardando', 'em-andamento', 'concluida', 'falhou', 'tirada'));