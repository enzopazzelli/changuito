mod nucleo;

use nucleo::registro::RegistradorErrores;
use nucleo::rutas;
use std::sync::OnceLock;
use tauri::Manager;

static REGISTRADOR: OnceLock<RegistradorErrores> = OnceLock::new();

fn registrar_error(mensaje: &str) {
    if let Some(registrador) = REGISTRADOR.get() {
        let marca_de_tiempo = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = registrador.escribir(&format!("[{marca_de_tiempo}] {mensaje}"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Tiene que ir primero: intercepta el arranque antes que cualquier
        // otro plugin. Dos instancias escribiendo el mismo archivo SQLite
        // es corrupción garantizada.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(ventana) = app.webview_windows().values().next() {
                let _ = ventana.unminimize();
                let _ = ventana.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let directorio_logs = rutas::directorio_logs(&handle)?;
            let registrador = RegistradorErrores::nuevo(&directorio_logs)?;
            REGISTRADOR.set(registrador).ok();

            std::panic::set_hook(Box::new(|info| {
                registrar_error(&format!("panic: {info}"));
            }));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
