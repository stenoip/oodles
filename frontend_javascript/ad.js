/**
 * ad.js
 * Handles the loading of the Google AdSense script and the injection of ad units
 * into the search results page, using the 'in-article' fluid format.
 */

// --- CONFIGURATION ---
// !!! IMPORTANT: REPLACE THESE PLACEHOLDERS WITH YOUR ACTUAL GOOGLE ADSENSE IDs !!!
// Note: These IDs must match the ones provided in your sample block
const ADSENSE_CLIENT_ID = 'ca-pub-4433722838067397'; 
const ADSENSE_AD_SLOT_1 = '4169306721';             
const ADSENSE_AD_SLOT_2 = '4169306721'; 
const AD_INSERTION_POINTS = [5, 10]; // Insert ad after the 5th and 10th result
const AD_PUSH_DELAY_MS = 200;        // Increased delay for more reliable ad loading
// --- END CONFIGURATION ---


/**
 * 1. Injects the Google AdSense script into the document head.
 * This script loading must be done only once.
 */
function loadAdSenseScript() {
    // Prevent multiple script loads
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
 * Uses the requested 'in-article' fluid format.
 * @param {string} adSlotId The ad slot ID for the unit.
 * @returns {string} The raw HTML string for the ad unit.
 */
function createAdUnitHtml(adSlotId) {
    // Styling added to clearly separate the ad from the search results.
    // min-height is added to help fluid ads calculate initial size.
    const adHtml = `
        <div class="result-block ad-unit-container" style="border: 1px dashed #cccccc; padding: 15px 0; margin: 15px 0; background-color: #f9f9f9; text-align: center; min-height: 100px;">
            <div style="font-weight: bold; color: #666666; margin-bottom: 10px;">Advertisement</div>
            <ins class="adsbygoogle"
                style="display:block; text-align:center;"
                data-ad-layout="in-article"
                data-ad-format="fluid"
                data-ad-client="${ADSENSE_CLIENT_ID}"
                data-ad-slot="${adSlotId}"></ins>
        </div>
    `;
    return adHtml;
}

/**
 * 3. Modifies the global window object to initialize AdSense ad pushing.
 * This is crucial for AdSense to recognize and load the ads after they are inserted.
 */
function pushAds() {
    try {
        // Ensure the adsbygoogle array is initialized and push the command.
        // This is the core AdSense activation command.
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
        console.log('Pushed ads to adsbygoogle queue.');
    } catch (e) {
        console.error('Error pushing AdSense ads:', e);
    }
}

/**
 * 4. Helper function to integrate ads into the search result rendering process.
 * This function will be called by search-logic.js's renderLinkResults.
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

    // Ad slot rotation using both defined slots
    const adSlots = [ADSENSE_AD_SLOT_1, ADSENSE_AD_SLOT_2];
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
        if (shouldInsertAds && AD_INSERTION_POINTS.includes(index + 1)) {
            // Use ad slot 1, then slot 2, then slot 1 again, etc.
            const adSlotToUse = adSlots[adIndex % adSlots.length];
            htmlContent += createAdUnitHtml(adSlotToUse);
            adIndex++;
        }
    });

    // CRITICAL STEP: Call the ad pushing logic after HTML is generated and a short delay.
    setTimeout(pushAds, AD_PUSH_DELAY_MS);

    return htmlContent;
}

// Attach the script loader to the initial page load
document.addEventListener('DOMContentLoaded', loadAdSenseScript);

// Expose the ad rendering function for use in search-logic.js
window.renderLinkResultsWithAds = renderLinkResultsWithAds;
