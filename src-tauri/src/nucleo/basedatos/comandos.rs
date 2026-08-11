// Los únicos dos comandos Tauri que hablan SQL directo. Drizzle, del lado
// del frontend, es el único que los llama (a través de su driver
// sqlite-proxy en src/nucleo/datos/cliente.ts) — ningún componente los
// invoca directo, igual que ningún componente escribe una consulta
// suelta (regla de arquitectura, §4 del prompt base).

use serde_json::Value;
use sqlx::sqlite::SqliteRow;
use sqlx::{Column, Row, SqlitePool};
use tauri::State;

#[tauri::command]
pub async fn bd_ejecutar(
    pool: State<'_, SqlitePool>,
    sql: String,
    parametros: Vec<Value>,
) -> Result<u64, String> {
    let mut consulta = sqlx::query(&sql);
    for valor in &parametros {
        consulta = enlazar(consulta, valor)?;
    }

    consulta
        .execute(pool.inner())
        .await
        .map(|resultado| resultado.rows_affected())
        .map_err(|error| error.to_string())
}

/// Devuelve cada fila como array posicional (no como objeto con nombre de
/// columna): es el formato que espera el driver `sqlite-proxy` de Drizzle
/// del otro lado. Un objeto con nombre exigiría que las claves conserven
/// el orden real de las columnas, y `serde_json::Map` sin la feature
/// `preserve_order` las reordena alfabéticamente — se corrompería el
/// mapeo posicional en silencio.
#[tauri::command]
pub async fn bd_consultar(
    pool: State<'_, SqlitePool>,
    sql: String,
    parametros: Vec<Value>,
) -> Result<Vec<Vec<Value>>, String> {
    let mut consulta = sqlx::query(&sql);
    for valor in &parametros {
        consulta = enlazar(consulta, valor)?;
    }

    let filas = consulta
        .fetch_all(pool.inner())
        .await
        .map_err(|error| error.to_string())?;

    Ok(filas.iter().map(fila_a_valores).collect())
}

type Consulta<'q> = sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>;

fn enlazar<'q>(consulta: Consulta<'q>, valor: &'q Value) -> Result<Consulta<'q>, String> {
    match valor {
        Value::Null => Ok(consulta.bind(None::<String>)),
        Value::Bool(b) => Ok(consulta.bind(*b)),
        Value::Number(numero) => {
            if let Some(entero) = numero.as_i64() {
                Ok(consulta.bind(entero))
            } else if let Some(flotante) = numero.as_f64() {
                Ok(consulta.bind(flotante))
            } else {
                Err(format!("número de parámetro fuera de rango: {numero}"))
            }
        }
        Value::String(texto) => Ok(consulta.bind(texto.as_str())),
        otro => Err(format!("tipo de parámetro no soportado: {otro}")),
    }
}

/// SQLite es de tipado dinámico por columna: no hay forma de saber de
/// antemano si una columna es texto, número o nula. Se prueba en cascada
/// porque `try_get` de sqlx solo tira error si el tipo no matchea.
fn fila_a_valores(fila: &SqliteRow) -> Vec<Value> {
    fila.columns()
        .iter()
        .map(|columna| {
            let indice = columna.ordinal();
            if let Ok(v) = fila.try_get::<i64, _>(indice) {
                Value::from(v)
            } else if let Ok(v) = fila.try_get::<f64, _>(indice) {
                Value::from(v)
            } else if let Ok(v) = fila.try_get::<String, _>(indice) {
                Value::from(v)
            } else if let Ok(v) = fila.try_get::<bool, _>(indice) {
                Value::from(v)
            } else {
                Value::Null
            }
        })
        .collect()
}
