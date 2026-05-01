use anyhow::Result;
use chromiumoxide::{
    browser::{Browser, BrowserConfig},
    cdp::browser_protocol::page::PrintToPdfParams,
};
use futures::StreamExt;
use std::sync::Arc;
use tokio::sync::Mutex;

/// A shared, reusable Chromium browser instance for PDF generation.
/// Kept alive for the lifetime of the application to avoid spawn overhead.
pub type SharedBrowser = Arc<Mutex<Browser>>;

/// Launch Chromium and return a shared browser + spawn the CDP event handler task.
pub async fn launch_browser(chromium_path: &str) -> Result<SharedBrowser> {
    let config = BrowserConfig::builder()
        .chrome_executable(chromium_path)
        .no_sandbox()
        .build()
        .map_err(|e| anyhow::anyhow!("BrowserConfig error: {e}"))?;

    let (browser, mut handler) = Browser::launch(config).await?;

    // The handler task processes CDP events; it must run for the browser to work.
    tokio::spawn(async move {
        while let Some(event) = handler.next().await {
            if event.is_err() {
                break;
            }
        }
    });

    Ok(Arc::new(Mutex::new(browser)))
}

/// Render `html` to an A4 PDF and return the raw bytes.
pub async fn html_to_pdf(browser: &SharedBrowser, html: String) -> Result<Vec<u8>> {
    let browser = browser.lock().await;
    let page = browser.new_page("about:blank").await?;

    // Set the page content and wait for the load event.
    page.set_content(html).await?;

    let params = PrintToPdfParams {
        // A4 dimensions in inches
        paper_width: Some(8.27),
        paper_height: Some(11.69),
        print_background: Some(true),
        margin_top: Some(0.0),
        margin_bottom: Some(0.0),
        margin_left: Some(0.0),
        margin_right: Some(0.0),
        ..Default::default()
    };

    let pdf = page.pdf(params).await?;
    page.close().await?;

    Ok(pdf)
}
