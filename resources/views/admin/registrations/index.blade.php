<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-800">
                {{ __('admin.registrations') }}: {{ $tournament->name }}
            </h2>
            <a href="{{ route('admin.tournaments.registrations.export', $tournament) }}"
               class="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md">
                ⬇ {{ __('admin.export_csv') }}
            </a>
        </div>
    </x-slot>

    <div class="py-6">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

            @if(session('success'))
                <div class="mb-4 rounded-md bg-green-50 border border-green-200 p-4 text-green-800">{{ session('success') }}</div>
            @endif

            <div class="grid grid-cols-4 gap-4 mb-6">
                <div class="bg-white rounded-lg border border-gray-200 p-4 text-center">
                    <div class="text-2xl font-bold text-gray-800">{{ $registrations->count() }}</div>
                    <div class="text-xs text-gray-500 mt-1">{{ __('admin.total_registrations') }}</div>
                </div>
                <div class="bg-white rounded-lg border border-green-200 p-4 text-center">
                    <div class="text-2xl font-bold text-green-700">{{ $registrations->where('status.value', 'confirmed')->count() }}</div>
                    <div class="text-xs text-gray-500 mt-1">{{ __('admin.confirmed_registrations') }}</div>
                </div>
                <div class="bg-white rounded-lg border border-yellow-200 p-4 text-center">
                    <div class="text-2xl font-bold text-yellow-700">{{ $registrations->where('status.value', 'pending')->count() }}</div>
                    <div class="text-xs text-gray-500 mt-1">{{ __('admin.pending_registrations') }}</div>
                </div>
                <div class="bg-white rounded-lg border border-orange-200 p-4 text-center">
                    <div class="text-2xl font-bold text-orange-700">{{ $registrations->where('status.value', 'waitlist')->count() }}</div>
                    <div class="text-xs text-gray-500 mt-1">{{ __('admin.waitlist_registrations') }}</div>
                </div>
            </div>

            @if($registrations->isEmpty())
                <p class="text-gray-500">{{ __('admin.no_registrations') }}</p>
            @else
                <div class="bg-white rounded-lg shadow overflow-hidden">
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                            <tr>
                                <th class="px-4 py-3 text-left">{{ __('registrations.fields.last_name') }}</th>
                                <th class="px-4 py-3 text-left">{{ __('registrations.fields.email') }}</th>
                                <th class="px-4 py-3 text-left">{{ __('registrations.fields.club') }}</th>
                                <th class="px-4 py-3 text-center">{{ __('registrations.fields.status') ?? 'Status' }}</th>
                                <th class="px-4 py-3 text-center">{{ __('admin.seeding_position') }}</th>
                                <th class="px-4 py-3 text-center">{{ __('admin.ptm_player_nr') }}</th>
                                <th class="px-4 py-3 text-right">{{ __('admin.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            @foreach($registrations as $reg)
                                <tr>
                                    <td class="px-4 py-3 font-medium">
                                        {{ $reg->vollstaendigerName() }}
                                        @if($reg->partner_last_name)
                                            <div class="text-xs text-gray-400">{{ $reg->partner_first_name }} {{ $reg->partner_last_name }}</div>
                                        @endif
                                        @if($reg->partner2_last_name)
                                            <div class="text-xs text-gray-400">{{ $reg->partner2_first_name }} {{ $reg->partner2_last_name }}</div>
                                        @endif
                                    </td>
                                    <td class="px-4 py-3 text-gray-500">{{ $reg->email }}</td>
                                    <td class="px-4 py-3 text-gray-500">{{ $reg->club ?? '–' }}</td>
                                    <td class="px-4 py-3 text-center">
                                        <form method="POST" action="{{ route('admin.registrations.status', $reg) }}">
                                            @csrf @method('PATCH')
                                            <select name="status" onchange="this.form.submit()"
                                                    class="text-xs border-gray-300 rounded focus:ring-green-500">
                                                @foreach(\App\Enums\RegistrationStatus::cases() as $s)
                                                    <option value="{{ $s->value }}" {{ $reg->status === $s ? 'selected' : '' }}>
                                                        {{ $s->label() }}
                                                    </option>
                                                @endforeach
                                            </select>
                                        </form>
                                    </td>
                                    <td class="px-4 py-3 text-center">
                                        <form method="POST" action="{{ route('admin.registrations.seeding', $reg) }}"
                                              class="flex gap-1 justify-center">
                                            @csrf @method('PATCH')
                                            <input type="number" name="seeding_position" min="1"
                                                   value="{{ $reg->seeding_position }}"
                                                   class="w-16 text-xs text-center border-gray-300 rounded focus:ring-green-500"
                                                   onchange="this.form.submit()">
                                        </form>
                                    </td>
                                    <td class="px-4 py-3 text-center">
                                        <form method="POST" action="{{ route('admin.registrations.seeding', $reg) }}"
                                              class="flex gap-1 justify-center">
                                            @csrf @method('PATCH')
                                            <input type="number" name="ptm_player_nr" min="1"
                                                   value="{{ $reg->ptm_player_nr }}"
                                                   class="w-16 text-xs text-center border-gray-300 rounded focus:ring-green-500"
                                                   onchange="this.form.submit()">
                                        </form>
                                    </td>
                                    <td class="px-4 py-3 text-right text-xs text-gray-400">
                                        {{ $reg->registered_at->format('d.m.Y H:i') }}
                                    </td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        </div>
    </div>
</x-app-layout>
