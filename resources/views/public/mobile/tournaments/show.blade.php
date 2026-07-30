<x-mobile-layout :title="$tournament->name">

<div class="mb-3">
    <a href="{{ mroute('tournaments.search') }}"
       class="text-sm text-gray-500 hover:text-gray-700">← {{ __('tournaments.title') }}</a>
</div>

<div class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
    <div class="flex items-center gap-3 mb-2">
        <h1 class="text-xl font-bold">{{ $tournament->name }}</h1>
        <span class="text-xs px-2 py-0.5 rounded-full
            {{ $tournament->status->color() === 'green' ? 'bg-green-100 text-green-800' :
               ($tournament->status->color() === 'blue' ? 'bg-blue-100 text-blue-800' :
               ($tournament->status->color() === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')) }}">
            {{ $tournament->status->label() }}
        </span>
    </div>
    <div class="text-gray-600 space-y-1 text-sm">
        <div>📅 {{ $tournament->date->format('d.m.Y') }}</div>
        <div>📍 {{ $tournament->location }}</div>
        <div>🏐 {{ $tournament->type->label() }} — {{ $tournament->formation->label() }}</div>
        @if($tournament->registration_deadline)
            <div>⏰ {{ __('tournaments.fields.registration_deadline') }}: {{ $tournament->registration_deadline->format('d.m.Y H:i') }}</div>
        @endif
        @if($tournament->max_registrations > 0)
            <div>👥 {{ $tournament->confirmedCount() }} / {{ $tournament->max_registrations }}</div>
        @endif
    </div>
    @if($tournament->description)
        <p class="mt-4 text-gray-700 text-sm">{{ $tournament->description }}</p>
    @endif

    <div class="mt-5 flex flex-col gap-2">
        @if($tournament->isRegistrationOpen())
            <a href="{{ mroute('registrations.create', ['tournament' => $tournament->id]) }}"
               class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-3 rounded-md text-center">
                {{ __('tournaments.register') }}
            </a>
        @endif
        <a href="{{ lroute('tournaments.ranking', ['tournament' => $tournament->id]) }}"
           class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-5 py-3 rounded-md text-center">
            {{ __('tournaments.zur_rangliste') }}
        </a>
    </div>
</div>

</x-mobile-layout>
