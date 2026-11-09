-- As camadas das preferências de interface (spec preferencias-da-interface; design do F2c,
-- decisão 2): os padrões da organização e as escolhas de cada conta, só com os campos mudados.
-- O domínio valida o conteúdo; o banco confere que é um objeto de até 8 KB.
ALTER TABLE "contas" ADD COLUMN "preferencias" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizacoes" ADD COLUMN "preferencias" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_preferencias_validas" CHECK (jsonb_typeof("contas"."preferencias") = 'object' and octet_length("contas"."preferencias"::text) <= 8192);--> statement-breakpoint
ALTER TABLE "organizacoes" ADD CONSTRAINT "organizacoes_preferencias_validas" CHECK (jsonb_typeof("organizacoes"."preferencias") = 'object' and octet_length("organizacoes"."preferencias"::text) <= 8192);