      // Mobile detection and redirect script
      (function () {
        // Check if already on mobile version
        if (window.location.pathname.includes("wordle-mobile.html")) {
          return;
        }

        // Detect mobile devices
        function isMobileDevice() {
          // Check user agent for mobile indicators
          const userAgent = navigator.userAgent.toLowerCase();
          const mobileKeywords = [
            "android",
            "webos",
            "iphone",
            "ipad",
            "ipod",
            "blackberry",
            "windows phone",
            "opera mini",
          ];

          const hasMobileKeyword = mobileKeywords.some((keyword) =>
            userAgent.includes(keyword)
          );

          // Check for touch capability and screen size
          const isTouchDevice =
            "ontouchstart" in window ||
            navigator.maxTouchPoints > 0 ||
            navigator.msMaxTouchPoints > 0;

          const hasSmallScreen =
            window.screen.width <= 768 || window.innerWidth <= 768;

          // Additional mobile checks
          const hasLimitedPointer =
            window.matchMedia("(pointer: coarse)").matches;
          const hasLimitedHover = window.matchMedia("(hover: none)").matches;

          return (
            hasMobileKeyword ||
            (isTouchDevice && hasSmallScreen) ||
            (hasLimitedPointer && hasLimitedHover)
          );
        }

        // Redirect to mobile version if on mobile device
        if (isMobileDevice()) {
          // Preserve any URL parameters or hash
          const currentUrl = new URL(window.location);
          const mobileUrl = new URL(
            "wordle-mobile.html",
            currentUrl.origin + currentUrl.pathname.replace(/\/[^\/]*$/, "/")
          );

          // Copy search parameters and hash
          mobileUrl.search = currentUrl.search;
          mobileUrl.hash = currentUrl.hash;

          // Add a parameter to indicate redirect happened (useful for analytics)
          const params = new URLSearchParams(mobileUrl.search);
          if (!params.has("mobile_redirect")) {
            params.set("mobile_redirect", "1");
            mobileUrl.search = params.toString();
          }

          // Perform redirect
          window.location.replace(mobileUrl.toString());
        }
      })();
