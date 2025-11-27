/**
 ad.js
  Handles the loading of the Google AdSense script and the injection of ad units
  into the search results page.
 */

// --- CONFIGURATION ---
// !!! IMPORTANT: REPLACE THESE PLACEHOLDERS WITH YOUR ACTUAL GOOGLE ADSENSE IDs !!!
const ADSENSE_CLIENT_ID = 'ca-pub-YOUR_CLIENT_ID'; 
const ADSENSE_AD_SLOT_1 = 'YOUR_AD_SLOT_ID_1';    
const ADSENSE_AD_SLOT_2 = 'YOUR_AD_SLOT_ID_2';   
const AD_INSERTION_POINTS = [5, 10];
// --- END CONFIGURATION ---


/**
 * 1. Injects the Google AdSense script into the document head.
 * This is the standard asynchronous loading method for AdSense.
 */
function loadAdSenseScript() {
    if (document.querySelector(`script[src*="pagead2.googlesyndication.com"]`)) {
        console.log('AdSense script already loaded.');
        return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
    script.crossOrigin = 'anonymous';
    // Append to head for best practice
    document.head.appendChild(script);
    console.log('Google AdSense script loading...');
}

/**
 * 2. Creates the HTML structure for a single Google AdSense ad unit.
 * @param {string} adSlotId The ad slot ID for the unit.
 * @returns {string} The raw HTML string for the ad unit.
 */
function createAdUnitHtml(adSlotId) {
    // Styling added to clearly separate the ad from the search results
    const adHtml = `
        <div class="result-block ad-unit-container" style="border: 1px dashed #cccccc; padding: 15px; margin: 15px 0; background-color: #f9f9f9; text-align: center;">
            <div style="font-weight: bold; color: #666666; margin-bottom: 10px;">Advertisement</div>
            <ins class="adsbygoogle"
                 style="display:block"
                 data-ad-client="${ADSENSE_CLIENT_ID}"
                 data-ad-slot="${adSlotId}"
                 data-ad-format="auto"
                 data-full-width-responsive="true"></ins>
        </div>
    `;
    return adHtml;
}

/**
 * 3. Modifies the global window object to initialize AdSense ad pushing.
 * This function should be called after search results are rendered.
 */
function pushAds() {
    try {
        if (window.adsbygoogle && window.adsbygoogle.length >= 0) {
            // Push any new ads that have been inserted into the DOM since the last push
            // This is crucial for AdSense to recognize and load the ads.
            window.adsbygoogle.push({});
            console.log('Pushed ads to adsbygoogle queue.');
        } else {
            // Initialize the adsbygoogle array if it doesn't exist
            window.adsbygoogle = window.adsbygoogle || [];
            if (window.adsbygoogle.length === 0) {
                 window.adsbygoogle.push({});
            }
            console.warn('adsbygoogle not fully ready, initializing queue.');
        }
    } catch (e) {
        console.error('Error pushing AdSense ads:', e);
    }
}

/**
 * 4. Helper function to integrate ads into the search result rendering process.
 * NOTE: This function needs to be integrated into the existing search-logic.js
 * by replacing the original `renderLinkResults` function with a modified one
 * that uses this logic.
 *
 * @param {object[]} items The search result items.
 * @param {number} total The total number of results.
 * @returns {string} The final HTML string including search results and ad units.
 */
function renderLinkResultsWithAds(items, total, currentPage, maxPageSize) {
    if (!items || items.length === 0) {
        return '<p class="small">No web links found.</p>';
    }

    const maxPages = Math.ceil(total / maxPageSize);
    let htmlContent = `<p class="small">Found ${total} links. Showing page ${currentPage} of ${maxPages}.</p>`;
    
    // Only insert ads on the first page
    const shouldInsertAds = currentPage === 1; 

    // Ad slot rotation (optional: ensures different ads are used)
    const adSlots = [ADSENSE_AD_SLOT_1, ADSENSE_AD_SLOT_2, ADSENSE_AD_SLOT_1];
    let adIndex = 0;

    items.forEach(function(r, index) {
        // Build the standard result block HTML
        htmlContent += `
            <div class="result-block">
                <a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
                <div class="small">${escapeHtml(r.url)}</div>
                <div>${escapeHtml(r.snippet || '')}</div>
            </div>
        `;

        // Check for ad insertion points on page 1
        // The index is 0-based, so for 5th result (index 4), the ad is inserted *after* it.
        if (shouldInsertAds && AD_INSERTION_POINTS.includes(index + 1)) {
            // Get the ad slot for the current insertion point
            const adSlotToUse = adSlots[adIndex % adSlots.length];
            htmlContent += createAdUnitHtml(adSlotToUse);
            adIndex++;
        }
    });
    
    // This is the crucial step: Call the ad pushing logic after HTML is generated
    // but before it's injected into the DOM (the `renderLinkResults` function will inject it).
    // A slight delay ensures the main thread isn't blocked and AdSense has a chance to find the elements.
    setTimeout(pushAds, 50);

    return htmlContent;
}

// Attach the script loader to the initial page load
document.addEventListener('DOMContentLoaded', loadAdSenseScript);

// Export/expose the ad rendering function for use in search-logic.js (or globally)
// In a real browser environment, all global functions are accessible,
// but explicitly defining it here for clarity.
window.renderLinkResultsWithAds = renderLinkResultsWithAds;
