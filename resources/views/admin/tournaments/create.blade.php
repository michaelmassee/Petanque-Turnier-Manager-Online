<x-app-layout>
    <x-slot name="header">
        <h2 class="text-xl font-semibold text-gray-800">{{ __('admin.new_tournament') }}</h2>
    </x-slot>

    <div class="py-6">
        <div class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="bg-white rounded-lg shadow p-6">
                <form method="POST" action="{{ route('admin.tournaments.store') }}" class="space-y-5">
                    @csrf
                    @include('admin.tournaments._form')
                    <div class="pt-2">
                        <button type="submit"
                                class="bg-green-600 hover:bg-green-700 text-white font-medium px-6 py-2 rounded-md">
                            {{ __('admin.save') }}
                        </button>
                        <a href="{{ route('admin.tournaments.index') }}" class="ml-4 text-gray-500 hover:text-gray-700 text-sm">
                            Abbrechen
                        </a>
                    </div>
                </form>
            </div>
        </div>
    </div>
</x-app-layout>
