<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ?? config('app.name') }} — Pétanque Turnier Manager</title>
    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=figtree:400,500,600&display=swap" rel="stylesheet"/>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="font-sans antialiased bg-gray-50 text-gray-900">

<nav class="bg-white border-b border-gray-200">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <a href="{{ lroute('tournaments.index') }}"
           class="text-lg font-semibold text-green-700">
            🎯 Pétanque Turnier Manager
        </a>
        <div class="flex items-center gap-3 text-sm">
            @foreach(['de' => '🇩🇪', 'en' => '🇬🇧', 'fr' => '🇫🇷', 'nl' => '🇳🇱', 'es' => '🇪🇸'] as $locale => $flag)
                <a href="{{ public_locale_route($locale) }}" class="{{ app()->getLocale() === $locale ? 'font-bold' : 'text-gray-500 hover:text-gray-800' }}">
                    {{ $flag }} {{ strtoupper($locale) }}
                </a>
            @endforeach
        </div>
    </div>
</nav>

<main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

    @if(session('success'))
        <div class="mb-4 rounded-md bg-green-50 border border-green-200 p-4 text-green-800">
            {{ session('success') }}
        </div>
    @endif
    @if(session('error'))
        <div class="mb-4 rounded-md bg-red-50 border border-red-200 p-4 text-red-800">
            {{ session('error') }}
        </div>
    @endif
    @if(session('info'))
        <div class="mb-4 rounded-md bg-blue-50 border border-blue-200 p-4 text-blue-800">
            {{ session('info') }}
        </div>
    @endif

    {{ $slot }}
</main>

<footer class="mt-12 border-t border-gray-200 py-6 text-center text-sm text-gray-400">
    Pétanque Turnier Manager Online &copy; {{ date('Y') }}
</footer>

</body>
</html>
