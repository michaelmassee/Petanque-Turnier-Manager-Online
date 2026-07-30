@props(['title' => null])

<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ? $title . ' — ' : '' }}Pétanque Turnier Manager</title>
    <x-pwa-head />
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="font-sans antialiased bg-gray-50 text-gray-900 pb-20">

<nav class="sticky top-0 z-40 bg-white border-b border-gray-200">
    <div class="flex h-14 items-center justify-between gap-2 px-3">
        <a href="{{ mroute('tournaments.search') }}" class="flex min-w-0 items-center gap-2 text-lg font-semibold text-green-700">
            <x-application-logo class="h-8 w-8 shrink-0" />
        </a>
        <div class="flex shrink-0 items-center justify-end gap-2 text-sm">
            @foreach(['de' => '🇩🇪', 'en' => '🇬🇧', 'fr' => '🇫🇷', 'nl' => '🇳🇱', 'es' => '🇪🇸'] as $locale => $flag)
                <a href="{{ public_locale_route($locale, 'app.tournaments.search') }}"
                   class="{{ app()->getLocale() === $locale ? 'font-bold text-green-700' : 'text-gray-500 hover:text-gray-800' }}">
                    {{ $flag }}
                </a>
            @endforeach
            <a href="{{ route('profile') }}"
               class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200"
               aria-label="{{ __('mobile.nav.profile') }}">
                <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" />
                </svg>
            </a>
        </div>
    </div>
</nav>

<main class="px-3 py-4">

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

<nav class="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white">
    <div class="grid grid-cols-4">
        @php($tabs = [
            ['route' => 'tournaments.search', 'active' => 'app.tournaments.search', 'icon' => '🔍', 'label' => __('mobile.nav.search')],
            ['route' => 'tournaments.search', 'params' => ['status' => 'registration'], 'active' => null, 'icon' => '✋', 'label' => __('mobile.nav.register')],
            ['route' => 'tournaments.my', 'active' => 'app.tournaments.my', 'icon' => '📋', 'label' => __('mobile.nav.my_tournaments')],
            ['route' => 'tournament-day', 'active' => 'app.tournament-day', 'icon' => '📅', 'label' => __('mobile.nav.tournament_day')],
        ])
        @foreach($tabs as $tab)
            @php($isActive = $tab['active'] && request()->routeIs("public.*.{$tab['active']}"))
            <a href="{{ mroute($tab['route'], $tab['params'] ?? []) }}"
               class="flex flex-col items-center gap-0.5 py-2.5 text-xs {{ $isActive ? 'text-green-700 font-semibold' : 'text-gray-500' }}">
                <span class="text-lg leading-none">{{ $tab['icon'] }}</span>
                <span>{{ $tab['label'] }}</span>
            </a>
        @endforeach
    </div>
</nav>

</body>
</html>
