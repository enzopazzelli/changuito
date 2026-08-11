// Motor de respaldo y restauración (§5.3 del prompt base). El respaldo
// se genera con `VACUUM INTO` — nunca copiando el archivo `.db` a mano,
// que con WAL activo da una copia incompleta — y se comprime porque es
// lo que el cliente manda cuando pide soporte.
//
// El nombre del archivo lleva fecha *y hora*: puede haber más de un
// respaldo el mismo día (uno al arrancar, otro al cerrar) y `VACUUM
// INTO` exige que el destino no exista todavía. La rotación, no el
// nombre, es la que decide cuántos sobreviven por día.

use chrono::{Datelike, NaiveDateTime};
use flate2::write::GzEncoder;
use flate2::{read::GzDecoder, Compression};
use sqlx::SqlitePool;
use std::collections::HashSet;
use std::error::Error;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

const PREFIJO: &str = "changuito_";
const SUFIJO: &str = ".db.gz";
const FORMATO_NOMBRE: &str = "%Y-%m-%d_%H%M%S";
const DIAS_A_CONSERVAR: usize = 7;
const SEMANAS_A_CONSERVAR: usize = 4;

/// Lee `comercio.carpeta_respaldos`; si está vacía o todavía no hay fila
/// de comercio (primerísimo arranque, antes de la pantalla inicial), usa
/// la carpeta por defecto.
pub async fn carpeta_configurada(pool: &SqlitePool, por_defecto: &Path) -> PathBuf {
    let fila: Option<Option<String>> =
        sqlx::query_scalar("SELECT carpeta_respaldos FROM comercio WHERE id = 1")
            .fetch_optional(pool)
            .await
            .unwrap_or(None);

    match fila.flatten().filter(|valor| !valor.trim().is_empty()) {
        Some(valor) => PathBuf::from(valor),
        None => por_defecto.to_path_buf(),
    }
}

pub async fn respaldar(
    pool: &SqlitePool,
    carpeta_destino: &Path,
) -> Result<PathBuf, Box<dyn Error + Send + Sync>> {
    std::fs::create_dir_all(carpeta_destino)?;

    let ahora = chrono::Local::now().naive_local();
    let nombre = format!("{PREFIJO}{}{SUFIJO}", ahora.format(FORMATO_NOMBRE));
    let ruta_final = carpeta_destino.join(&nombre);
    let ruta_temporal = carpeta_destino.join(format!("{nombre}.tmp"));

    if ruta_temporal.exists() {
        std::fs::remove_file(&ruta_temporal)?;
    }

    sqlx::query("VACUUM INTO ?")
        .bind(ruta_temporal.to_string_lossy().into_owned())
        .execute(pool)
        .await?;

    comprimir(&ruta_temporal, &ruta_final)?;
    std::fs::remove_file(&ruta_temporal)?;

    rotar(carpeta_destino)?;

    Ok(ruta_final)
}

pub async fn restaurar(
    pool: SqlitePool,
    ruta_bd_viva: &Path,
    ruta_respaldo: &Path,
    carpeta_respaldos: &Path,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let carpeta_temporal = tempfile::tempdir()?;
    let ruta_candidata = carpeta_temporal.path().join("candidato.db");
    descomprimir(ruta_respaldo, &ruta_candidata)
        .map_err(|_| "el archivo de respaldo no se pudo descomprimir")?;

    validar_integridad(&ruta_candidata).await?;

    // Respaldo previo del estado actual antes de pisar nada.
    respaldar(&pool, carpeta_respaldos).await?;

    pool.close().await;

    std::fs::copy(&ruta_candidata, ruta_bd_viva)?;
    // Los -wal/-shm de la base anterior ya no corresponden al archivo
    // restaurado: si quedan, SQLite los aplicaría sobre datos que no son
    // los suyos.
    let _ = std::fs::remove_file(sidecar(ruta_bd_viva, "-wal"));
    let _ = std::fs::remove_file(sidecar(ruta_bd_viva, "-shm"));

    Ok(())
}

async fn validar_integridad(ruta: &Path) -> Result<(), Box<dyn Error + Send + Sync>> {
    let opciones = sqlx::sqlite::SqliteConnectOptions::new().filename(ruta);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opciones)
        .await
        .map_err(|_| "el archivo de respaldo no es una base SQLite válida")?;

    let chequeo: Result<String, _> = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&pool)
        .await;
    pool.close().await;

    match chequeo {
        Ok(resultado) if resultado.to_lowercase() == "ok" => Ok(()),
        Ok(resultado) => Err(format!("el respaldo está corrupto: {resultado}").into()),
        Err(_) => Err("el archivo de respaldo no es una base SQLite válida".into()),
    }
}

/// Para el chequeo "una vez por día" al arrancar: si no se puede ni leer
/// la carpeta (por ejemplo, todavía no existe), no hay respaldo de hoy.
pub fn ya_hay_respaldo_hoy(carpeta: &Path) -> bool {
    let hoy = chrono::Local::now().date_naive();
    listar_respaldos(carpeta)
        .map(|respaldos| respaldos.iter().any(|(_, fecha)| fecha.date() == hoy))
        .unwrap_or(false)
}

/// Borra del disco lo que la rotación no conserva.
pub fn rotar(carpeta: &Path) -> Result<(), Box<dyn Error + Send + Sync>> {
    let respaldos = listar_respaldos(carpeta)?;
    let conservar = calcular_a_conservar(&respaldos);
    for (ruta, _) in &respaldos {
        if !conservar.contains(ruta) {
            std::fs::remove_file(ruta)?;
        }
    }
    Ok(())
}

/// Función pura, sin tocar disco: de todos los respaldos existentes,
/// conserva el más reciente de cada uno de los últimos 7 días *con
/// respaldo* y el más reciente de cada una de las últimas 4 semanas ISO
/// *con respaldo*. No son los últimos 7 días del calendario: si la
/// máquina estuvo apagada dos semanas, "los últimos 7 días con
/// respaldo" siguen siendo 7 respaldos reales, no un agujero vacío.
pub fn calcular_a_conservar(respaldos: &[(PathBuf, NaiveDateTime)]) -> HashSet<PathBuf> {
    let mut dias: Vec<_> = respaldos.iter().map(|(_, fecha)| fecha.date()).collect();
    dias.sort();
    dias.dedup();
    let dias_a_conservar: HashSet<_> = dias.into_iter().rev().take(DIAS_A_CONSERVAR).collect();

    let mut semanas: Vec<_> = respaldos
        .iter()
        .map(|(_, fecha)| {
            let iso = fecha.date().iso_week();
            (iso.year(), iso.week())
        })
        .collect();
    semanas.sort();
    semanas.dedup();
    let semanas_a_conservar: HashSet<_> =
        semanas.into_iter().rev().take(SEMANAS_A_CONSERVAR).collect();

    let mas_reciente_donde = |filtro: &dyn Fn(&NaiveDateTime) -> bool| {
        respaldos
            .iter()
            .filter(|(_, fecha)| filtro(fecha))
            .max_by_key(|(_, fecha)| *fecha)
            .map(|(ruta, _)| ruta.clone())
    };

    let mut conservar = HashSet::new();
    for dia in &dias_a_conservar {
        if let Some(ruta) = mas_reciente_donde(&|fecha| fecha.date() == *dia) {
            conservar.insert(ruta);
        }
    }
    for semana in &semanas_a_conservar {
        if let Some(ruta) = mas_reciente_donde(&|fecha| {
            let iso = fecha.date().iso_week();
            (iso.year(), iso.week()) == *semana
        }) {
            conservar.insert(ruta);
        }
    }

    conservar
}

fn listar_respaldos(
    carpeta: &Path,
) -> Result<Vec<(PathBuf, NaiveDateTime)>, Box<dyn Error + Send + Sync>> {
    let mut resultado = Vec::new();
    for entrada in std::fs::read_dir(carpeta)? {
        let ruta = entrada?.path();
        if let Some(fecha) = fecha_desde_nombre(&ruta) {
            resultado.push((ruta, fecha));
        }
    }
    Ok(resultado)
}

fn fecha_desde_nombre(ruta: &Path) -> Option<NaiveDateTime> {
    let nombre = ruta.file_name()?.to_str()?;
    let medio = nombre.strip_prefix(PREFIJO)?.strip_suffix(SUFIJO)?;
    NaiveDateTime::parse_from_str(medio, FORMATO_NOMBRE).ok()
}

fn sidecar(ruta_bd: &Path, sufijo: &str) -> PathBuf {
    let mut nombre = ruta_bd.file_name().unwrap_or_default().to_os_string();
    nombre.push(sufijo);
    ruta_bd.with_file_name(nombre)
}

fn comprimir(origen: &Path, destino: &Path) -> std::io::Result<()> {
    let datos = std::fs::read(origen)?;
    let archivo = std::fs::File::create(destino)?;
    let mut encoder = GzEncoder::new(archivo, Compression::default());
    encoder.write_all(&datos)?;
    encoder.finish()?;
    Ok(())
}

fn descomprimir(origen: &Path, destino: &Path) -> std::io::Result<()> {
    let archivo = std::fs::File::open(origen)?;
    let mut decoder = GzDecoder::new(archivo);
    let mut datos = Vec::new();
    decoder.read_to_end(&mut datos)?;
    std::fs::write(destino, datos)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::nucleo::basedatos::{conexion::conectar_en, migraciones};

    async fn base_con_datos() -> (tempfile::TempDir, SqlitePool, PathBuf) {
        let carpeta = tempfile::tempdir().unwrap();
        let ruta_bd = carpeta.path().join("changuito.db");
        let pool = conectar_en(&ruta_bd).await.unwrap();
        migraciones::aplicar(&pool, migraciones::MIGRACIONES)
            .await
            .unwrap();
        sqlx::query("INSERT INTO comercio (id, nombre, rubro) VALUES (1, 'Almacén Doña Rosa', 'despensa')")
            .execute(&pool)
            .await
            .unwrap();
        (carpeta, pool, ruta_bd)
    }

    #[tokio::test]
    async fn ciclo_completo_respaldar_borrar_restaurar() {
        let (carpeta, pool, ruta_bd) = base_con_datos().await;
        let carpeta_respaldos = carpeta.path().join("respaldos");

        let ruta_respaldo = respaldar(&pool, &carpeta_respaldos).await.unwrap();

        pool.close().await;
        std::fs::remove_file(&ruta_bd).unwrap();
        let _ = std::fs::remove_file(sidecar(&ruta_bd, "-wal"));
        let _ = std::fs::remove_file(sidecar(&ruta_bd, "-shm"));

        // Para restaurar hace falta un pool: se abre uno nuevo apuntando
        // al mismo archivo (que en este punto no existe en disco, igual
        // que pasaría en la app real después de perder el archivo).
        let pool_para_restaurar = conectar_en(&ruta_bd).await.unwrap();
        restaurar(pool_para_restaurar, &ruta_bd, &ruta_respaldo, &carpeta_respaldos)
            .await
            .unwrap();

        let pool_restaurado = conectar_en(&ruta_bd).await.unwrap();
        let fila: (i64, String, String) =
            sqlx::query_as("SELECT id, nombre, rubro FROM comercio WHERE id = 1")
                .fetch_one(&pool_restaurado)
                .await
                .unwrap();
        assert_eq!(fila, (1, "Almacén Doña Rosa".to_string(), "despensa".to_string()));
    }

    #[tokio::test]
    async fn restaurar_un_archivo_corrupto_no_toca_la_base_actual() {
        let (carpeta, pool, ruta_bd) = base_con_datos().await;
        let carpeta_respaldos = carpeta.path().join("respaldos");

        let respaldo_corrupto = carpeta.path().join("corrupto.db.gz");
        std::fs::write(&respaldo_corrupto, b"esto no es un gzip valido").unwrap();

        let resultado = restaurar(pool, &ruta_bd, &respaldo_corrupto, &carpeta_respaldos).await;
        assert!(resultado.is_err());

        // La base viva sigue intacta: se puede volver a abrir y el dato
        // original sigue ahí.
        let pool_verificacion = conectar_en(&ruta_bd).await.unwrap();
        let nombre: String = sqlx::query_scalar("SELECT nombre FROM comercio WHERE id = 1")
            .fetch_one(&pool_verificacion)
            .await
            .unwrap();
        assert_eq!(nombre, "Almacén Doña Rosa");
    }

    #[tokio::test]
    async fn el_respaldo_incluye_una_escritura_reciente_con_la_base_en_uso() {
        let (carpeta, pool, _ruta_bd) = base_con_datos().await;
        let carpeta_respaldos = carpeta.path().join("respaldos");

        sqlx::query("UPDATE comercio SET nombre = 'Nombre actualizado' WHERE id = 1")
            .execute(&pool)
            .await
            .unwrap();

        let ruta_respaldo = respaldar(&pool, &carpeta_respaldos).await.unwrap();

        let candidato = carpeta.path().join("candidato_verificacion.db");
        descomprimir(&ruta_respaldo, &candidato).unwrap();
        let pool_respaldo = conectar_en(&candidato).await.unwrap();
        let nombre: String = sqlx::query_scalar("SELECT nombre FROM comercio WHERE id = 1")
            .fetch_one(&pool_respaldo)
            .await
            .unwrap();
        assert_eq!(nombre, "Nombre actualizado");
    }

    fn fecha(texto: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(texto, "%Y-%m-%d %H:%M:%S").unwrap()
    }

    #[test]
    fn rotacion_conserva_exactamente_las_7_diarias_y_4_semanales() {
        // Un respaldo por día durante 40 días seguidos (mismo horario).
        let respaldos: Vec<(PathBuf, NaiveDateTime)> = (0..40)
            .map(|i| {
                let dia = chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap() + chrono::Days::new(i);
                let marca = dia.and_hms_opt(12, 0, 0).unwrap();
                (PathBuf::from(format!("respaldo_{i}.db.gz")), marca)
            })
            .collect();

        let conservar = calcular_a_conservar(&respaldos);

        // Los últimos 7 días: los índices 33..=39 (el 39 es el más nuevo).
        for i in 33..=39 {
            assert!(
                conservar.contains(&PathBuf::from(format!("respaldo_{i}.db.gz"))),
                "el respaldo diario del día {i} debería sobrevivir"
            );
        }

        // No puede haber más de 7 (diarias) + 4 (semanales, pueden pisar
        // días ya contados) sobrevivientes.
        assert!(conservar.len() <= DIAS_A_CONSERVAR + SEMANAS_A_CONSERVAR);

        // Un respaldo bien viejo, de ninguna de las últimas 7 fechas ni
        // de ninguna de las últimas 4 semanas, no sobrevive.
        assert!(!conservar.contains(&PathBuf::from("respaldo_0.db.gz")));
    }

    #[test]
    fn rotacion_conserva_el_mas_reciente_de_cada_dia_no_todos() {
        let respaldos = vec![
            (PathBuf::from("mas_viejo.db.gz"), fecha("2026-08-11 09:00:00")),
            (PathBuf::from("mas_nuevo.db.gz"), fecha("2026-08-11 21:00:00")),
        ];

        let conservar = calcular_a_conservar(&respaldos);

        assert!(conservar.contains(&PathBuf::from("mas_nuevo.db.gz")));
        assert!(!conservar.contains(&PathBuf::from("mas_viejo.db.gz")));
    }
}
