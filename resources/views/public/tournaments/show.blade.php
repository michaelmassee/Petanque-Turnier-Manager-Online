<x-public-layout :title="$tournament->name">

<div class="mb-4">
    <a href="{{ lroute('tournaments.index') }}"
       class="text-sm text-gray-500 hover:text-gray-700">← {{ __('tournaments.title') }}</a>
</div>

<div class="bg-white rounded-lg border border-gray-200 shadow-sm p-6 mb-6">
    <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
            <div class="flex items-center gap-3 mb-2">
                <h1 class="text-2xl font-bold">{{ $tournament->name }}</h1>
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
                <p class="mt-4 text-gray-700">{{ $tournament->description }}</p>
            @endif
        </div>
        <div class="flex flex-col gap-2 shrink-0">
            @if($tournament->isRegistrationOpen())
                <a href="{{ lroute('tournaments.register', ['tournament' => $tournament->id]) }}"
                   class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2 rounded-md text-center">
                    {{ __('tournaments.register') }}
                </a>
            @endif
            <a href="{{ lroute('tournaments.ranking', ['tournament' => $tournament->id]) }}"
               class="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-5 py-2 rounded-md text-center">
                {{ __('tournaments.zur_rangliste') }}
            </a>
        </div>
    </div>
</div>

@if(session('success'))
    <div class="mb-4 rounded-md bg-green-50 border border-green-200 p-4 text-green-800">{{ session('success') }}</div>
@endif
@if(session('error'))
    <div class="mb-4 rounded-md bg-red-50 border border-red-200 p-4 text-red-800">{{ session('error') }}</div>
@endif

</x-public-layout>
