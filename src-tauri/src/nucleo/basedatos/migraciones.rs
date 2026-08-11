// Motor de migraciones propio. No usamos el migrator interno de Drizzle
// (crea su propia tabla de bookkeeping en inglés, `__drizzle_migrations`
// con columnas `id/hash/created_at`, lo que rompe la regla de "todo en
// español") ni el de tauri-plugin-sql (no usamos ese plugin, ver
// conexion.rs). El SQL de cada migración se genera con `drizzle-kit
// generate` y se embebe acá con `include_str!`: queda adentro del
// binario, sin diferencia entre dev y build, y sin depender de poder
// leer archivos sueltos desde el WebView.
//
// Cada migración corre en su propia transacción junto con la fila que
// la registra en `migracion`: si algo del SQL falla, no queda ni la
// migración a medias ni el registro de que se aplicó.

use sqlx::SqlitePool;
use std::error::Error;

pub struct Migracion {
    pub version: i64,
    pub sql: &'static str,
}

pub const MIGRACIONES: &[Migracion] = &[
    Migracion {
        version: 0,
        sql: include_str!("../../../migraciones/0000_fundacion.sql"),
    },
    Migracion {
        version: 1,
        sql: include_str!("../../../migraciones/0001_respaldos.sql"),
    },
    Migracion {
        version: 2,
        sql: include_str!("../../../migraciones/0002_modulo_stock.sql"),
    },
];

async fn version_maxima_aplicada(pool: &SqlitePool) -> Result<i64, Box<dyn Error + Send + Sync>> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS migracion (
            version INTEGER PRIMARY KEY,
            aplicada_en TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    let maxima: i64 = sqlx::query_scalar("SELECT COALESCE(MAX(version), -1) FROM migracion")
        .fetch_one(pool)
        .await?;

    Ok(maxima)
}

/// Para decidir si hace falta respaldar antes de arrancar (§5.4): "antes
/// de cualquier migración de base, respaldo automático". No aplica
/// nada, solo mira si haría falta.
pub async fn hay_pendientes(
    pool: &SqlitePool,
    migraciones: &[Migracion],
) -> Result<bool, Box<dyn Error + Send + Sync>> {
    let maxima_aplicada = version_maxima_aplicada(pool).await?;
    Ok(migraciones.iter().any(|m| m.version > maxima_aplicada))
}

pub async fn aplicar(
    pool: &SqlitePool,
    migraciones: &[Migracion],
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let maxima_aplicada = version_maxima_aplicada(pool).await?;

    for migracion in migraciones {
        if migracion.version <= maxima_aplicada {
            continue;
        }

        let mut transaccion = pool.begin().await?;
        sqlx::raw_sql(migracion.sql)
            .execute(&mut *transaccion)
            .await?;
        sqlx::query("INSERT INTO migracion (version, aplicada_en) VALUES (?, datetime('now'))")
            .bind(migracion.version)
            .execute(&mut *transaccion)
            .await?;
        transaccion.commit().await?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nucleo::basedatos::conexion::conectar_en;

    async fn base_temporal() -> (tempfile::TempDir, SqlitePool) {
        let carpeta = tempfile::tempdir().unwrap();
        let pool = conectar_en(&carpeta.path().join("test.db")).await.unwrap();
        (carpeta, pool)
    }

    #[tokio::test]
    async fn las_migraciones_reales_dejan_el_esquema_esperado() {
        let (_carpeta, pool) = base_temporal().await;

        aplicar(&pool, MIGRACIONES).await.unwrap();

        let tablas: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('comercio', 'usuario')",
        )
        .fetch_all(&pool)
        .await
        .unwrap();

        assert!(tablas.contains(&"comercio".to_string()));
        assert!(tablas.contains(&"usuario".to_string()));
    }

    #[tokio::test]
    async fn correrlas_dos_veces_no_rompe_ni_duplica() {
        let (_carpeta, pool) = base_temporal().await;

        aplicar(&pool, MIGRACIONES).await.unwrap();
        aplicar(&pool, MIGRACIONES).await.unwrap();

        let filas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM migracion")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(filas, MIGRACIONES.len() as i64);
    }

    #[tokio::test]
    async fn una_migracion_que_falla_no_deja_la_base_a_medio_aplicar() {
        let (_carpeta, pool) = base_temporal().await;

        let migraciones_sinteticas = [Migracion {
            version: 0,
            sql: "CREATE TABLE valida (id INTEGER); ESTO NO ES SQL VALIDO;",
        }];

        let resultado = aplicar(&pool, &migraciones_sinteticas).await;
        assert!(resultado.is_err());

        let tabla: Option<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'valida'",
        )
        .fetch_optional(&pool)
        .await
        .unwrap();
        assert!(tabla.is_none(), "la tabla de la migración fallida no debería existir");

        let filas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM migracion")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(filas, 0, "no debería haber quedado registro de la migración fallida");
    }

    #[tokio::test]
    async fn se_pueden_saltar_varias_versiones_de_una() {
        let (_carpeta, pool) = base_temporal().await;

        let migraciones_sinteticas = [
            Migracion { version: 1, sql: "CREATE TABLE t1 (id INTEGER);" },
            Migracion { version: 2, sql: "CREATE TABLE t2 (id INTEGER);" },
            Migracion { version: 3, sql: "CREATE TABLE t3 (id INTEGER);" },
            Migracion { version: 4, sql: "CREATE TABLE t4 (id INTEGER);" },
        ];

        aplicar(&pool, &migraciones_sinteticas).await.unwrap();

        let maxima: i64 = sqlx::query_scalar("SELECT MAX(version) FROM migracion")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(maxima, 4);

        let filas: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM migracion")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(filas, 4);
    }

    #[tokio::test]
    async fn hay_pendientes_dice_la_verdad() {
        let (_carpeta, pool) = base_temporal().await;

        assert!(hay_pendientes(&pool, MIGRACIONES).await.unwrap());

        aplicar(&pool, MIGRACIONES).await.unwrap();

        assert!(!hay_pendientes(&pool, MIGRACIONES).await.unwrap());
    }

    // Base con la fundación completa + Módulo 1 (Stock) ya migrados, y un
    // comercio + usuario base para poder insertar productos/ajustes sin
    // romper sus claves foráneas.
    async fn base_con_stock() -> (tempfile::TempDir, SqlitePool) {
        let (carpeta, pool) = base_temporal().await;
        aplicar(&pool, MIGRACIONES).await.unwrap();

        sqlx::query(
            "INSERT INTO comercio (id, nombre, rubro, vende_por_peso) VALUES (1, 'Mini Market Marlyn', 'despensa', true)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query("INSERT INTO usuario (nombre, rol) VALUES ('Dueño', 'admin')")
            .execute(&pool)
            .await
            .unwrap();

        (carpeta, pool)
    }

    #[tokio::test]
    async fn producto_rechaza_costo_o_precio_negativo() {
        let (_carpeta, pool) = base_con_stock().await;

        let costo_negativo =
            sqlx::query("INSERT INTO producto (nombre, costo) VALUES ('Yerba', -1)")
                .execute(&pool)
                .await;
        assert!(costo_negativo.is_err());

        let precio_negativo =
            sqlx::query("INSERT INTO producto (nombre, precio) VALUES ('Yerba', -1)")
                .execute(&pool)
                .await;
        assert!(precio_negativo.is_err());
    }

    #[tokio::test]
    async fn producto_que_no_se_vende_por_peso_exige_stock_entero() {
        let (_carpeta, pool) = base_con_stock().await;

        let fraccionario = sqlx::query(
            "INSERT INTO producto (nombre, se_vende_por_peso, stock_actual) VALUES ('Fideos', false, 2.5)",
        )
        .execute(&pool)
        .await;
        assert!(fraccionario.is_err(), "un producto por unidad no puede tener stock fraccionario");

        let entero = sqlx::query(
            "INSERT INTO producto (nombre, se_vende_por_peso, stock_actual) VALUES ('Fideos', false, 2)",
        )
        .execute(&pool)
        .await;
        assert!(entero.is_ok());

        let pesable = sqlx::query(
            "INSERT INTO producto (nombre, se_vende_por_peso, stock_actual) VALUES ('Queso', true, 1.750)",
        )
        .execute(&pool)
        .await;
        assert!(pesable.is_ok(), "un producto por peso sí puede tener stock fraccionario");
    }

    #[tokio::test]
    async fn producto_permite_varios_sin_codigo_pero_rechaza_codigo_repetido() {
        let (_carpeta, pool) = base_con_stock().await;

        sqlx::query("INSERT INTO producto (nombre) VALUES ('Sin código 1')")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO producto (nombre) VALUES ('Sin código 2')")
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query("INSERT INTO producto (nombre, codigo_barras) VALUES ('A1', '7791234567890')")
            .execute(&pool)
            .await
            .unwrap();

        let duplicado = sqlx::query(
            "INSERT INTO producto (nombre, codigo_barras) VALUES ('A2', '7791234567890')",
        )
        .execute(&pool)
        .await;
        assert!(duplicado.is_err(), "dos productos no pueden compartir código de barras");
    }

    #[tokio::test]
    async fn ajuste_stock_rechaza_cantidad_cero_y_motivo_invalido() {
        let (_carpeta, pool) = base_con_stock().await;

        sqlx::query("INSERT INTO producto (nombre, stock_actual) VALUES ('Yerba', 10)")
            .execute(&pool)
            .await
            .unwrap();

        let cantidad_cero = sqlx::query(
            "INSERT INTO ajuste_stock (producto_id, cantidad, motivo, stock_resultante, usuario_id) VALUES (1, 0, 'conteo', 10, 1)",
        )
        .execute(&pool)
        .await;
        assert!(cantidad_cero.is_err());

        let motivo_invalido = sqlx::query(
            "INSERT INTO ajuste_stock (producto_id, cantidad, motivo, stock_resultante, usuario_id) VALUES (1, -1, 'porque sí', 9, 1)",
        )
        .execute(&pool)
        .await;
        assert!(motivo_invalido.is_err());

        let valido = sqlx::query(
            "INSERT INTO ajuste_stock (producto_id, cantidad, motivo, stock_resultante, usuario_id) VALUES (1, -1, 'rotura', 9, 1)",
        )
        .execute(&pool)
        .await;
        assert!(valido.is_ok());
    }

    #[tokio::test]
    async fn ajuste_stock_respeta_las_claves_foraneas() {
        // `base_temporal()` conecta con `conectar_en` (conexion.rs), que ya
        // deja `foreign_keys` en ON — no hace falta prenderlo a mano acá,
        // y probarlo sin eso sería probar una conexión distinta a la real.
        let (_carpeta, pool) = base_con_stock().await;

        let producto_inexistente = sqlx::query(
            "INSERT INTO ajuste_stock (producto_id, cantidad, motivo, stock_resultante, usuario_id) VALUES (999, 1, 'conteo', 1, 1)",
        )
        .execute(&pool)
        .await;
        assert!(producto_inexistente.is_err());
    }

    #[tokio::test]
    async fn respaldar_antes_de_una_migracion_que_falla_deja_el_respaldo_previo_intacto() {
        use crate::nucleo::respaldo::motor;

        let (carpeta, pool) = base_temporal().await;
        let carpeta_respaldos = carpeta.path().join("respaldos");

        let migraciones_sinteticas = [Migracion {
            version: 0,
            sql: "ESTO NO ES SQL VALIDO;",
        }];

        assert!(hay_pendientes(&pool, &migraciones_sinteticas).await.unwrap());

        // Secuencia que hace lib.rs en el arranque real: respaldar
        // primero, recién después intentar migrar.
        let ruta_respaldo = motor::respaldar(&pool, &carpeta_respaldos).await.unwrap();
        let resultado = aplicar(&pool, &migraciones_sinteticas).await;

        assert!(resultado.is_err(), "la migración sintética tiene que fallar");
        assert!(
            ruta_respaldo.exists(),
            "el respaldo hecho antes de migrar tiene que seguir existiendo, migración fallida o no"
        );
    }
}
