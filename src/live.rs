use crate::{
    AppError, Result, new_id,
    storage::{Column, Table},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
use tiberius::{Client, ColumnData, Config};
use tokio::net::TcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

#[derive(Clone, Serialize, Deserialize)]
pub struct Source {
    pub schema: String,
    pub table: String,
    pub server: String,
    pub database: String,
}
#[derive(Deserialize)]
pub struct Choice {
    pub schema: String,
    pub table: String,
}

pub async fn run(sql: &str) -> Result<Vec<Vec<Value>>> {
    let connection = std::env::var("FOLIO_SQLSERVER").map_err(|_| {
        AppError("Set FOLIO_SQLSERVER on the studio server to enable live connections.".into())
    })?;
    let config = Config::from_ado_string(&connection)
        .map_err(|_| AppError("Invalid SQL Server connection settings.".into()))?;
    let task = async {
        let socket = TcpStream::connect(config.get_addr()).await?;
        socket.set_nodelay(true)?;
        let mut client = Client::connect(config, socket.compat_write()).await?;
        let records = client.simple_query(sql).await?.into_first_result().await?;
        records
            .iter()
            .map(|r| {
                r.cells()
                    .map(|(_, c)| {
                        Ok(match c {
                            ColumnData::String(v) => json!(v.as_deref()),
                            ColumnData::F64(v) => json!(v),
                            ColumnData::I32(v) => json!(v),
                            ColumnData::I64(v) => json!(v),
                            _ => return Err(AppError("Unsupported SQL result type.".into())),
                        })
                    })
                    .collect()
            })
            .collect()
    };
    tokio::time::timeout(std::time::Duration::from_secs(45), task)
        .await
        .map_err(|_| AppError("SQL Server timed out after 45 seconds.".into()))?
}

pub async fn catalog() -> Result<Vec<Table>> {
    let sql = "SELECT s.name,o.name,c.name,TYPE_NAME(c.system_type_id),CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')),DB_NAME() FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id JOIN sys.columns c ON c.object_id=o.object_id WHERE o.type IN ('U','V') AND o.is_ms_shipped=0 ORDER BY s.name,o.name,c.column_id";
    let mut tables = BTreeMap::new();
    for r in run(sql).await? {
        let get = |i: usize| r[i].as_str().unwrap_or("").to_owned();
        let (schema, table, name, ty) = (get(0), get(1), get(2), get(3));
        let numeric = match ty.as_str() {
            "tinyint" | "smallint" | "int" | "real" | "float" | "decimal" | "numeric" | "money"
            | "smallmoney" => true,
            "bigint" | "char" | "varchar" | "nchar" | "nvarchar" | "date" | "datetime"
            | "datetime2" | "smalldatetime" | "datetimeoffset" | "time" | "uniqueidentifier"
            | "bit" => false,
            _ => continue,
        };
        let item = tables
            .entry((schema.clone(), table.clone()))
            .or_insert_with(|| Table {
                id: new_id('t'),
                name: table.clone(),
                rows: 0,
                parquet_types: Vec::new(),
                columns: vec![],
                source: Some(Source {
                    schema,
                    table,
                    server: get(4),
                    database: get(5),
                }),
            });
        item.columns.push(Column { name, numeric });
    }
    Ok(tables.into_values().collect())
}
fn ident(s: &str) -> String {
    format!("[{}]", s.replace(']', "]]"))
}
fn literal(s: &str) -> String {
    format!("N'{}'", s.replace('\'', "''"))
}
pub fn prefix(tables: &HashMap<String, Table>) -> Result<Option<String>> {
    let live = tables.values().filter(|t| t.source.is_some()).count();
    if live == 0 {
        return Ok(None);
    }
    if live != tables.len() {
        return Err(AppError(
            "Use separate reports for imported and live tables.".into(),
        ));
    }
    let mut ctes = Vec::new();
    let mut binding = None;
    for t in tables.values() {
        let s = t.source.as_ref().unwrap();
        let id = (&s.server, &s.database);
        if binding.is_some_and(|v| v != id) {
            return Err(AppError(
                "Live tables must share a SQL Server database.".into(),
            ));
        }
        binding = Some(id);
        let cols = t
            .columns
            .iter()
            .enumerate()
            .map(|(i, c)| {
                let name = ident(&c.name);
                let expr = if c.numeric {
                    format!("CONVERT(float,{name})")
                } else {
                    format!("CONVERT(nvarchar(max),{name},126)")
                };
                format!("{expr} AS c{i}")
            })
            .collect::<Vec<_>>()
            .join(",");
        ctes.push(format!(
            "{} AS (SELECT {cols} FROM {}.{})",
            t.id,
            ident(&s.schema),
            ident(&s.table)
        ));
    }
    let (server, db) = binding.unwrap();
    Ok(Some(format!(
        "IF CONVERT(nvarchar(128),SERVERPROPERTY('ServerName')) <> {} OR DB_NAME() <> {} THROW 50000, 'The configured SQL Server database has changed.', 1; WITH {} ",
        literal(server),
        literal(db),
        ctes.join(",")
    )))
}
