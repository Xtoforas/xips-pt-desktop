pub mod api;
pub mod local_state;

/// Fallback OOTP game version for server profiles that have not set one.
pub const DEFAULT_GAME_VERSION: &str = "ootp27";

/// Built-in XiPS server that first-run users get without typing a URL.
pub const DEFAULT_SERVER_URL: &str = "https://xips.xtoforas.com";
pub const DEFAULT_SERVER_NAME: &str = "XiPS";
pub const DEFAULT_SERVER_PROFILE_ID: &str = "xips-default";
