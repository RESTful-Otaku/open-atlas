use anyhow::Result;
use polars::prelude::*;

pub fn load_generation_csv(csv_data: &str) -> Result<DataFrame> {
    let cursor = std::io::Cursor::new(csv_data.as_bytes());
    let df = CsvReadOptions::default()
        .with_has_header(true)
        .into_reader_with_file_handle(cursor)
        .finish()?;
    Ok(df)
}
