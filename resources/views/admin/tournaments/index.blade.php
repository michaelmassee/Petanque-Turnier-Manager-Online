<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-800">{{ __('admin.tournaments') }}</h2>
            <a href="{{ route('admin.tournaments.create') }}"
               class="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-md">
                + {{ __('admin.new_tournament') }}
            </a>
        </div>
    </x-slot>

    <div class="py-6">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            @if(session('success'))
                <div class="mb-4 rounded-md bg-green-50 border border-green-200 p-4 text-green-800">{{ session('success') }}</div>
            @endif

            <div class="bg-white rounded-lg shadow overflow-hidden">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                        <tr>
                            <th class="px-4 py-3 text-left">{{ __('tournaments.fields.name') }}</th>
                            <th class="px-4 py-3 text-left">{{ __('tournaments.fields.date') }}</th>
                            @if(auth()->user()->isAdmin())
                                <th class="px-4 py-3 text-left">{{ __('admin.tournament_owner') }}</th>
                            @endif
                            <th class="px-4 py-3 text-left">{{ __('tournaments.fields.type') }}</th>
                            <th class="px-4 py-3 text-left">{{ __('tournaments.fields.status') }}</th>
                            <th class="px-4 py-3 text-right">{{ __('admin.confirmed_registrations') }}</th>
                            <th class="px-4 py-3 text-right">{{ __('admin.actions') }}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        @forelse($tournaments as $tournament)
                            <tr>
                                <td class="px-4 py-3 font-medium">{{ $tournament->name }}</td>
                                <td class="px-4 py-3 text-gray-500">{{ $tournament->date->format('d.m.Y') }}</td>
                                @if(auth()->user()->isAdmin())
                                    <td class="px-4 py-3 text-gray-500">{{ $tournament->creator?->name ?? '–' }}</td>
                                @endif
                                <td class="px-4 py-3 text-gray-500">{{ $tournament->type->label() }}</td>
                                <td class="px-4 py-3">
                                    <span class="text-xs px-2 py-0.5 rounded-full
                                        {{ $tournament->status->color() === 'green' ? 'bg-green-100 text-green-800' :
                                           ($tournament->status->color() === 'blue' ? 'bg-blue-100 text-blue-800' :
                                           ($tournament->status->color() === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700')) }}">
                                        {{ $tournament->status->label() }}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-right">{{ $tournament->confirmedCount() }}</td>
                                <td class="px-4 py-3 text-right space-x-2">
                                    <a href="{{ route('admin.tournaments.registrations', $tournament) }}"
                                       class="text-blue-600 hover:underline text-xs">{{ __('admin.registrations') }}</a>
                                    <a href="{{ route('admin.tournaments.edit', $tournament) }}"
                                       class="text-gray-600 hover:underline text-xs">{{ __('admin.edit_tournament') }}</a>
                                    <form method="POST" action="{{ route('admin.tournaments.destroy', $tournament) }}"
                                          class="inline"
                                          onsubmit="return confirm('{{ __('admin.confirm_delete') }}')">
                                        @csrf @method('DELETE')
                                        <button class="text-red-500 hover:underline text-xs">{{ __('admin.delete') }}</button>
                                    </form>
                                </td>
                            </tr>
                        @empty
                            <tr><td colspan="{{ auth()->user()->isAdmin() ? 7 : 6 }}" class="px-4 py-6 text-center text-gray-400">–</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            <div class="mt-4">{{ $tournaments->links() }}</div>
        </div>
    </div>
</x-app-layout>
