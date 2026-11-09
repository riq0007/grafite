-- O segundo backup do mesmo minuto (change backup-no-mesmo-minuto): a pasta aceita o sufixo -2,
-- -3 e assim por diante, além do nome do minuto.
ALTER TABLE "operacao"."backups" DROP CONSTRAINT "backups_pasta_valida";--> statement-breakpoint
ALTER TABLE "operacao"."backups" ADD CONSTRAINT "backups_pasta_valida" CHECK ("operacao"."backups"."pasta" is null or "operacao"."backups"."pasta" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{4}Z(-[0-9]+)?$');