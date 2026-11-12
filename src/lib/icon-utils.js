export async function scrapeIcon(targetUrl) {
    try {
        const url = new URL(targetUrl);
        const baseUrl = `${url.protocol}//${url.hostname}`;

        // Fallback using Google's favicon service (very reliable)
        const googleIcon = `https://s2.googleusercontent.com/s2/favicons?domain=${url.hostname}&sz=128`;

        // In a real app, we might want to fetch the page and look for apple-touch-icon
        // but for simplicity and reliability, Google's service is excellent.
        // If the user wants a custom one, they can upload or provide a link.

        return googleIcon;
    } catch (error) {
        console.error('Error scraping icon:', error);
        return null;
    }
}
