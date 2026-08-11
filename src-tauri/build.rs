fn main() {
    // Sin esto, bd_ejecutar/bd_consultar no generan permiso ACL alguno y
    // Tauri v2 los deniega por default (deny-by-default): el comando
    // vuelve un error genérico de IPC, sin panic ni log de Rust, así que
    // se ve como si el comando simplemente hubiera fallado.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["bd_ejecutar", "bd_consultar"]),
        ),
    )
    .expect("error al generar el manifiesto de comandos de Tauri");
}
