<x-public-layout :title="__('tournaments.title')">

<section id="tournaments" class="space-y-5">
    <div>
        <h1 class="text-2xl font-bold">{{ __('tournaments.list_titles.' . $filters['period']) }}</h1>
    </div>

    <form method="GET" action="{{ lroute('tournaments.index') }}"
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div class="sm:col-span-2 lg:col-span-2">
                <label for="q" class="block text-sm font-medium text-gray-700">{{ __('tournaments.filters.search') }}</label>
                <input id="q" name="q" type="search" value="{{ $filters['q'] }}"
                       class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                       placeholder="{{ __('tournaments.filters.search_placeholder') }}">
            </div>
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
            <div>
                <label for="formation" class="block text-sm font-medium text-gray-700">{{ __('tournaments.filters.formation') }}</label>
                <select id="formation" name="formation"
                        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500">
                    <option value="">{{ __('tournaments.filters.all_formations') }}</option>
                    @foreach(['tete', 'doublette', 'triplette'] as $formation)
                        <option value="{{ $formation }}" @selected($filters['formation'] === $formation)>
                            {{ __('tournaments.formation.' . $formation) }}
                        </option>
                    @endforeach
                </select>
            </div>
            <div class="sm:col-span-2 lg:col-span-2">
                <label for="location" class="block text-sm font-medium text-gray-700">{{ __('tournaments.filters.location') }}</label>
                <input id="location" name="location" type="search" value="{{ $filters['location'] }}"
                       class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-green-500 focus:ring-green-500"
                       placeholder="{{ __('tournaments.filters.location_placeholder') }}">
            </div>
            @auth
                <div class="flex items-end">
                    <label for="mine" class="flex min-h-11 w-full items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">
                        <input id="mine" name="mine" value="1" type="checkbox" @checked($filters['mine'])
                               class="rounded border-gray-300 text-green-600 shadow-sm focus:ring-green-500">
                        <span>{{ __('tournaments.filters.mine') }}</span>
                    </label>
                </div>
            @endauth
        </div>

        <div class="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <a href="{{ lroute('tournaments.index') }}"
               class="inline-flex min-h-11 items-center justify-center rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
                {{ __('tournaments.filters.reset') }}
            </a>
            <button type="submit"
                    class="inline-flex min-h-11 items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                {{ __('tournaments.filters.apply') }}
            </button>
        </div>
    </form>

    <div class="space-y-4">
        @forelse($tournaments as $tournament)
            <x-tournament-card
                :tournament="$tournament"
                :register-url="$tournament->isRegistrationOpen() ? lroute('tournaments.register', ['tournament' => $tournament->id]) : null"
                :ranking-url="lroute('tournaments.ranking', ['tournament' => $tournament->id])" />
        @empty
            <p class="rounded-lg border border-gray-200 bg-white p-5 text-gray-500">{{ __('tournaments.no_tournaments') }}</p>
        @endforelse
    </div>

    {{ $tournaments->links() }}
</section>

</x-public-layout>
