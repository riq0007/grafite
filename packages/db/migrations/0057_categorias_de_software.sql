CREATE TABLE "categorias_de_software" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"org_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"nome_normalizado" text NOT NULL,
	"ordem" integer NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_de_software_org_id_id_unico" UNIQUE("org_id","id"),
	CONSTRAINT "categorias_de_software_nome_unico" UNIQUE("org_id","nome_normalizado"),
	CONSTRAINT "categorias_de_software_nome_valido" CHECK (length(trim("categorias_de_software"."nome")) between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD COLUMN "arquivo_guardado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD COLUMN "arquivo_guardado_por" uuid;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD COLUMN "categoria_id" uuid;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD COLUMN "nome_no_inventario" text;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD COLUMN "nome_no_inventario_normalizado" text;--> statement-breakpoint
ALTER TABLE "categorias_de_software" ADD CONSTRAINT "categorias_de_software_org_id_organizacoes_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizacoes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD CONSTRAINT "pacotes_de_software_categoria_fk" FOREIGN KEY ("org_id","categoria_id") REFERENCES "public"."categorias_de_software"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD CONSTRAINT "pacotes_de_software_guardado_por_fk" FOREIGN KEY ("org_id","arquivo_guardado_por") REFERENCES "public"."contas"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ADD CONSTRAINT "pacotes_de_software_nome_no_inventario_valido" CHECK (("pacotes_de_software"."nome_no_inventario" is null or length(trim("pacotes_de_software"."nome_no_inventario")) between 1 and 120));--> statement-breakpoint
ALTER TABLE "organizacoes" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "categorias_de_software" ("org_id", "nome", "nome_normalizado", "ordem")
  SELECT "organizacoes"."id", "de_fabrica"."nome", "de_fabrica"."nome_normalizado", "de_fabrica"."ordem"
  FROM "organizacoes"
  CROSS JOIN (VALUES
    ('Navegadores', 'navegadores', 1),
    ('Compactadores', 'compactadores', 2),
    ('Drivers', 'drivers', 3),
    ('Escritório', 'escritorio', 4),
    ('Utilitários', 'utilitarios', 5),
    ('Rede e segurança', 'rede e seguranca', 6),
    ('Mídia', 'midia', 7)
  ) AS "de_fabrica"("nome", "nome_normalizado", "ordem");--> statement-breakpoint
UPDATE "pacotes_de_software"
  SET "categoria_id" = "categorias_de_software"."id",
    "nome_no_inventario_normalizado" = "pacotes_de_software"."nome_normalizado"
  FROM "categorias_de_software"
  WHERE "categorias_de_software"."org_id" = "pacotes_de_software"."org_id"
    AND "categorias_de_software"."nome_normalizado" = 'utilitarios';--> statement-breakpoint
ALTER TABLE "pacotes_de_software" ALTER COLUMN "nome_no_inventario_normalizado" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organizacoes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pacotes_de_software" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
SELECT app.isolar_por_organizacao('categorias_de_software');
