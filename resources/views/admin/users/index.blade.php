<x-app-layout>
    <x-slot name="header">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold text-gray-800">{{ __('admin.users') }}</h2>
            <a href="{{ route('admin.users.create') }}"
               class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700">
                + {{ __('admin.new_user') }}
            </a>
        </div>
    </x-slot>

    <div class="py-6">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            @if(session('success'))
                <div class="mb-4 rounded-md bg-green-50 border border-green-200 p-4 text-green-800">{{ session('success') }}</div>
            @endif
            @if(session('error'))
                <div class="mb-4 rounded-md bg-red-50 border border-red-200 p-4 text-red-800">{{ session('error') }}</div>
            @endif

            <form method="GET" action="{{ route('admin.users.index') }}" class="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                <input type="search" name="search" value="{{ $filters['search'] ?? '' }}"
                       placeholder="{{ __('admin.search_users') }}"
                       class="border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 md:col-span-2">
                <select name="role" class="border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
                    <option value="">{{ __('admin.all_roles') }}</option>
                    @foreach($roles as $role => $label)
                        <option value="{{ $role }}" @selected(($filters['role'] ?? '') === $role)>{{ $label }}</option>
                    @endforeach
                </select>
                <div class="flex gap-2">
                    <select name="approval" class="min-w-0 flex-1 border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
                        <option value="">{{ __('admin.all_approval_statuses') }}</option>
                        <option value="pending" @selected(($filters['approval'] ?? '') === 'pending')>{{ __('admin.pending_approval') }}</option>
                        <option value="approved" @selected(($filters['approval'] ?? '') === 'approved')>{{ __('admin.approved') }}</option>
                    </select>
                    <button class="px-4 py-2 bg-gray-800 text-white rounded-md text-sm font-semibold hover:bg-gray-700">
                        {{ __('admin.filter') }}
                    </button>
                </div>
            </form>

            <div class="bg-white rounded-lg shadow overflow-hidden">
                <table class="w-full text-sm">
                    <thead class="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                        <tr>
                            <th class="px-4 py-3 text-left">{{ __('admin.user_name') }}</th>
                            <th class="px-4 py-3 text-left">{{ __('admin.user_email') }}</th>
                            <th class="px-4 py-3 text-left">{{ __('admin.user_club') }}</th>
                            <th class="px-4 py-3 text-left">{{ __('admin.user_license_nr') }}</th>
                            <th class="px-4 py-3 text-left">{{ __('admin.roles') }}</th>
                            <th class="px-4 py-3 text-left">{{ __('admin.email_verified') }}</th>
                            <th class="px-4 py-3 text-left">{{ __('admin.approval_status') }}</th>
                            <th class="px-4 py-3 text-right">{{ __('admin.tournaments') }}</th>
                            <th class="px-4 py-3 text-right">{{ __('admin.actions') }}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-100">
                        @forelse($users as $user)
                            <tr>
                                <td class="px-4 py-3 font-medium">{{ $user->name }}</td>
                                <td class="px-4 py-3 text-gray-500">{{ $user->email }}</td>
                                <td class="px-4 py-3 text-gray-500">{{ $user->club ?: '–' }}</td>
                                <td class="px-4 py-3 text-gray-500">{{ $user->license_nr ?: '–' }}</td>
                                <td class="px-4 py-3 text-gray-500">
                                    {{ collect($user->roles ?? [])->map(fn (string $role) => __('admin.role_' . $role))->implode(', ') }}
                                </td>
                                <td class="px-4 py-3">
                                    {{ $user->hasVerifiedEmail() ? __('admin.yes') : __('admin.no') }}
                                </td>
                                <td class="px-4 py-3">
                                    <span class="text-xs px-2 py-0.5 rounded-full {{ $user->isApproved() ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800' }}">
                                        {{ $user->isApproved() ? __('admin.approved') : __('admin.pending_approval') }}
                                    </span>
                                </td>
                                <td class="px-4 py-3 text-right text-gray-500">{{ $user->tournaments_count }}</td>
                                <td class="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                                    <a href="{{ route('admin.users.edit', $user) }}"
                                       class="text-gray-600 hover:underline text-xs">{{ __('admin.edit_user') }}</a>
                                    @if($user->isTurnierverwalter() && $user->isApproved())
                                        <form method="POST" action="{{ route('admin.users.revoke', $user) }}" class="inline">
                                            @csrf @method('PATCH')
                                            <button class="text-red-500 hover:underline text-xs">{{ __('admin.revoke_approval') }}</button>
                                        </form>
                                    @elseif($user->isTurnierverwalter())
                                        <form method="POST" action="{{ route('admin.users.approve', $user) }}" class="inline">
                                            @csrf @method('PATCH')
                                            <button class="text-green-600 hover:underline text-xs">{{ __('admin.approve_user') }}</button>
                                        </form>
                                    @endif
                                    @unless($user->is(auth()->user()))
                                        <form method="POST" action="{{ route('admin.users.destroy', $user) }}"
                                              class="inline"
                                              onsubmit="return confirm('{{ __('admin.confirm_delete_user') }}')">
                                            @csrf @method('DELETE')
                                            <button class="text-red-500 hover:underline text-xs">{{ __('admin.delete') }}</button>
                                        </form>
                                    @endunless
                                </td>
                            </tr>
                        @empty
                            <tr><td colspan="9" class="px-4 py-6 text-center text-gray-400">–</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>

            <div class="mt-4">{{ $users->links() }}</div>
        </div>
    </div>
</x-app-layout>
