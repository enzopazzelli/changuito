CREATE TABLE `comercio` (
	`id` integer PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`rubro` text NOT NULL,
	`cuit` text,
	`fiado_activo` integer DEFAULT false NOT NULL,
	`iva_incluido` integer DEFAULT true NOT NULL,
	`redondeo` text DEFAULT 'sin_redondeo' NOT NULL,
	`permite_stock_negativo` integer DEFAULT false NOT NULL,
	`vende_por_peso` integer DEFAULT false NOT NULL,
	CONSTRAINT "un_solo_comercio" CHECK("comercio"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `usuario` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`rol` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL
);
