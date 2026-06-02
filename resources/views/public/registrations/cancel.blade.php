<x-public-layout :title="__('registrations.cancel_link')">
<div class="max-w-md mx-auto">
    <div class="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-center">
        <div class="text-4xl mb-4">⚠️</div>
        <h1 class="text-xl font-semibold mb-2">{{ __('registrations.confirm_cancel') }}</h1>
        <p class="text-gray-600 mb-2">{{ $registration->vollstaendigerName() }}</p>
        <p class="text-gray-500 text-sm mb-6">{{ $registration->tournament->name }}</p>
        <div class="flex justify-center gap-4">
            <form method="POST" action="{{ lroute('registration.cancel', $registration->token) }}">
                @csrf
                <button type="submit"
                        class="bg-red-600 hover:bg-red-700 text-white font-medium px-5 py-2 rounded-md">
                    {{ __('registrations.yes_cancel') }}
                </button>
            </form>
            <a href="{{ lroute('tournaments.index') }}"
               class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-5 py-2 rounded-md">
                {{ __('registrations.no_back') }}
            </a>
        </div>
    </div>
</div>
</x-public-layout>
