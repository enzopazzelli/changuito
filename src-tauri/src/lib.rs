mod nucleo;

use nucleo::basedatos::{comandos, conexion, migraciones};
use nucleo::registro::RegistradorErrores;
use nucleo::respaldo::{comandos as comandos_respaldo, motor as motor_respaldo};
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
        .invoke_handler(tauri::generate_handler![
            comandos::bd_ejecutar,
            comandos::bd_consultar,
            comandos_respaldo::respaldo_manual,
            comandos_respaldo::respaldo_restaurar
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Se intercepta el cierre para poder respaldar antes:
                // dos instancias no es el único riesgo de corrupción,
                // cerrar sin respaldar el último día de trabajo también.
                api.prevent_close();
                let handle = window.app_handle();

                if let Some(pool) = handle.try_state::<sqlx::SqlitePool>() {
                    tauri::async_runtime::block_on(async {
                        let Ok(directorio_datos) = rutas::directorio_datos(handle) else {
                            return;
                        };
                        let carpeta = motor_respaldo::carpeta_configurada(
                            &pool,
                            &directorio_datos.join("respaldos"),
                        )
                        .await;
                        if let Err(error) = motor_respaldo::respaldar(&pool, &carpeta).await {
                            registrar_error(&format!("no se pudo respaldar al cerrar: {error}"));
                        }
                    });
                }

                let _ = window.destroy();
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let directorio_logs = rutas::directorio_logs(&handle)?;
            let registrador = RegistradorErrores::nuevo(&directorio_logs)?;
            REGISTRADOR.set(registrador).ok();

            std::panic::set_hook(Box::new(|info| {
                registrar_error(&format!("panic: {info}"));
            }));

            // Tiene que estar lista antes de que la ventana quede usable:
            // corre las migraciones pendientes al arrancar (§5.2).
            let pool = tauri::async_runtime::block_on(async {
                let pool = conexion::conectar(&handle).await?;

                // Antes de cualquier migración pendiente, respaldo
                // automático (§5.4): si la migración falla, el respaldo
                // previo existe. Si el respaldo en sí falla, no frena
                // el arranque ni la migración — perder el respaldo
                // previo es peor que arrancar sin uno, no al revés.
                if migraciones::hay_pendientes(&pool, migraciones::MIGRACIONES).await? {
                    if let Ok(directorio_datos) = rutas::directorio_datos(&handle) {
                        let carpeta = motor_respaldo::carpeta_configurada(
                            &pool,
                            &directorio_datos.join("respaldos"),
                        )
                        .await;
                        if let Err(error) = motor_respaldo::respaldar(&pool, &carpeta).await {
                            registrar_error(&format!("no se pudo respaldar antes de migrar: {error}"));
                        }
                    }
                }

                migraciones::aplicar(&pool, migraciones::MIGRACIONES).await?;

                // "Una vez por día" (§5.3): se revisa al arrancar en vez
                // de correr un timer en segundo plano. Si falla, no
                // frena el arranque — solo queda en el registro.
                if let Ok(directorio_datos) = rutas::directorio_datos(&handle) {
                    let carpeta = motor_respaldo::carpeta_configurada(
                        &pool,
                        &directorio_datos.join("respaldos"),
                    )
                    .await;
                    if !motor_respaldo::ya_hay_respaldo_hoy(&carpeta) {
                        if let Err(error) = motor_respaldo::respaldar(&pool, &carpeta).await {
                            registrar_error(&format!("no se pudo respaldar al arrancar: {error}"));
                        }
                    }
                }

                Ok::<_, Box<dyn std::error::Error + Send + Sync>>(pool)
            })
            .map_err(|error| error.to_string())?;
            app.manage(pool);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
