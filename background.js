// Handle Google suggestions API requests to avoid CORS issues

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSuggestions') {
        fetchSuggestions(request.query)
            .then(suggestions => {
                sendResponse({ suggestions: suggestions });
            })
            .catch(error => {
                console.error('Error fetching suggestions:', error);
                sendResponse({ suggestions: [] });
            });
        return true; // Keep message channel open for async response
    }
});

async function fetchSuggestions(query) {
    try {
        const response = await fetch(
            `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        return data[1] || [];
    } catch (error) {
        console.error('Fetch error:', error);
        return [];
    }
}
