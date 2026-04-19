use std::sync::Arc;

use lettre::{
    message::header::ContentType,
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

use crate::Config;

/// Opt-in email sender.
///
/// Wraps an optional SMTP transport and "from" address.  When SMTP is not
/// configured the struct is still constructable (inner `None`) and every
/// send attempt is silently skipped, making email strictly opt-in.
#[derive(Clone)]
pub struct EmailSender {
    inner: Option<Arc<AsyncSmtpTransport<Tokio1Executor>>>,
    from: Option<String>,
}

impl EmailSender {
    /// Build an `EmailSender` from the application config.
    ///
    /// Returns a no-op sender when `smtp_host` is absent.
    pub fn from_config(config: &Config) -> Self {
        let mailer = Self::build_mailer(config);
        Self {
            inner: mailer.map(Arc::new),
            from: config.smtp_from.clone(),
        }
    }

    /// Whether email sending is enabled.
    pub fn is_enabled(&self) -> bool {
        self.inner.is_some() && self.from.is_some()
    }

    /// Send an email.  Silently returns `Ok(())` when SMTP is not configured.
    pub async fn send(
        &self,
        to: &str,
        subject: &str,
        body: &str,
    ) -> Result<(), anyhow::Error> {
        let Some(ref mailer) = self.inner else {
            return Ok(());
        };
        let Some(ref from) = self.from else {
            return Ok(());
        };

        let message = Message::builder()
            .from(from.parse()?)
            .to(to.parse()?)
            .subject(subject)
            .header(ContentType::TEXT_PLAIN)
            .body(body.to_string())?;

        mailer.send(message).await?;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    fn build_mailer(config: &Config) -> Option<AsyncSmtpTransport<Tokio1Executor>> {
        let host = config.smtp_host.as_deref()?;
        let username = config.smtp_username.clone().unwrap_or_default();
        let password = config.smtp_password.clone().unwrap_or_default();

        let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
            .ok()?
            .port(config.smtp_port)
            .credentials(Credentials::new(username, password))
            .build();

        Some(mailer)
    }
}
