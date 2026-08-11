// Conexión a la base SQLite. No usamos tauri-plugin-sql: su Pool::connect
// no expone forma de fijar PRAGMAs por conexión, y `foreign_keys` es una
// PRAGMA por conexión, no algo que quede grabado en el archivo — con un
// pool de más de una conexión no hay garantía de que quede prendida
// siempre (ver plan del punto 2). Acá se controla directo con sqlx.
//
// Un solo `max_connections(1)`: esta es una app de un único usuario, así
// que no hay nada que ganar con más de una conexión, y sí se evita
// cualquier "database is locked" al mezclar lectura y escritura.

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions};
use std::error::Error;
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;

use super::super::rutas;

pub async fn conectar(app: &AppHandle) -> Result<SqlitePool, Box<dyn Error + Send + Sync>> {
    let ruta = rutas::directorio_datos(app)?.join("changuito.db");
    conectar_en(&ruta).await
}

/// Separada de `conectar` para poder testear las PRAGMAs sin necesitar
/// un `AppHandle` real.
pub async fn conectar_en(ruta: &Path) -> Result<SqlitePool, Box<dyn Error + Send + Sync>> {
    let opciones = SqliteConnectOptions::new()
        .filename(ruta)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opciones)
        .await?;

    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::Row;

    #[tokio::test]
    async fn foreign_keys_esta_realmente_en_on() {
        let carpeta = tempfile::tempdir().unwrap();
        let pool = conectar_en(&carpeta.path().join("test.db")).await.unwrap();

        sqlx::query("CREATE TABLE padre (id INTEGER PRIMARY KEY)")
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "CREATE TABLE hijo (id INTEGER PRIMARY KEY, padre_id INTEGER REFERENCES padre(id))",
        )
        .execute(&pool)
        .await
        .unwrap();

        let resultado = sqlx::query("INSERT INTO hijo (padre_id) VALUES (999)")
            .execute(&pool)
            .await;

        assert!(
            resultado.is_err(),
            "insertar una referencia a un padre inexistente tendría que fallar"
        );
    }

    #[tokio::test]
    async fn journal_mode_queda_en_wal() {
        let carpeta = tempfile::tempdir().unwrap();
        let pool = conectar_en(&carpeta.path().join("test.db")).await.unwrap();

        let modo: String = sqlx::query("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);

        assert_eq!(modo.to_lowercase(), "wal");
    }
}
