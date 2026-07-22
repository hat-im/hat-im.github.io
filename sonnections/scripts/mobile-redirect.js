        // Mobile redirect check - redirect to desktop if not mobile
        function isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                   (window.innerWidth <= 768 && window.innerHeight <= 1024);
        }
        
        if (!isMobile()) {
            window.location.href = 'sonnections.html';
        }
