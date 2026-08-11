// Comandos manuales, sin cablear a ningún botón todavía: la UI de
// "Descargar respaldo" / "Restaurar" necesita un selector de archivos
// nativo y una pantalla de administración que no existen todavía (§8.3,
// punto posterior). Se dejan listos para cuando esa pantalla se
// construya.

use super::motor;
use crate::nucleo::rutas;
use sqlx::SqlitePool;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn respaldo_manual(app: AppHandle, pool: State<'_, SqlitePool>) -> Result<String, String> {
    let por_defecto = rutas::directorio_datos(&app)
        .map_err(|error| error.to_string())?
        .join("respaldos");
    let carpeta = motor::carpeta_configurada(&pool, &por_defecto).await;

    motor::respaldar(&pool, &carpeta)
        .await
        .map(|ruta| ruta.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn respaldo_restaurar(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    ruta_respaldo: String,
) -> Result<(), String> {
    let directorio_datos = rutas::directorio_datos(&app).map_err(|error| error.to_string())?;
    let ruta_bd = directorio_datos.join("changuito.db");
    let carpeta_respaldos =
        motor::carpeta_configurada(&pool, &directorio_datos.join("respaldos")).await;

    // `restaurar` necesita ser dueño del pool para poder cerrarlo antes
    // de reemplazar el archivo. `State` no se puede mover: se clona el
    // handle (un `Pool` de sqlx es un `Arc` por dentro, clonarlo es
    // barato y comparte el mismo pool real — cerrar el clon cierra
    // también la conexión que Tauri tiene administrada).
    let pool_propio = pool.inner().clone();
    motor::restaurar(
        pool_propio,
        &ruta_bd,
        std::path::Path::new(&ruta_respaldo),
        &carpeta_respaldos,
    )
    .await
    .map_err(|error| error.to_string())
}
