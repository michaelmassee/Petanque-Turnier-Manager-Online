<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ?? config('app.name') }} — Pétanque Turnier Manager</title>
    <x-pwa-head />
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="font-sans antialiased bg-gray-50 text-gray-900">

<nav class="bg-white border-b border-gray-200">
    <div class="max-w-5xl mx-auto flex h-14 items-center justify-between gap-2 px-3 sm:h-16 sm:px-6 lg:px-8">
        <a href="{{ lroute('tournaments.index') }}"
           class="flex min-w-0 items-center gap-2 text-lg font-semibold text-green-700">
            <x-application-logo class="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
            <span class="hidden truncate sm:inline">Pétanque Turnier Manager</span>
        </a>
        <div class="flex shrink-0 items-center justify-end gap-1.5 text-sm sm:gap-2">
            @guest
                <a href="{{ route('login') }}"
                   class="inline-flex min-h-9 shrink-0 items-center rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">
                    {{ __('Login') }}
                </a>
            @endguest
            @auth
                <details class="relative">
                    <summary class="flex min-h-9 max-w-24 cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-950 sm:max-w-36 [&::-webkit-details-marker]:hidden">
                            <span class="truncate">{{ auth()->user()->name }}</span>
                            <svg class="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                            </svg>
                    </summary>

                    <div class="absolute right-0 z-50 mt-2 w-48 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5">
                        <form method="POST" action="{{ route('logout') }}">
                            @csrf
                            <button type="submit" class="block w-full px-4 py-2 text-start text-sm leading-5 text-gray-700 transition duration-150 ease-in-out hover:bg-gray-100 focus:bg-gray-100 focus:outline-none">
                                Logout
                            </button>
                        </form>
                        <x-dropdown-link :href="route('profile')">
                            Profil
                        </x-dropdown-link>
                        @if(auth()->user()->canAccessAdmin())
                            <x-dropdown-link :href="route('admin.tournaments.index')">
                                Turniere
                            </x-dropdown-link>
                        @endif
                        @if(auth()->user()->isAdmin())
                            <x-dropdown-link :href="route('admin.users.index')">
                                {{ __('admin.users') }}
                            </x-dropdown-link>
                        @endif
                    </div>
                </details>
            @endauth
            @foreach(['de' => '🇩🇪', 'en' => '🇬🇧', 'fr' => '🇫🇷', 'nl' => '🇳🇱', 'es' => '🇪🇸'] as $locale => $flag)
                <a href="{{ public_locale_route($locale) }}" class="{{ app()->getLocale() === $locale ? 'font-bold' : 'text-gray-500 hover:text-gray-800' }}">
                    <span class="sm:hidden">{{ $flag }}</span><span class="hidden sm:inline">{{ $flag }} {{ strtoupper($locale) }}</span>
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

<footer class="mt-12 border-t border-gray-200 py-6 text-center text-sm text-gray-500">
    <div class="flex flex-wrap items-center justify-center gap-4">
        <span>Pétanque Turnier Manager Online &copy; {{ date('Y') }}</span>
        <a href="{{ lroute('legal.imprint') }}" class="hover:text-gray-800">{{ __('legal.imprint.title') }}</a>
        <a href="{{ lroute('legal.privacy') }}" class="hover:text-gray-800">{{ __('legal.privacy.title') }}</a>
    </div>
</footer>

</body>
</html>
