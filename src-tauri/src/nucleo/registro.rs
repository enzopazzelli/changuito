// Registro de errores rotativo. Se implementa a mano (sin depender de un
// crate externo de logging) porque la rotación es simple y así queda
// testeable con un directorio temporal, sin levantar la app entera.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

/// Tamaño máximo del archivo activo antes de rotar. La app puede quedar
/// meses sin reinstalarse, así que el límite tiene que ser propio del
/// archivo, no de "borrar cada N días".
const TAMANO_MAXIMO_BYTES: u64 = 5 * 1024 * 1024; // 5 MB

pub struct RegistradorErrores {
    ruta_actual: PathBuf,
    ruta_anterior: PathBuf,
}

impl RegistradorErrores {
    pub fn nuevo(carpeta: &Path) -> std::io::Result<Self> {
        fs::create_dir_all(carpeta)?;
        Ok(Self {
            ruta_actual: carpeta.join("errores.log"),
            ruta_anterior: carpeta.join("errores.log.anterior"),
        })
    }

    /// Agrega una línea al log, rotando antes si el archivo activo superó
    /// el tamaño máximo.
    pub fn escribir(&self, linea: &str) -> std::io::Result<()> {
        self.rotar_si_corresponde()?;
        let mut archivo = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.ruta_actual)?;
        writeln!(archivo, "{linea}")
    }

    fn rotar_si_corresponde(&self) -> std::io::Result<()> {
        let tamano = fs::metadata(&self.ruta_actual)
            .map(|m| m.len())
            .unwrap_or(0);
        if tamano >= TAMANO_MAXIMO_BYTES {
            // Se conserva un solo archivo anterior: como mucho hay dos
            // archivos en disco, nunca crece sin límite.
            let _ = fs::remove_file(&self.ruta_anterior);
            fs::rename(&self.ruta_actual, &self.ruta_anterior)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escribe_y_lee_una_linea() {
        let carpeta = tempfile::tempdir().unwrap();
        let registrador = RegistradorErrores::nuevo(carpeta.path()).unwrap();

        registrador.escribir("primer error").unwrap();

        let contenido = fs::read_to_string(carpeta.path().join("errores.log")).unwrap();
        assert_eq!(contenido, "primer error\n");
    }

    #[test]
    fn rota_al_superar_el_tamano_maximo() {
        let carpeta = tempfile::tempdir().unwrap();
        let registrador = RegistradorErrores::nuevo(carpeta.path()).unwrap();

        let linea_larga = "x".repeat(1024);
        let lineas_necesarias = (TAMANO_MAXIMO_BYTES / 1024) + 10;
        for _ in 0..lineas_necesarias {
            registrador.escribir(&linea_larga).unwrap();
        }

        assert!(carpeta.path().join("errores.log.anterior").exists());
        let tamano_activo = fs::metadata(carpeta.path().join("errores.log"))
            .unwrap()
            .len();
        assert!(tamano_activo < TAMANO_MAXIMO_BYTES);
    }

    #[test]
    fn no_crece_sin_limite_tras_varias_rotaciones() {
        let carpeta = tempfile::tempdir().unwrap();
        let registrador = RegistradorErrores::nuevo(carpeta.path()).unwrap();
        let linea_larga = "x".repeat(1024);
        let lineas_por_ciclo = (TAMANO_MAXIMO_BYTES / 1024) + 10;

        // Simula varios ciclos de vida de la app, cada uno superando el máximo.
        for _ in 0..5 {
            for _ in 0..lineas_por_ciclo {
                registrador.escribir(&linea_larga).unwrap();
            }
        }

        let tamano_total: u64 = fs::read_dir(carpeta.path())
            .unwrap()
            .filter_map(|entrada| entrada.ok())
            .map(|entrada| entrada.metadata().unwrap().len())
            .sum();

        // Como mucho un archivo activo + uno anterior: nunca más que eso.
        assert!(tamano_total <= TAMANO_MAXIMO_BYTES * 2);
    }
}
