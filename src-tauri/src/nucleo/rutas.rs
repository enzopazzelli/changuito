// Resolución de rutas de datos: todo lo que persiste esta app vive en
// AppData\Roaming\Changuito, nunca dentro de Archivos de Programa (ahí un
// usuario común no tiene permiso de escritura).

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn directorio_datos(app: &AppHandle) -> std::io::Result<PathBuf> {
    let directorio = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
    std::fs::create_dir_all(&directorio)?;
    Ok(directorio)
}

pub fn directorio_logs(app: &AppHandle) -> std::io::Result<PathBuf> {
    let directorio = directorio_datos(app)?.join("logs");
    std::fs::create_dir_all(&directorio)?;
    Ok(directorio)
}
