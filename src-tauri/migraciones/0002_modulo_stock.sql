CREATE TABLE `ajuste_stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`producto_id` integer NOT NULL,
	`cantidad` real NOT NULL,
	`motivo` text NOT NULL,
	`detalle` text,
	`stock_resultante` real NOT NULL,
	`usuario_id` integer NOT NULL,
	`creado_en` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `producto`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usuario_id`) REFERENCES `usuario`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ajuste_stock_cantidad_no_cero" CHECK("ajuste_stock"."cantidad" != 0),
	CONSTRAINT "ajuste_stock_motivo_valido" CHECK("ajuste_stock"."motivo" in ('rotura', 'vencido', 'conteo', 'otro'))
);
--> statement-breakpoint
CREATE INDEX `ajuste_stock_producto_fecha` ON `ajuste_stock` (`producto_id`,`creado_en`);--> statement-breakpoint
CREATE TABLE `categoria` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`activa` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categoria_nombre_unico` ON `categoria` (`nombre`);--> statement-breakpoint
CREATE TABLE `producto` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`categoria_id` integer,
	`nombre` text NOT NULL,
	`codigo_barras` text,
	`codigo_interno` text,
	`se_vende_por_peso` integer DEFAULT false NOT NULL,
	`unidad_medida` text DEFAULT 'unidad' NOT NULL,
	`costo` real DEFAULT 0 NOT NULL,
	`precio` real DEFAULT 0 NOT NULL,
	`stock_actual` real DEFAULT 0 NOT NULL,
	`stock_minimo` real DEFAULT 0 NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`categoria_id`) REFERENCES `categoria`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "producto_unidad_medida_valida" CHECK("producto"."unidad_medida" in ('unidad', 'kg')),
	CONSTRAINT "producto_costo_no_negativo" CHECK("producto"."costo" >= 0),
	CONSTRAINT "producto_precio_no_negativo" CHECK("producto"."precio" >= 0),
	CONSTRAINT "producto_stock_minimo_no_negativo" CHECK("producto"."stock_minimo" >= 0),
	CONSTRAINT "producto_stock_entero_si_no_es_por_peso" CHECK("producto"."se_vende_por_peso" = true or "producto"."stock_actual" = cast("producto"."stock_actual" as integer))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `producto_codigo_barras_unico` ON `producto` (`codigo_barras`) WHERE "producto"."codigo_barras" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `producto_codigo_interno_unico` ON `producto` (`codigo_interno`) WHERE "producto"."codigo_interno" is not null;