<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('admin.user_first_name') }} *</label>
        <input type="text" name="first_name" value="{{ old('first_name', $user->first_name) }}" required
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('first_name') border-red-400 @enderror">
        @error('first_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
    </div>

    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('admin.user_last_name') }} *</label>
        <input type="text" name="last_name" value="{{ old('last_name', $user->last_name) }}" required
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('last_name') border-red-400 @enderror">
        @error('last_name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
    </div>
</div>

<div>
    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('admin.user_email') }} *</label>
    <input type="email" name="email" value="{{ old('email', $user->email) }}" required
           class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('email') border-red-400 @enderror">
    @error('email') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
</div>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('admin.user_club') }}</label>
        <input type="text" name="club" value="{{ old('club', $user->club) }}"
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('club') border-red-400 @enderror">
        @error('club') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
    </div>

    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('admin.user_license_nr') }}</label>
        <input type="text" name="license_nr" value="{{ old('license_nr', $user->license_nr) }}"
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('license_nr') border-red-400 @enderror">
        @error('license_nr') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
    </div>
</div>

<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('admin.password') }} {{ isset($editing) ? '' : '*' }}</label>
        <input type="password" name="password" autocomplete="new-password" {{ isset($editing) ? '' : 'required' }}
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('password') border-red-400 @enderror">
        @if(isset($editing))
            <p class="text-xs text-gray-500 mt-1">{{ __('admin.leave_password_blank') }}</p>
        @endif
        @error('password') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
    </div>

    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('admin.password_confirmation') }} {{ isset($editing) ? '' : '*' }}</label>
        <input type="password" name="password_confirmation" autocomplete="new-password" {{ isset($editing) ? '' : 'required' }}
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
    </div>
</div>

<div>
    <p class="block text-sm font-medium text-gray-700 mb-2">{{ __('admin.roles') }} *</p>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        @foreach($roles as $role => $label)
            <label class="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox"
                       name="roles[]"
                       value="{{ $role }}"
                       {{ in_array($role, old('roles', $user->roles ?? []), true) ? 'checked' : '' }}
                       class="rounded border-gray-300 text-green-600 focus:ring-green-500">
                <span>{{ $label }}</span>
            </label>
        @endforeach
    </div>
    @error('roles') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
</div>

<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
    <label class="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox"
               name="approved"
               value="1"
               {{ old('approved', $user->approved_at !== null || $user->isAdmin()) ? 'checked' : '' }}
               class="rounded border-gray-300 text-green-600 focus:ring-green-500">
        <span>{{ __('admin.approved') }}</span>
    </label>

    <label class="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox"
               name="email_verified"
               value="1"
               {{ old('email_verified', $user->email_verified_at !== null) ? 'checked' : '' }}
               class="rounded border-gray-300 text-green-600 focus:ring-green-500">
        <span>{{ __('admin.email_verified') }}</span>
    </label>
</div>

<div class="flex items-center gap-3 pt-2">
    <button class="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700">
        {{ __('admin.save') }}
    </button>
    <a href="{{ route('admin.users.index') }}" class="text-gray-500 hover:text-gray-700 text-sm">
        {{ __('admin.cancel') }}
    </a>
</div>
