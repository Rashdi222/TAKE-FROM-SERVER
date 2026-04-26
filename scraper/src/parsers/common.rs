use serde_json::Value;

pub fn string_field(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(v)) if !v.trim().is_empty() => Some(v.trim().to_owned()),
        Some(Value::Number(v)) => Some(v.to_string()),
        Some(Value::Bool(v)) => Some(v.to_string()),
        _ => None,
    }
}

pub fn number_field_as_u64(value: Option<&Value>) -> Option<u64> {
    match value {
        Some(Value::Number(v)) => v.as_u64().or_else(|| v.as_i64().map(|n| n.max(0) as u64)),
        Some(Value::String(v)) => v.parse::<u64>().ok(),
        _ => None,
    }
}

pub fn number_field_as_f64(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(v)) => v.as_f64(),
        Some(Value::String(v)) => v.parse::<f64>().ok(),
        _ => None,
    }
}

pub fn object_field<'a>(value: &'a Value, key: &str) -> Option<&'a serde_json::Map<String, Value>> {
    value.get(key)?.as_object()
}

pub fn array_field<'a>(value: &'a Value, key: &str) -> Option<&'a Vec<Value>> {
    value.get(key)?.as_array()
}
