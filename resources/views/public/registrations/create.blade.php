<x-public-layout :title="__('registrations.subtitle', ['tournament' => $tournament->name])">

@php($requiredFields = $tournament->requiredRegistrationFields())

<div class="max-w-2xl mx-auto">
    <h1 class="text-2xl font-bold mb-2">{{ __('registrations.title') }}</h1>
    <p class="text-gray-500 mb-6">{{ __('registrations.subtitle', ['tournament' => $tournament->name]) }}</p>

    <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <form method="POST"
              action="{{ lroute('tournaments.store', ['tournament' => $tournament->id]) }}"
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
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.club') }} @if(in_array('club', $requiredFields, true)) * @endif</label>
                        <input type="text" name="club" value="{{ old('club') }}" {{ in_array('club', $requiredFields, true) ? 'required' : '' }}
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('club') border-red-400 @enderror">
                        @error('club') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.license_nr') }} @if(in_array('license_nr', $requiredFields, true)) * @endif</label>
                        <input type="text" name="license_nr" value="{{ old('license_nr') }}" {{ in_array('license_nr', $requiredFields, true) ? 'required' : '' }}
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('license_nr') border-red-400 @enderror">
                        @error('license_nr') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                    </div>
                </div>
            </div>

            @if($tournament->formation->spielerAnzahl() >= 2)
                <hr class="border-gray-200">
                <div>
                    <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">{{ __('registrations.fields.partner') }} 2</h2>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.first_name') }} *</label>
                            <input type="text" name="partner_first_name" value="{{ old('partner_first_name') }}" required
                                   class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner_first_name') border-red-400 @enderror">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.last_name') }} *</label>
                            <input type="text" name="partner_last_name" value="{{ old('partner_last_name') }}" required
                                   class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner_last_name') border-red-400 @enderror">
                        </div>
                    </div>
                    <div class="mt-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.email') }} @if(in_array('partner_email', $requiredFields, true)) * @endif</label>
                        <input type="email" name="partner_email" value="{{ old('partner_email') }}" {{ in_array('partner_email', $requiredFields, true) ? 'required' : '' }}
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner_email') border-red-400 @enderror">
                        @error('partner_email') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                    </div>
                </div>
            @endif

            @if($tournament->formation->spielerAnzahl() >= 3)
                <hr class="border-gray-200">
                <div>
                    <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">{{ __('registrations.fields.partner2') }}</h2>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.first_name') }} *</label>
                            <input type="text" name="partner2_first_name" value="{{ old('partner2_first_name') }}" required
                                   class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner2_first_name') border-red-400 @enderror">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.last_name') }} *</label>
                            <input type="text" name="partner2_last_name" value="{{ old('partner2_last_name') }}" required
                                   class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner2_last_name') border-red-400 @enderror">
                        </div>
                    </div>
                    <div class="mt-4">
                        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.email') }} @if(in_array('partner2_email', $requiredFields, true)) * @endif</label>
                        <input type="email" name="partner2_email" value="{{ old('partner2_email') }}" {{ in_array('partner2_email', $requiredFields, true) ? 'required' : '' }}
                               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('partner2_email') border-red-400 @enderror">
                        @error('partner2_email') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                    </div>
                </div>
            @endif

            @if($tournament->formation->spielerAnzahl() > 1)
                <hr class="border-gray-200">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('registrations.fields.team_name') }} @if(in_array('team_name', $requiredFields, true)) * @endif</label>
                    <input type="text" name="team_name" value="{{ old('team_name') }}" {{ in_array('team_name', $requiredFields, true) ? 'required' : '' }}
                           class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('team_name') border-red-400 @enderror">
                    @error('team_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
                </div>
            @endif

            <div class="rounded-md bg-gray-50 p-4 text-sm text-gray-600">
                {!! __('registrations.privacy_notice', ['privacy_url' => lroute('legal.privacy')]) !!}
            </div>

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
