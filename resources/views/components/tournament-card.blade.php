@props(['tournament', 'registerUrl' => null, 'rankingUrl'])

<article class="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
            <div class="mb-2 flex flex-wrap items-center gap-2">
                <h2 class="text-lg font-semibold text-gray-950">{{ $tournament->name }}</h2>
                <span class="rounded-full px-2 py-0.5 text-xs
                    {{ $tournament->status->color() === 'green' ? 'bg-green-100 text-green-800' :
                       ($tournament->status->color() === 'blue' ? 'bg-blue-100 text-blue-800' :
                       ($tournament->status->color() === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')) }}">
                    {{ $tournament->status->label() }}
                </span>
            </div>
            <div class="grid gap-1 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
                <span>{{ __('tournaments.fields.date') }}: {{ $tournament->date->format('d.m.Y') }}</span>
                <span>{{ __('tournaments.fields.location') }}: {{ $tournament->location }}</span>
                <span>{{ __('tournaments.fields.type') }}: {{ $tournament->type->label() }}</span>
                <span>{{ __('tournaments.fields.formation') }}: {{ $tournament->formation->label() }}</span>
            </div>
            @if($tournament->registration_deadline)
                <div class="mt-2 text-xs text-gray-500">
                    {{ __('tournaments.fields.registration_deadline') }}: {{ $tournament->registration_deadline->format('d.m.Y H:i') }}
                </div>
            @endif
        </div>
        <div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            @if($registerUrl && $tournament->isRegistrationOpen())
                <a href="{{ $registerUrl }}"
                   class="inline-flex min-h-11 items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                    {{ __('tournaments.register') }}
                </a>
            @endif
            <a href="{{ $rankingUrl }}"
               class="inline-flex min-h-11 items-center justify-center rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
                {{ __('tournaments.zur_rangliste') }}
            </a>
        </div>
    </div>
</article>
