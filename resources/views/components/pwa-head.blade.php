<meta name="theme-color" content="#047857">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="PTM Handy">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="{{ asset('manifest.webmanifest') }}">
<link rel="icon" type="image/png" sizes="32x32" href="{{ asset('images/petanqueturniermanager-logo-32px.png') }}">
<link rel="icon" type="image/png" sizes="192x192" href="{{ asset('images/petanqueturniermanager-logo-192px.png') }}">
<link rel="apple-touch-icon" sizes="256x256" href="{{ asset('images/petanqueturniermanager-logo-256px.png') }}">
<script>
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js');
        });
    }
</script>
