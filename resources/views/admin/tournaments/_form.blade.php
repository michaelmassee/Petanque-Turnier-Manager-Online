<div>
    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.name') }} *</label>
    <input type="text" name="name" value="{{ old('name', $tournament->name ?? '') }}" required
           class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('name') border-red-400 @enderror">
    @error('name') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
</div>

@if(auth()->user()->isAdmin())
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('admin.tournament_owner') }} *</label>
        <select name="created_by" required
                class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500 @error('created_by') border-red-400 @enderror">
            @foreach($owners as $owner)
                <option value="{{ $owner->id }}" {{ (int) old('created_by', $tournament->created_by ?? auth()->id()) === $owner->id ? 'selected' : '' }}>
                    {{ $owner->name }} ({{ $owner->email }})
                </option>
            @endforeach
        </select>
        @error('created_by') <p class="text-xs text-red-600 mt-1">{{ $message }}</p> @enderror
    </div>
@endif

<div class="grid grid-cols-2 gap-4">
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.date') }} *</label>
        <input type="date" name="date" value="{{ old('date', isset($tournament) ? $tournament->date->format('Y-m-d') : '') }}" required
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.location') }} *</label>
        <input type="text" name="location" value="{{ old('location', $tournament->location ?? '') }}" required
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
    </div>
</div>

<div class="grid grid-cols-2 gap-4">
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.type') }} *</label>
        <select name="type" required class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
            @foreach($types as $type)
                <option value="{{ $type->value }}" {{ old('type', $tournament->type->value ?? '') === $type->value ? 'selected' : '' }}>
                    {{ $type->label() }}
                </option>
            @endforeach
        </select>
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.formation') }} *</label>
        <select name="formation" required class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
            @foreach($formations as $formation)
                <option value="{{ $formation->value }}" {{ old('formation', $tournament->formation->value ?? '') === $formation->value ? 'selected' : '' }}>
                    {{ $formation->label() }}
                </option>
            @endforeach
        </select>
    </div>
</div>

<div class="grid grid-cols-2 gap-4">
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.status') }} *</label>
        <select name="status" required class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
            @foreach($statuses as $status)
                <option value="{{ $status->value }}" {{ old('status', $tournament->status->value ?? 'draft') === $status->value ? 'selected' : '' }}>
                    {{ $status->label() }}
                </option>
            @endforeach
        </select>
    </div>
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.max_registrations') }}</label>
        <input type="number" name="max_registrations" min="0"
               value="{{ old('max_registrations', $tournament->max_registrations ?? 0) }}"
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
    </div>
</div>

<div class="grid grid-cols-2 gap-4">
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.registration_deadline') }}</label>
        <input type="datetime-local" name="registration_deadline"
               value="{{ old('registration_deadline', isset($tournament) && $tournament->registration_deadline ? $tournament->registration_deadline->format('Y-m-d\TH:i') : '') }}"
               class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">
    </div>
</div>

<div>
    <label class="block text-sm font-medium text-gray-700 mb-1">{{ __('tournaments.fields.description') }}</label>
    <textarea name="description" rows="3"
              class="w-full border-gray-300 rounded-md shadow-sm focus:ring-green-500 focus:border-green-500">{{ old('description', $tournament->description ?? '') }}</textarea>
</div>

@php
    $requiredFields = old('required_fields', data_get($tournament ?? null, 'config.required_fields', []));
    $manualConfirmation = old('manual_confirmation', data_get($tournament ?? null, 'config.manual_confirmation', false));
    $allowWaitlist = old('allow_waitlist', data_get($tournament ?? null, 'config.allow_waitlist', false));
@endphp

<div class="space-y-4">
    <div>
        <p class="block text-sm font-medium text-gray-700 mb-2">{{ __('tournaments.fields.required_participant_fields') }}</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            @foreach(['club', 'license_nr', 'team_name', 'partner_email', 'partner2_email'] as $field)
                <label class="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox"
                           name="required_fields[]"
                           value="{{ $field }}"
                           {{ in_array($field, $requiredFields, true) ? 'checked' : '' }}
                           class="rounded border-gray-300 text-green-600 focus:ring-green-500">
                    <span>{{ __('tournaments.registration_requirements.' . $field) }}</span>
                </label>
            @endforeach
        </div>
    </div>

    <label class="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox"
               name="manual_confirmation"
               value="1"
               {{ $manualConfirmation ? 'checked' : '' }}
               class="rounded border-gray-300 text-green-600 focus:ring-green-500">
        <span>{{ __('tournaments.fields.manual_confirmation') }}</span>
    </label>

    <label class="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox"
               name="allow_waitlist"
               value="1"
               {{ $allowWaitlist ? 'checked' : '' }}
               class="rounded border-gray-300 text-green-600 focus:ring-green-500">
        <span>{{ __('tournaments.fields.allow_waitlist') }}</span>
    </label>
</div>
