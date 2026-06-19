use std::time::{Duration, Instant};

#[derive(Debug, Clone)]
pub struct HealthProbe {
    pub reachable: bool,
    pub latency_ms: Option<u64>,
    pub status: String,
    pub error: Option<String>,
}

pub fn health_url(base: &str) -> Result<url::Url, url::ParseError> {
    let mut url = url::Url::parse(base)?;
    url.set_path("/health");
    url.set_query(None);
    Ok(url)
}

pub async fn probe_health(client: &reqwest::Client, base: &str, timeout: Duration) -> HealthProbe {
    let url = match health_url(base) {
        Ok(url) => url,
        Err(e) => {
            return HealthProbe {
                reachable: false,
                latency_ms: None,
                status: "bad_url".to_string(),
                error: Some(e.to_string()),
            };
        }
    };

    let started = Instant::now();
    let request = client.get(url).timeout(timeout);
    match request.send().await {
        Ok(resp) => {
            let status_code = resp.status();
            let latency_ms = elapsed_millis(started);
            if status_code.is_success() {
                HealthProbe {
                    reachable: true,
                    latency_ms: Some(latency_ms),
                    status: "ok".to_string(),
                    error: None,
                }
            } else {
                HealthProbe {
                    reachable: false,
                    latency_ms: Some(latency_ms),
                    status: format!("http_{}", status_code.as_u16()),
                    error: Some(format!("health returned HTTP {status_code}")),
                }
            }
        }
        Err(e) => HealthProbe {
            reachable: false,
            latency_ms: Some(elapsed_millis(started)),
            status: classify_probe_error(&e).to_string(),
            error: Some(e.to_string()),
        },
    }
}

fn classify_probe_error(err: &reqwest::Error) -> &'static str {
    if err.is_timeout() {
        "timeout"
    } else if err.is_connect() {
        "unreachable"
    } else {
        "error"
    }
}

fn elapsed_millis(started: Instant) -> u64 {
    started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
}

#[cfg(test)]
mod tests {
    use super::health_url;

    #[test]
    fn health_url_rewrites_path_and_query() {
        let url = health_url("http://127.0.0.1:42617/api/status?x=1").unwrap();
        assert_eq!(url.as_str(), "http://127.0.0.1:42617/health");
    }
}
