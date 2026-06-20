use anyhow::{Context, Result};
use std::net::{Ipv4Addr, SocketAddrV4, TcpListener};

pub const INNER_PORT_START: u16 = 42618;
pub const INNER_PORT_END: u16 = 42699;

pub fn pick_inner_port() -> Result<u16> {
    for port in INNER_PORT_START..=INNER_PORT_END {
        if is_available(port) {
            return Ok(port);
        }
    }

    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
        .context("bind ephemeral inner port")?;
    Ok(listener.local_addr()?.port())
}

fn is_available(port: u16) -> bool {
    TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_inner_port_never_uses_default_gateway_port() {
        let port = pick_inner_port().unwrap();
        assert_ne!(port, crate::connection::discover::DEFAULT_PORT);
    }
}
