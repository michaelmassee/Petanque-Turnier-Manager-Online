<x-public-layout :title="__('tournaments.title')">

<h1 class="text-2xl font-bold mb-6">{{ __('tournaments.upcoming') }}</h1>

@forelse($tournaments as $tournament)
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
            <div class="flex items-center gap-3 mb-1">
                <h2 class="text-lg font-semibold">{{ $tournament->name }}</h2>
                <span class="text-xs px-2 py-0.5 rounded-full
                    {{ $tournament->status->color() === 'green' ? 'bg-green-100 text-green-800' :
                       ($tournament->status->color() === 'blue' ? 'bg-blue-100 text-blue-800' :
                       ($tournament->status->color() === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')) }}">
                    {{ $tournament->status->label() }}
                </span>
            </div>
            <div class="text-sm text-gray-600 space-x-3">
                <span>📅 {{ $tournament->date->format('d.m.Y') }}</span>
                <span>📍 {{ $tournament->location }}</span>
                <span>🏐 {{ $tournament->type->label() }}</span>
                <span>👥 {{ $tournament->formation->label() }}</span>
            </div>
            @if($tournament->registration_deadline)
                <div class="text-xs text-gray-400 mt-1">
                    {{ __('tournaments.fields.registration_deadline') }}: {{ $tournament->registration_deadline->format('d.m.Y H:i') }}
                </div>
            @endif
        </div>
        <div class="flex gap-2 shrink-0">
            @if($tournament->isRegistrationOpen())
                <a href="{{ lroute('tournaments.register', ['tournament' => $tournament->id]) }}"
                   class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-md">
                    {{ __('tournaments.register') }}
                </a>
            @endif
            <a href="{{ lroute('tournaments.ranking', ['tournament' => $tournament->id]) }}"
               class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-md">
                {{ __('tournaments.zur_rangliste') }}
            </a>
        </div>
    </div>
@empty
    <p class="text-gray-500">{{ __('tournaments.no_tournaments') }}</p>
@endforelse

{{ $tournaments->links() }}

</x-public-layout>
