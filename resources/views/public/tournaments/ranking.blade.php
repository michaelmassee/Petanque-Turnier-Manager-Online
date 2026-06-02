<x-public-layout :title="__('tournaments.ranking.title', ['name' => $tournament->name])">

<div class="flex items-center justify-between mb-6">
    <div>
        <h1 class="text-2xl font-bold">{{ __('tournaments.ranking.title', ['name' => $tournament->name]) }}</h1>
        @if($latestResult)
            <p class="text-sm text-gray-500 mt-1">{{ __('tournaments.ranking.round', ['round' => $latestResult->round]) }}</p>
        @endif
    </div>
    <a href="{{ lroute('tournaments.index') }}" class="text-sm text-gray-500 hover:text-gray-700">← Zurück</a>
</div>

@if($latestResult && count($latestResult->data) > 0)
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                <tr>
                    <th class="px-4 py-3 text-right w-12">{{ __('tournaments.ranking.place') }}</th>
                    <th class="px-4 py-3 text-left">{{ __('tournaments.ranking.player') }}</th>
                    <th class="px-4 py-3 text-left hidden sm:table-cell">{{ __('tournaments.ranking.club') }}</th>
                    <th class="px-4 py-3 text-right">{{ __('tournaments.ranking.wins') }}</th>
                    <th class="px-4 py-3 text-right">{{ __('tournaments.ranking.points') }}</th>
                    <th class="px-4 py-3 text-right hidden sm:table-cell">{{ __('tournaments.ranking.diff') }}</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
                @foreach($latestResult->data as $index => $entry)
                    <tr class="{{ $index % 2 === 0 ? '' : 'bg-gray-50' }}">
                        <td class="px-4 py-3 text-right font-medium text-gray-500">{{ $index + 1 }}</td>
                        <td class="px-4 py-3 font-medium">{{ $entry['name'] ?? '–' }}</td>
                        <td class="px-4 py-3 text-gray-500 hidden sm:table-cell">{{ $entry['club'] ?? '' }}</td>
                        <td class="px-4 py-3 text-right">{{ $entry['wins'] ?? 0 }}</td>
                        <td class="px-4 py-3 text-right">{{ $entry['points'] ?? 0 }}</td>
                        <td class="px-4 py-3 text-right text-gray-500 hidden sm:table-cell">{{ $entry['diff'] ?? 0 }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    </div>
    <p class="text-xs text-gray-400 mt-3 text-right">
        {{ __('Aktualisiert') }}: {{ $latestResult->updated_at->format('d.m.Y H:i') }}
        <span class="ml-2 cursor-pointer text-green-600 hover:underline" onclick="location.reload()">↻</span>
    </p>
@else
    <div class="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
        {{ __('tournaments.ranking.no_results') }}
    </div>
@endif

</x-public-layout>
