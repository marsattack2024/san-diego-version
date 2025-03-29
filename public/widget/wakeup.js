/**
 * Marlan Chat Widget Wakeup Script
 * 
 * This script keeps the widget API warm by sending periodic pings.
 * It's designed to be embedded on high-traffic pages where chat 
 * functionality is important.
 */
(function () {
    // Avoid loading the wakeup script multiple times
    if (window.marlanWakeupActive) {
        console.log("Marlan wakeup script already active");
        return;
    }

    window.marlanWakeupActive = true;

    // Configuration
    const config = {
        pingInterval: 60000, // 1 minute
        pingEndpoint: "/api/ping", // Uses the ping endpoint to wake up all services
        errorBackoff: 5, // Exponential backoff multiplier on error
        maxBackoff: 300000, // Max 5 minutes backoff
        retryCount: 0, // Number of consecutive errors
        debug: false
    };

    // Allow configuration override
    if (window.marlanWakeupConfig) {
        Object.assign(config, window.marlanWakeupConfig);
    }

    // Log function that respects debug setting
    function log(...args) {
        if (config.debug) {
            console.log("[Marlan Wakeup]", ...args);
        }
    }

    // Function to ping the API
    async function pingWidget() {
        try {
            const startTime = Date.now();

            // Add cache-busting parameter
            const pingUrl = `${config.pingEndpoint}?t=${Date.now()}`;

            // Send the ping request
            const response = await fetch(pingUrl, {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache, no-store',
                    'Pragma': 'no-cache'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const pingTime = Date.now() - startTime;

                log(`Ping successful in ${pingTime}ms`, data);

                // Reset backoff on success
                config.retryCount = 0;

                // Schedule next ping at normal interval
                setTimeout(pingWidget, config.pingInterval);
            } else {
                throw new Error(`Ping failed with status: ${response.status}`);
            }
        } catch (error) {
            // Increase retry count and implement exponential backoff
            config.retryCount++;

            // Calculate backoff time with exponential backoff
            const backoff = Math.min(
                config.pingInterval * Math.pow(config.errorBackoff, config.retryCount - 1),
                config.maxBackoff
            );

            log(`Ping error (retry ${config.retryCount}), next attempt in ${backoff / 1000}s:`, error);

            // Schedule retry with backoff
            setTimeout(pingWidget, backoff);
        }
    }

    // Start pinging immediately after page load
    setTimeout(() => {
        log("Starting widget wakeup service");
        pingWidget();
    }, 1000);

    // Add ping on visibility change (when user returns to the tab)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            log("Page visible, sending immediate ping");
            pingWidget();
        }
    });
})(); 