// Global Variables
var isAIOverviewEnabled = true;
var currentSearchType = "all";
var currentQuery = "";
var currentPage = 1;
var isLoadingMore = false;
var hasMoreResults = true;

var lastAIRawText = null;
var lastFetchedItems = null;
var allTabImagesCache = [];
var searchCache = {};
var aiTimeout = null;

var AD_PUSH_DELAY_MS = 300;
var ADSENSE_AD_SLOT_1 = "slot_1";


// We use a simple loop instead of regular expressions to check characters
function escapeHtml(text) {
    if (!text) {
        return "";
    }
    
    var textString = String(text);
    var safeString = "";
    
    // Loop through every single letter, just like we learn in string manipulation
    for (var i = 0; i < textString.length; i++) {
        var character = textString[i];
        
        if (character === "&") {
            safeString += "&amp;";
        } else if (character === "<") {
            safeString += "&lt;";
        } else if (character === ">") {
            safeString += "&gt;";
        } else {
            safeString += character;
        }
    }
    
    return safeString;
}

function renderMarkdown(text) {
    if (typeof marked !== "undefined") {
        if (typeof marked.parse === "function") {
            return marked.parse(text);
        }
    }
    return text;
}

function getElement(elementId) {
    return document.getElementById(elementId);
}

function applyAIResultsFromCache(aiRawText) {
    if (!aiRawText) {
        return;
    }

    var overviewElement = getElement("aiOverview");
    if (!overviewElement) {
        return;
    }

    if (isAIOverviewEnabled === true) {
        overviewElement.innerHTML = renderMarkdown(aiRawText);
    } else {
        overviewElement.innerHTML = "";
    }
}

function setupAIOverviewToggle() {
    var toggleElement = getElement("aiOverviewToggle");
    var citizenMsgElement = getElement("goodCitizenMessage");
    var overviewElement = getElement("aiOverview");

    if (!toggleElement) {
        return;
    }

    var storedState = sessionStorage.getItem("aiOverviewState");
    if (storedState !== null) {
        if (storedState === "true") {
            isAIOverviewEnabled = true;
        } else {
            isAIOverviewEnabled = false;
        }
    }

    toggleElement.checked = isAIOverviewEnabled;
    updateCitizenMessageVisibility();

    toggleElement.addEventListener("change", function () {
        isAIOverviewEnabled = this.checked;
        sessionStorage.setItem("aiOverviewState", isAIOverviewEnabled);

        if (isAIOverviewEnabled === true) {
            if (citizenMsgElement) {
                citizenMsgElement.style.display = "none";
            }
            
            var isWebSearch = currentSearchType === "web";
            var isAllSearch = currentSearchType === "all";
            
            if (currentQuery !== "" && (isWebSearch === true || isAllSearch === true)) {
                if (lastAIRawText !== null) {
                    applyAIResultsFromCache(lastAIRawText);
                } else {
                    executeSearch(currentQuery, currentSearchType, currentPage);
                }
            }
        } else {
            if (overviewElement) {
                overviewElement.innerHTML = "";
            }
            if (citizenMsgElement) {
                citizenMsgElement.style.display = "block";
            }
        }
    });
}

function updateCitizenMessageVisibility() {
    var citizenMsgElement = getElement("goodCitizenMessage");
    if (!citizenMsgElement) {
        return;
    }

    var showMessage = false;
    
    if (isAIOverviewEnabled === false) {
        if (currentSearchType === "web") {
            showMessage = true;
        } else if (currentSearchType === "all") {
            showMessage = true;
        } else if (currentSearchType === "image") {
            showMessage = true;
        }
    }

    // No ternary operators here, just standard if/else
    if (showMessage === true) {
        citizenMsgElement.style.display = "block";
    } else {
        citizenMsgElement.style.display = "none";
    }
}

function switchTab(tabName, executeNewSearch) {
    if (window.event) {
        if (window.event.preventDefault) {
            window.event.preventDefault();
        }
    }

    var normalizedTab = "all";
    var newSearchType = "all";

    if (tabName === "web" || tabName === "links") {
        normalizedTab = "links";
        newSearchType = "web";
    } else if (tabName === "image" || tabName === "images") {
        normalizedTab = "images";
        newSearchType = "image";
    } else if (tabName === "video" || tabName === "videos") {
        normalizedTab = "videos";
        newSearchType = "video";
    } else if (tabName === "all") {
        normalizedTab = "all";
        newSearchType = "all";
    }

    currentSearchType = newSearchType;

    if (normalizedTab !== "all") {
        var chatSection = getElement("chatSection");
        if (chatSection) {
            chatSection.style.display = "none";
        }
    }

    var tabs = document.querySelectorAll("nav a.frutiger-aero-tab");
    for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove("active");
    }

    var sectionIds = ["allSection", "linksSection", "imagesSection", "videosSection"];
    for (var j = 0; j < sectionIds.length; j++) {
        var sectionEl = getElement(sectionIds[j]);
        if (sectionEl) {
            sectionEl.style.display = "none";
        }
    }

    var activeTabElement = getElement("tab-" + normalizedTab);
    var activeSectionElement = getElement(normalizedTab + "Section");

    if (activeTabElement) {
        activeTabElement.classList.add("active");
    }
    if (activeSectionElement) {
        activeSectionElement.style.display = "block";
    }

    updateCitizenMessageVisibility();

    if (executeNewSearch === false) {
        var overviewEl = getElement("aiOverview");
        if (overviewEl) {
            overviewEl.innerHTML = "";
        }
        if (aiTimeout) {
            clearTimeout(aiTimeout);
        }
    }

    if (currentQuery !== "") {
        executeSearch(currentQuery, newSearchType, 1);
    }

    cleanupUIForTabs(normalizedTab);
}

function cleanupUIForTabs(activeTab) {
    var kpContainer = getElement("knowledgePanelContainer");
    var snippetContainer = getElement("featuredSnippetContainer");
    var productContainer = getElement("popularProductsContainer");

    if (activeTab === "all") {
        if (kpContainer) {
            if (kpContainer.innerHTML !== "") {
                kpContainer.style.display = "block";
            }
        }
        if (snippetContainer) {
            if (snippetContainer.innerHTML !== "") {
                snippetContainer.style.display = "block";
            }
        }
        if (productContainer) {
            if (productContainer.innerHTML !== "") {
                productContainer.style.display = "block";
            }
        }
    } else {
        if (kpContainer) {
            kpContainer.style.display = "none";
        }
        if (snippetContainer) {
            snippetContainer.style.display = "none";
        }
        if (productContainer) {
            productContainer.style.display = "none";
        }
    }
}

function renderSingleLink(item) {
    if (!item) {
        return "";
    }

    var sourceBadge = "";
    if (item.source) {
        sourceBadge = '<span style="color: #006400; font-weight: bold; margin-left: 5px;">[' + escapeHtml(item.source) + ']</span>';
    }

    var snippetText = "";
    if (item.snippet) {
        snippetText = escapeHtml(item.snippet);
    }

    // Basic string concatenation instead of push/join
    var htmlString = "";
    htmlString += '<div class="result-block">';
    htmlString += '<a href="' + item.url + '" target="_blank" rel="noopener">' + escapeHtml(item.title) + '</a>';
    htmlString += '<div class="small">' + escapeHtml(item.url) + ' ' + sourceBadge + '</div>';
    htmlString += '<div>' + snippetText + '</div>';
    htmlString += '</div>';
    
    return htmlString;
}

// No push() used here, just string concatenation (+=)
function renderAllResults(query, webData, imgData, vidData) {
    var allContainer = getElement("allResults");
    if (!allContainer) {
        return;
    }

    var combinedHtml = "";

    var topLinksHtml = "";
    if (webData) {
        if (webData.items) {
            for (var wTop = 0; wTop < 3; wTop++) {
                if (webData.items[wTop]) {
                    topLinksHtml += renderSingleLink(webData.items[wTop]);
                }
            }
        }
    }
    combinedHtml += '<div class="all-web-top">' + topLinksHtml + '</div>';

    if (imgData) {
        if (imgData.items) {
            if (imgData.items.length > 0) {
                allTabImagesCache = imgData.items;

                var imageItemsHtml = "";
                for (var j = 0; j < imgData.items.length; j++) {
                    var img = imgData.items[j];
                    imageItemsHtml += '<img src="' + img.thumbnail + '" onclick="openImageModalFromAll(' + j + ')" title="' + escapeHtml(img.title) + '" style="height: 120px; border-radius: 8px; cursor: pointer; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">';
                }

                combinedHtml += '<div class="all-image-strip" style="margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.4); border-radius: 12px; border: 1px solid rgba(255,255,255,0.7); box-shadow: 0 4px 10px rgba(0,0,0,0.05);">';
                combinedHtml += '<h4 class="small" style="margin-top:0; margin-bottom: 10px; color: #0277bd;">Images for ' + escapeHtml(query) + '</h4>';
                combinedHtml += '<div style="display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px;">';
                combinedHtml += imageItemsHtml;
                combinedHtml += '</div></div>';
            }
        }
    }

    if (vidData) {
        if (vidData.length > 0) {
            var video = vidData[0];
            var videoId = video.id.videoId;
            var videoTitle = escapeHtml(video.snippet.title);

            combinedHtml += '<div class="all-video-featured" style="margin: 20px 0; display: flex; flex-wrap: wrap; gap: 15px; background: linear-gradient(to right, rgba(225, 245, 254, 0.6), rgba(255, 255, 255, 0.4)); padding: 15px; border-radius: 12px;">';
            combinedHtml += '<div style="flex: 0 0 auto;">';
            combinedHtml += '<iframe src="https://www.youtube.com/embed/' + videoId + '" style="width: 240px; aspect-ratio: 16/9; border-radius: 8px;" allowfullscreen></iframe>';
            combinedHtml += '</div>';
            combinedHtml += '<div style="flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: center;">';
            combinedHtml += '<h4 style="margin:0 0 5px 0; font-size:15px; color: #01579b;">Featured Video</h4>';
            combinedHtml += '<a href="https://www.youtube.com/watch?v=' + videoId + '" target="_blank" style="font-weight:bold; color: #0288d1;">' + videoTitle + '</a>';
            combinedHtml += '</div>';
            combinedHtml += '</div>';
        }
    }

    if (typeof createAdUnitHtml === "function") {
        combinedHtml += createAdUnitHtml(ADSENSE_AD_SLOT_1);
    }

    var bottomLinksHtml = "";
    if (webData) {
        if (webData.items) {
            for (var k = 3; k < 8; k++) {
                if (webData.items[k]) {
                    bottomLinksHtml += renderSingleLink(webData.items[k]);
                }
            }
        }
    }
    
    combinedHtml += '<div class="all-web-bottom">' + bottomLinksHtml + '</div>';
    combinedHtml += '<div style="text-align:center; margin-top:15px;"><button class="frutiger-aero-tab" onclick="switchTab(\'web\', true)">See more results</button></div>';

    allContainer.innerHTML = combinedHtml;

    if (typeof pushAds === "function") {
        setTimeout(pushAds, AD_PUSH_DELAY_MS);
    }
}

function renderLinkResults(items, total, isAppend) {
    var resultsElement = getElement("linkResults");
    if (!resultsElement) {
        return;
    }

    if (!items || items.length === 0) {
        if (isAppend === false) {
            resultsElement.innerHTML = '<p class="small">No web links found.</p>';
        }
        return;
    }

    if (isAppend === false) {
        if (typeof window.renderLinkResultsWithAds === "function") {
            resultsElement.innerHTML = window.renderLinkResultsWithAds(items, total, 1, items.length);
            return;
        }
    }

    var generatedHtml = "";
    for (var i = 0; i < items.length; i++) {
        generatedHtml += renderSingleLink(items[i]);
    }

    if (isAppend === true) {
        var wrapper = document.createElement("div");
        wrapper.innerHTML = generatedHtml;
        resultsElement.appendChild(wrapper);
    } else {
        resultsElement.innerHTML = '<p class="small">Found ' + total + ' links.</p>' + generatedHtml;
    }
}

function renderImageResults(items, total, isAppend) {
    var resultsElement = getElement("imageResults");
    if (!resultsElement) {
        return;
    }

    if (!items || items.length === 0) {
        if (isAppend === false) {
            resultsElement.innerHTML = '<p class="small">No images found.</p>';
        }
        return;
    }

    var indexOffset = 0;
    if (isAppend === true) {
        if (lastFetchedItems) {
            indexOffset = lastFetchedItems.length - items.length;
        }
    }
    
    var generatedHtml = "";

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var trueIdx = indexOffset + i;
        
        var width = "?";
        if (item.width) {
            width = item.width;
        }
        
        var height = "?";
        if (item.height) {
            height = item.height;
        }

        generatedHtml += '<div class="image-result-item" onclick="openImageModal(' + trueIdx + ')">';
        generatedHtml += '<div class="img-wrapper">';
        generatedHtml += '<img src="' + item.thumbnail + '" alt="' + escapeHtml(item.title) + '" loading="lazy"/>';
        generatedHtml += '</div>';
        generatedHtml += '<div class="img-hover-overlay"><span>' + width + ' x ' + height + '</span></div>';
        generatedHtml += '</div>';
    }

    if (isAppend === true) {
        var wrapper = document.createElement("div");
        wrapper.style.display = "contents";
        wrapper.innerHTML = generatedHtml;
        resultsElement.appendChild(wrapper);
    } else {
        resultsElement.innerHTML = generatedHtml;
    }
}

function renderVideoResults(items) {
    var resultsElement = getElement("videoResults");
    if (!resultsElement) {
        return;
    }

    if (!items || items.length === 0) {
        resultsElement.innerHTML = '<p class="small">No videos found.</p>';
        return;
    }

    var generatedHtml = "";
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var videoId = item.id.videoId;

        generatedHtml += '<div class="video-card-aero" style="background: rgba(255,255,255,0.3); border: 1px solid rgba(255,255,255,0.5); backdrop-filter: blur(5px); border-radius: 10px; padding: 5px; margin-bottom: 15px;">';
        generatedHtml += '<iframe src="https://www.youtube.com/embed/' + videoId + '" style="border-radius: 5px; width: 100%; aspect-ratio: 16/9; border:none;" allowfullscreen></iframe>';
        generatedHtml += '<div style="padding: 10px;">';
        generatedHtml += '<a href="https://www.youtube.com/watch?v=' + videoId + '" target="_blank" class="small" style="font-weight:bold; display:block; color: #0d47a1;">' + escapeHtml(item.snippet.title) + '</a>';
        generatedHtml += '<span class="small" style="opacity:0.8;">' + escapeHtml(item.snippet.channelTitle) + '</span>';
        generatedHtml += '</div>';
        generatedHtml += '</div>';
    }

    resultsElement.innerHTML = generatedHtml;
}

function openImageModalFromAll(index) {
    lastFetchedItems = allTabImagesCache;
    openImageModal(index);
}

function openImageModal(index) {
    if (!lastFetchedItems) {
        return;
    }
    if (!lastFetchedItems[index]) {
        return;
    }

    var item = lastFetchedItems[index];

    var fullImgUrl = "";
    if (item.thumbnail) {
        fullImgUrl = item.thumbnail;
    } else if (item.url) {
        fullImgUrl = item.url;
    } else if (item.media_url) {
        fullImgUrl = item.media_url;
    }
    
    var title = "Image Result";
    if (item.title) {
        title = item.title;
    }
    
    var sourceUrl = "";
    if (item.pageUrl) {
        sourceUrl = item.pageUrl;
    } else if (item.sourceUrl) {
        sourceUrl = item.sourceUrl;
    }
    
    var sourceName = "Website";
    if (item.source) {
        sourceName = item.source;
    }

    var width = null;
    if (item.width) {
        width = item.width;
    } else if (item.w) {
        width = item.w;
    } else if (item.details) {
        if (item.details.width) {
            width = item.details.width;
        }
    }

    var height = null;
    if (item.height) {
        height = item.height;
    } else if (item.h) {
        height = item.h;
    } else if (item.details) {
        if (item.details.height) {
            height = item.details.height;
        }
    }

    var dimensionsText = "Dimensions Unknown";
    if (width !== null) {
        if (height !== null) {
            dimensionsText = width + " x " + height;
        }
    }

    var modalImg = getElement("modalImage");
    if (modalImg) {
        modalImg.src = fullImgUrl;
    }
    
    var modalTitle = getElement("modalTitle");
    if (modalTitle) {
        modalTitle.innerText = title;
    }
    
    var modalDims = getElement("modalDims");
    if (modalDims) {
        modalDims.innerText = dimensionsText;
    }

    var modalSource = getElement("modalSource");
    if (modalSource) {
        modalSource.innerHTML = '<strong>Source:</strong> ' + escapeHtml(sourceName) + '<br>' +
            '<span style="word-break: break-all; font-size: 0.85em; opacity: 0.8;">' + escapeHtml(sourceUrl) + '</span>';
    }

    var btnVisit = getElement("btnVisit");
    if (btnVisit) {
        btnVisit.onclick = function () {
            window.open(sourceUrl, "_blank");
        };
    }

    var btnDownload = getElement("btnDownload");
    if (btnDownload) {
        btnDownload.onclick = function () {
            forceDownload(fullImgUrl, title);
        };
    }

    var btnShare = getElement("btnShare");
    if (btnShare) {
        btnShare.onclick = function () {
            shareImage(fullImgUrl, title, sourceUrl);
        };
    }

    var overlay = getElement("imageModalOverlay");
    if (overlay) {
        overlay.style.display = "flex";
    }
}

function closeImageModal() {
    var overlay = getElement("imageModalOverlay");
    if (overlay) {
        overlay.style.display = "none";
    }
    var modalImg = getElement("modalImage");
    if (modalImg) {
        modalImg.src = "";
    }
}

function forceDownload(url, filename) {
    fetch(url)
        .then(function (response) {
            return response.blob();
        })
        .then(function (blob) {
            var blobUrl = window.URL.createObjectURL(blob);
            var link = document.createElement("a");
            link.href = blobUrl;
            
            if (filename) {
                link.download = filename;
            } else {
                link.download = "image";
            }
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        })
        .catch(function () {
            window.open(url, "_blank");
        });
}

function shareImage(imgUrl, title, pageUrl) {
    if (navigator.share) {
        navigator.share({
            title: title,
            text: "Check out this image found on Oodles Search!",
            url: pageUrl
        }).catch(function () {
            console.log("Share canceled by user.");
        });
    } else {
        if (navigator.clipboard) {
            if (navigator.clipboard.writeText) {
                navigator.clipboard.writeText(pageUrl).then(function () {
                    alert("Link copied to clipboard!");
                });
            }
        }
    }
}

document.addEventListener("click", function (event) {
    var overlay = getElement("imageModalOverlay");
    if (event.target === overlay) {
        closeImageModal();
    }
});

function setupInfiniteScrollDetection() {
    window.addEventListener("scroll", function () {
        var pageHeight = document.body.offsetHeight;
        var scrollPosition = window.innerHeight + window.scrollY;
        
        if (pageHeight - scrollPosition <= 400) {
            if (isLoadingMore === false) {
                if (hasMoreResults === true) {
                    if (currentSearchType !== "all") {
                        if (currentSearchType !== "video") {
                            if (typeof loadMoreInfiniteResults === "function") {
                                loadMoreInfiniteResults();
                            }
                        }
                    }
                }
            }
        }
    });
}

function initializeFromSession() {
    var urlParams = new URLSearchParams(window.location.search);
    var query = urlParams.get("q");
    
    var searchType = urlParams.get("type");
    if (!searchType) {
        searchType = "all";
    }
    
    var pageRaw = urlParams.get("page");
    var page = parseInt(pageRaw, 10);
    if (!page) {
        page = 1;
    }

    if (!query) {
        var storedQuery = sessionStorage.getItem("metaSearchQuery");
        if (storedQuery) {
            query = storedQuery;
        } else {
            query = "";
        }
        
        var storedType = sessionStorage.getItem("searchType");
        if (storedType) {
            searchType = storedType;
        } else {
            searchType = "all";
        }
    }

    sessionStorage.removeItem("metaSearchQuery");
    sessionStorage.removeItem("searchType");

    setupAIOverviewToggle();
    setupInfiniteScrollDetection();

    if (query !== "") {
        switchTab(searchType, false);
        if (typeof executeSearch === "function") {
            executeSearch(query, searchType, page);
        }
    } else {
        switchTab("all", false);
    }
}

document.addEventListener("DOMContentLoaded", initializeFromSession);

var currentQueryEl = getElement("currentQuery");
if (currentQueryEl) {
    currentQueryEl.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();

            var query = this.value.trim();
            var searchType = "all";
            if (currentSearchType !== "") {
                searchType = currentSearchType;
            }

            lastAIRawText = null;
            lastFetchedItems = null;
            searchCache = {};
            if (aiTimeout) {
                clearTimeout(aiTimeout);
            }

            var nextUrl = "search.html?q=" + encodeURIComponent(query) + "&type=" + searchType + "&page=1";
            window.location.href = nextUrl;
        }
    });
}
