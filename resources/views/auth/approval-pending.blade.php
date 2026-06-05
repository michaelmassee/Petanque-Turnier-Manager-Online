<x-guest-layout>
    <div class="mb-4 text-sm text-gray-600">
        {{ __('admin.approval_pending_text') }}
    </div>

    <form method="POST" action="{{ route('logout') }}">
        @csrf
        <x-primary-button>
            {{ __('Log Out') }}
        </x-primary-button>
    </form>
</x-guest-layout>
