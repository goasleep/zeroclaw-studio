//! Guided install for users who explicitly chose to set up a new local
//! `zeroclaw`. Never triggered automatically — the welcome screen offers
//! "Connect to remote", "Connect to existing local", AND "Set up new
//! local" as three separate user choices.
//!
//! This module just produces the install command for the UI to display.
//! Phase 7 will add an opt-in "run it for me" path via shell out.

use serde::Serialize;

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct InstallInstructions {
    /// The one-liner the user copy-pastes into their terminal.
    pub command: String,
    /// Pretty notes the UI can render under the command.
    pub notes: Vec<String>,
    /// Where to point the user if they want to read more first.
    pub docs_url: String,
}

pub fn instructions() -> InstallInstructions {
    InstallInstructions {
        command:
            "curl -fsSL https://raw.githubusercontent.com/zeroclaw-labs/zeroclaw/master/install.sh | bash"
                .to_string(),
        notes: vec![
            "Installs the latest stable zeroclaw binary into ~/.local/bin or /usr/local/bin.".into(),
            "Use --prebuilt for a fast binary install, or --source to compile.".into(),
            "After install completes, click \"Detect again\" — the workspace will pick up the binary.".into(),
        ],
        docs_url: "https://github.com/zeroclaw-labs/zeroclaw#install".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instructions_command_is_install_sh() {
        let i = instructions();
        assert!(i.command.contains("install.sh"));
        assert!(!i.notes.is_empty());
    }
}
