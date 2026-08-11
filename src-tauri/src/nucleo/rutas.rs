// Resolución de rutas de datos: todo lo que persiste esta app vive en
// AppData\Roaming\Changuito, nunca dentro de Archivos de Programa (ahí un
// usuario común no tiene permiso de escritura).

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// Sin test automático a propósito: `tauri::test::mock_app()` (la forma
// normal de testear esto sin levantar la app entera) tiene un bug
// confirmado y abierto en Windows que hace fallar el binario de tests
// completo (STATUS_ENTRYPOINT_NOT_FOUND — issues #13419 y #13954 de
// tauri-apps/tauri). Verificado a mano en su lugar: la carpeta real
// (`AppData\Roaming\Changuito\`) se inspeccionó directo varias veces
// durante el desarrollo de los puntos 2 y 3, fuera de Archivos de
// Programa y escribible. Revisar si mock_app ya funciona en Windows la
// próxima vez que se actualice `tauri`.
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
