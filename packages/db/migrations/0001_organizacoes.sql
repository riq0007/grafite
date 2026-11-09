CREATE TABLE "organizacoes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
