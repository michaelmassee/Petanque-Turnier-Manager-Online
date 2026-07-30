<x-mobile-layout :title="__('mobile.my_tournaments.title')">

<div class="space-y-6">
    <div>
        <h1 class="text-xl font-bold mb-3">{{ __('mobile.my_tournaments.registrations_title') }}</h1>

        <div class="space-y-3">
            @forelse($registrations as $registration)
                <article class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                    <div class="flex items-center justify-between gap-2">
                        <a href="{{ mroute('tournaments.show', ['tournament' => $registration->tournament->id]) }}"
                           class="font-semibold text-gray-950">{{ $registration->tournament->name }}</a>
                        <span class="rounded-full px-2 py-0.5 text-xs
                            {{ $registration->status->color() === 'green' ? 'bg-green-100 text-green-800' :
                               ($registration->status->color() === 'orange' ? 'bg-orange-100 text-orange-800' :
                               ($registration->status->color() === 'red' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800')) }}">
                            {{ $registration->status->label() }}
                        </span>
                    </div>
                    <div class="mt-1 text-sm text-gray-600">
                        📅 {{ $registration->tournament->date->format('d.m.Y') }} · 📍 {{ $registration->tournament->location }}
                    </div>
                </article>
            @empty
                <p class="rounded-lg border border-gray-200 bg-white p-5 text-gray-500 text-sm">{{ __('mobile.my_tournaments.no_registrations') }}</p>
            @endforelse
        </div>
    </div>

    @if($ownedTournaments->isNotEmpty())
        <div>
            <h2 class="text-xl font-bold mb-3">{{ __('mobile.my_tournaments.owned_title') }}</h2>
            <div class="space-y-3">
                @foreach($ownedTournaments as $tournament)
                    <article class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                        <div class="flex items-center justify-between gap-2">
                            <a href="{{ mroute('tournaments.show', ['tournament' => $tournament->id]) }}"
                               class="font-semibold text-gray-950">{{ $tournament->name }}</a>
                            <span class="rounded-full px-2 py-0.5 text-xs
                                {{ $tournament->status->color() === 'green' ? 'bg-green-100 text-green-800' :
                                   ($tournament->status->color() === 'blue' ? 'bg-blue-100 text-blue-800' :
                                   ($tournament->status->color() === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')) }}">
                                {{ $tournament->status->label() }}
                            </span>
                        </div>
                        <div class="mt-1 text-sm text-gray-600">
                            📅 {{ $tournament->date->format('d.m.Y') }} · 📍 {{ $tournament->location }}
                        </div>
                    </article>
                @endforeach
            </div>
        </div>
    @endif
</div>

</x-mobile-layout>
