<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-semibold text-gray-800">{{ __('admin.edit_tournament') }}: {{ $tournament->name }}</h2>
    </x-slot>

    <div class="py-6">
        <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

            @if(session('success'))
                <div class="rounded-md bg-green-50 border border-green-200 p-4 text-green-800">{{ session('success') }}</div>
            @endif

            <div class="bg-white rounded-lg shadow p-6">
                <form method="POST" action="{{ route('admin.tournaments.update', $tournament) }}" class="space-y-5">
                    @csrf @method('PUT')
                    @include('admin.tournaments._form')
                    <div class="pt-2">
                        <button type="submit"
                                class="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 rounded-md">
                            {{ __('admin.save') }}
                        </button>
                        <a href="{{ route('admin.tournaments.index') }}" class="ml-4 text-gray-500 hover:text-gray-700 text-sm">
                            Abbrechen
                        </a>
                    </div>
                </form>
            </div>

            {{-- API-Token-Bereich --}}
            <div class="bg-white rounded-lg shadow p-6">
                <h3 class="font-semibold text-gray-700 mb-3">{{ __('admin.api_token') }}</h3>
                @if(session('api_token'))
                    <div class="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3">
                        <p class="text-xs text-yellow-700 mb-1">Token (einmalig sichtbar — jetzt kopieren!):</p>
                        <code class="text-sm font-mono break-all">{{ session('api_token') }}</code>
                    </div>
                @else
                    <p class="text-sm text-gray-500 mb-3">
                        {{ $tournament->api_token ? '● ● ● ● ●  (gesetzt)' : '(kein Token)' }}
                    </p>
                @endif
                <form method="POST" action="{{ route('admin.tournaments.generate-token', $tournament) }}"
                      onsubmit="return !{{ $tournament->api_token ? 'true' : 'false' }} || confirm('{{ __('admin.token_warning') }}')">
                    @csrf
                    <button type="submit"
                            class="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-md">
                        {{ $tournament->api_token ? __('admin.regenerate_token') : __('admin.generate_token') }}
                    </button>
                </form>
            </div>
        </div>
    </div>
</x-app-layout>
