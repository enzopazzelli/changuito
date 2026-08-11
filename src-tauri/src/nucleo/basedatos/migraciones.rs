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

pub const MIGRACIONES: &[Migracion] = &[Migracion {
    version: 0,
    sql: include_str!("../../../migraciones/0000_fundacion.sql"),
}];

pub async fn aplicar(
    pool: &SqlitePool,
    migraciones: &[Migracion],
) -> Result<(), Box<dyn Error + Send + Sync>> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS migracion (
            version INTEGER PRIMARY KEY,
            aplicada_en TEXT NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    let maxima_aplicada: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(version), -1) FROM migracion")
            .fetch_one(pool)
            .await?;

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
}
