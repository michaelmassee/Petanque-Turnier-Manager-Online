<x-public-layout :title="__('registrations.subtitle', ['tournament' => $tournament->name])">

<div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold mb-2">{{ __('registrations.title') }}</h1>
    <p class="text-gray-500 mb-6">{{ __('registrations.subtitle', ['tournament' => $tournament->name]) }}</p>

    <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <form method="POST"
              action="{{ route('public.tournaments.store', ['locale' => app()->getLocale(), 'tournament' => $tournament]) }}"
              class="space-y-6">
            @csrf

            {{-- Spieler 1 --}}
            <div>
                <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
                    @if($tournament->formation->spielerAnzahl() > 1)
                        {{ __('registrations.fields.partner') }} 1
                    @else
                        {{ __('registrations.title') }}
                    @endif
                </h2>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.first_name') }} *</label>
                        <input type="text" name="first_name" value="{{ old('first_name') }}" required
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('first_name') border-red-400 @enderror">
                        @error('first_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.last_name') }} *</label>
                        <input type="text" name="last_name" value="{{ old('last_name') }}" required
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('last_name') border-red-400 @enderror">
                        @error('last_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                    </div>
                </div>
                <div class="mt-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.email') }} *</label>
                    <input type="email" name="email" value="{{ old('email') }}" required
                           class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('email') border-red-400 @enderror">
                    @error('email') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                </div>
                <div class="grid grid-cols-2 gap-4 mt-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.club') }}</label>
                        <input type="text" name="club" value="{{ old('club') }}"
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.license_nr') }}</label>
                        <input type="text" name="license_nr" value="{{ old('license_nr') }}"
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
                    </div>
                </div>
            </div>

            {{-- Spieler 2 --}}
            @if($tournament->formation->spielerAnzahl() >= 2)
                <hr class="border-gray-200">
                <div>
                    <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">{{ __('registrations.fields.partner') }} 2</h2>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.first_name') }} *</label>
                            <input type="text" name="partner_first_name" value="{{ old('partner_first_name') }}" required
                                   class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner_first_name') border-red-400 @enderror">
                            @error('partner_first_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.last_name') }} *</label>
                            <input type="text" name="partner_last_name" value="{{ old('partner_last_name') }}" required
                                   class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner_last_name') border-red-400 @enderror">
                            @error('partner_last_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                        </div>
                    </div>
                    <div class="mt-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.email') }}</label>
                        <input type="email" name="partner_email" value="{{ old('partner_email') }}"
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
                    </div>
                </div>
            @endif

            {{-- Spieler 3 --}}
            @if($tournament->formation->spielerAnzahl() >= 3)
                <hr class="border-gray-200">
                <div>
                    <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">{{ __('registrations.fields.partner2') }}</h2>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.first_name') }} *</label>
                            <input type="text" name="partner2_first_name" value="{{ old('partner2_first_name') }}" required
                                   class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner2_first_name') border-red-400 @enderror">
                            @error('partner2_first_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.last_name') }} *</label>
                            <input type="text" name="partner2_last_name" value="{{ old('partner2_last_name') }}" required
                                   class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner2_last_name') border-red-400 @enderror">
                            @error('partner2_last_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                        </div>
                    </div>
                    <div class="mt-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.email') }}</label>
                        <input type="email" name="partner2_email" value="{{ old('partner2_email') }}"
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
                    </div>
                </div>
            @endif

            {{-- Teamname (nur bei Doublette/Triplette) --}}
            @if($tournament->formation->spielerAnzahl() > 1)
                <hr class="border-gray-200">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.team_name') }}</label>
                    <input type="text" name="team_name" value="{{ old('team_name') }}"
                           class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
                </div>
            @endif

            <div class="pt-2">
                <button type="submit"
                        class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-md transition-colors">
                    {{ __('registrations.submit') }}
                </button>
            </div>
        </form>
    </div>
</div>

</x-public-layout>
