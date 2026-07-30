<x-mobile-layout :title="__('tournaments.title')">

<div class="space-y-4">
    <h1 class="text-xl font-bold">{{ __('tournaments.list_titles.' . $filters['period']) }}</h1>

    <form method="GET" action="{{ mroute('tournaments.search') }}"
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <div>
            <label for="q" class="block text-sm font-medium text-gray-700">{{ __('tournaments.filters.search') }}</label>
            <input id="q" name="q" type="search" value="{{ $filters['q'] }}"
                   class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                   placeholder="{{ __('tournaments.filters.search_placeholder') }}">
        </div>
        <div class="grid grid-cols-2 gap-3">
            <div>
                <label for="status" class="block text-sm font-medium text-gray-700">{{ __('tournaments.filters.status') }}</label>
                <select id="status" name="status"
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500">
                    <option value="">{{ __('tournaments.filters.all_statuses') }}</option>
                    @foreach(['registration', 'running', 'finished'] as $status)
                        <option value="{{ $status }}" @selected($filters['status'] === $status)>
                            {{ __('tournaments.status.' . $status) }}
                        </option>
                    @endforeach
                </select>
            </div>
            <div>
                <label for="period" class="block text-sm font-medium text-gray-700">{{ __('tournaments.filters.period') }}</label>
                <select id="period" name="period"
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500">
                    @foreach(['upcoming', 'past', 'all'] as $period)
                        <option value="{{ $period }}" @selected($filters['period'] === $period)>
                            {{ __('tournaments.filters.periods.' . $period) }}
                        </option>
                    @endforeach
                </select>
            </div>
        </div>

        <div class="flex gap-2">
            <a href="{{ mroute('tournaments.search') }}"
               class="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
                {{ __('tournaments.filters.reset') }}
            </a>
            <button type="submit"
                    class="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                {{ __('tournaments.filters.apply') }}
            </button>
        </div>
    </form>

    <div class="space-y-3">
        @forelse($tournaments as $tournament)
            <x-tournament-card
                :tournament="$tournament"
                :register-url="$tournament->isRegistrationOpen() ? mroute('registrations.create', ['tournament' => $tournament->id]) : null"
                :ranking-url="lroute('tournaments.ranking', ['tournament' => $tournament->id])" />
        @empty
            <p class="rounded-lg border border-gray-200 bg-white p-5 text-gray-500">{{ __('tournaments.no_tournaments') }}</p>
        @endforelse
    </div>

    {{ $tournaments->links() }}
</div>

</x-mobile-layout>
