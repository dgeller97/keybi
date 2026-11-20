use chrono::{DateTime, Datelike, NaiveDate, Utc};
use datafusion::{
    arrow::{
        array::{Int64Array, StringArray},
        compute::kernels::cast_utils::string_to_datetime,
        datatypes::DataType,
    },
    common::{DataFusionError, ScalarValue},
    logical_expr::{ColumnarValue, Volatility, create_udf},
    prelude::SessionContext,
};
use std::{borrow::Cow, sync::Arc};

fn utc_millis(value: &str) -> datafusion::common::Result<i64> {
    let bytes = value.as_bytes();
    let normalized = if bytes.len() == 7 && bytes.get(4) == Some(&b'-') {
        Cow::Owned(format!("{value}-01"))
    } else if bytes.get(13) == Some(&b':')
        && value.is_char_boundary(16)
        && matches!(bytes.get(16), None | Some(b'Z' | b'z' | b'+' | b'-'))
    {
        // Arrow accepts full timestamps. Supply seconds for ISO minute precision.
        Cow::Owned(format!("{}:00{}", &value[..16], &value[16..]))
    } else {
        Cow::Borrowed(value)
    };
    string_to_datetime(&Utc, &normalized)
        .map(|time| time.timestamp_millis())
        .map_err(|_| {
            DataFusionError::Execution(format!("Invalid ISO date or timestamp: {value:.120}"))
        })
}

pub fn calendar_start(millis: i64, months: u32) -> Option<i64> {
    let date = DateTime::from_timestamp_millis(millis)?;
    let index = (date.year() - 1970) * 12 + date.month0() as i32;
    let lower = index - index.checked_rem_euclid(i32::try_from(months).ok()?)?;
    let date = NaiveDate::from_ymd_opt(1970 + lower.div_euclid(12), lower.rem_euclid(12) as u32 + 1, 1)?;
    Some(date.and_hms_opt(0, 0, 0)?.and_utc().timestamp_millis())
}

pub fn register(ctx: &SessionContext) {
    let function = create_udf(
        "folio_utc_millis",
        vec![DataType::Utf8],
        DataType::Int64,
        Volatility::Immutable,
        Arc::new(|args| match &args[0] {
            ColumnarValue::Scalar(ScalarValue::Utf8(value)) => Ok(ColumnarValue::Scalar(
                ScalarValue::Int64(value.as_deref().map(utc_millis).transpose()?),
            )),
            ColumnarValue::Array(values) => {
                let values = values
                    .as_any()
                    .downcast_ref::<StringArray>()
                    .ok_or_else(|| {
                        DataFusionError::Execution("The timestamp source must contain text.".into())
                    })?;
                let result = values.iter()
                    .map(|v| v.map(utc_millis).transpose())
                    .collect::<datafusion::common::Result<Int64Array>>()?;
                Ok(ColumnarValue::Array(Arc::new(result)))
            }
            _ => Err(DataFusionError::Execution(
                "The timestamp source must contain text.".into(),
            )),
        }),
    );
    ctx.register_udf(function);
    let calendar = create_udf(
        "folio_calendar_start",
        vec![DataType::Int64, DataType::Int64],
        DataType::Int64,
        Volatility::Immutable,
        Arc::new(|args| {
            let ColumnarValue::Scalar(ScalarValue::Int64(Some(size))) = &args[1] else {
                return Err(DataFusionError::Execution("Calendar width must be a constant.".into()));
            };
            let width = u32::try_from(*size)
                .map_err(|_| DataFusionError::Execution("Invalid calendar width.".into()))?;
            let start = |millis| calendar_start(millis, width)
                .ok_or_else(|| DataFusionError::Execution("Calendar interval outside the supported date range.".into()));
            match &args[0] {
                ColumnarValue::Scalar(ScalarValue::Int64(value)) => Ok(ColumnarValue::Scalar(
                    ScalarValue::Int64(value.map(start).transpose()?))),
                ColumnarValue::Array(values) => {
                    let array = values.as_any().downcast_ref::<Int64Array>()
                        .ok_or_else(|| DataFusionError::Execution("Calendar timestamps must use milliseconds.".into()))?;
                    let result = array.iter().map(|v| v.map(start).transpose())
                        .collect::<datafusion::common::Result<Int64Array>>()?;
                    Ok(ColumnarValue::Array(Arc::new(result)))
                }
                _ => Err(DataFusionError::Execution("Calendar timestamps must use milliseconds.".into())),
            }
        }),
    );
    ctx.register_udf(calendar);
}
