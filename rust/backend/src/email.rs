use anyhow::{anyhow, Result};
use lettre::{
    message::{header::ContentType, Attachment, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

use crate::config::Config;

/// Send an invoice email with an optional PDF attachment.
pub async fn send_invoice_email(
    config: &Config,
    to: &str,
    subject: &str,
    body: &str,
    pdf_bytes: Option<Vec<u8>>,
    pdf_filename: &str,
) -> Result<()> {
    let smtp_host = config
        .smtp_host
        .as_deref()
        .ok_or_else(|| anyhow!("SMTP not configured"))?;
    let smtp_user = config
        .smtp_user
        .as_deref()
        .ok_or_else(|| anyhow!("SMTP_USER not configured"))?;
    let smtp_password = config
        .smtp_password
        .as_deref()
        .ok_or_else(|| anyhow!("SMTP_PASSWORD not configured"))?;
    let from = config
        .smtp_from
        .as_deref()
        .unwrap_or(smtp_user);

    let text_part = SinglePart::builder()
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string());

    let email_builder = Message::builder()
        .from(from.parse()?)
        .to(to.parse()?)
        .subject(subject);

    let email = if let Some(pdf) = pdf_bytes {
        let attachment = Attachment::new(pdf_filename.to_string())
            .body(pdf, ContentType::parse("application/pdf")?);
        email_builder.multipart(MultiPart::mixed().singlepart(text_part).singlepart(attachment))?
    } else {
        email_builder.singlepart(text_part)?
    };

    let creds = Credentials::new(smtp_user.to_string(), smtp_password.to_string());

    let mailer: AsyncSmtpTransport<Tokio1Executor> =
        AsyncSmtpTransport::<Tokio1Executor>::relay(smtp_host)?
            .port(config.smtp_port)
            .credentials(creds)
            .build();

    mailer.send(email).await?;
    Ok(())
}
